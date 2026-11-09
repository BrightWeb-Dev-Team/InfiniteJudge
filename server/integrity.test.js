import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

const stripZeroWidth = (text) => String(text).replace(/[\u200b\u200c\u200d\u2060]/g, "");

test("integrity: fingerprints, similarities and protected submission flow", { timeout: 60_000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "ij-integrity-"));
  process.env.DB_PATH = resolve(directory, "test.db");
  const { embedFingerprint, readFingerprint, sourceSimilarity, normalizeSource } = await import("./integrity.js");
  const { db } = await import("./db.js");
  const { createSession, hashPassword } = await import("./auth.js");

  await t.test("zero-width fingerprints survive copy without changing the text", () => {
    const statement = "## 描述\n\n读入两个整数并输出它们的和。\n\n## 输入格式\n\n一行两个整数。";
    for (const token of ["a3f09b", "000000", "ffffff", "1a2b3c"]) {
      const marked = embedFingerprint(statement, token);
      assert.equal(readFingerprint(marked), token);
      assert.equal(stripZeroWidth(marked), statement);
    }
    assert.equal(readFingerprint(statement), "");
    assert.equal(embedFingerprint(statement, "not-hex"), statement);
  });

  await t.test("identifier renaming keeps similarity high while independent code stays low", () => {
    const original = `#include <bits/stdc++.h>
using namespace std;
long long query(int l, int r, vector<long long>& pref) { return pref[r] - pref[l - 1]; }
int main() { int n, q; cin >> n >> q; vector<long long> pref(n + 1); for (int i = 1; i <= n; i++) { long long value; cin >> value; pref[i] = pref[i - 1] + value; } while (q--) { int l, r; cin >> l >> r; cout << query(l, r, pref) << endl; } return 0; }`;
    const renamed = original.replace(/query/g, "calc").replace(/\bpref\b/g, "p").replace(/\bvalue\b/g, "v").replace(/\br\b/g, "right");
    const independent = `#include <iostream>
int main() { int a, b; std::cin >> a >> b; std::cout << a * b << std::endl; return 0; }`;
    assert.ok(sourceSimilarity(original, renamed) > 0.8, `renamed ${sourceSimilarity(original, renamed)}`);
    assert.ok(sourceSimilarity(original, independent) < 0.4, `independent ${sourceSimilarity(original, independent)}`);
    assert.notEqual(normalizeSource(original), normalizeSource(independent));
  });

  const password = "integrity-test-password";
  const tokens = {};
  for (const [id, role] of [[200, "user"], [201, "user"], [210, "root"]]) {
    db.prepare("INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)").run(id, `integrity-${id}`, hashPassword(password), role);
    tokens[id] = createSession(id);
  }
  db.prepare("UPDATE problems SET integrity_enabled=1 WHERE id='IJ1001'").run();
  // Domain permissions now gate problem reads and submissions.
  const domainId = Number(db.prepare("INSERT INTO domains(slug,name,owner_id) VALUES('main','主域',210)").run().lastInsertRowid);
  db.prepare("UPDATE problems SET domain_id=? WHERE id='IJ1001'").run(domainId);
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,200,'member')").run(domainId);
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,201,'member')").run(domainId);
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,210,'owner')").run(domainId);
  db.prepare("INSERT OR REPLACE INTO system_settings(key,value) VALUES('installed','true')").run();

  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(port), IJ_DISABLE_LOCAL_JUDGE: "1", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((done, reject) => {
    let output = "";
    child.stdout.on("data", (data) => { output += data; if (output.includes(`http://localhost:${port}`)) done(); });
    child.stderr.on("data", (data) => { output += data; });
    child.once("exit", () => reject(new Error(output)));
  });
  // After startup, finish() resolves and the ready listener stops accumulating;
  // keep streaming for diagnostics and failures.
  // call(path, token, body) and call(method, path, token, body) both work.
  const call = async (a, b, c, d) => {
    const explicit = ["GET", "POST", "PUT", "DELETE"].includes(a);
    const path = explicit ? b : a, token = explicit ? c : b, body = explicit ? d : c;
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: explicit ? a : body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 500) }; }
    return { status: response.status, body: parsed };
  };
  const solution = `#include <iostream>
using namespace std;
long long total(int x, int y) { return (long long)x + y; }
int main() { int a, b; cin >> a >> b; cout << total(a, b) << endl; return 0; }`;

  await t.test("only protected users need a session and the statement comes fingerprinted", async () => {
    const rootStart = await call("/problems/IJ1001/integrity/start", tokens[210], { language: "cpp" });
    assert.equal(rootStart.body.active, false, JSON.stringify(rootStart));
    const started = await call("/problems/IJ1001/integrity/start", tokens[200], { language: "cpp" });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    assert.match(started.body.ban, /COMPUTER USE/);
    assert.equal(readFingerprint(started.body.statement.description), started.body.fingerprint);
    assert.equal(readFingerprint(started.body.statement.input_format), started.body.fingerprint);
    const noSession = await call("/submissions", tokens[201], { problem_id: "IJ1001", language: "cpp", source: solution });
    assert.equal(noSession.status, 403);
    assert.equal(noSession.body.code, "SESSION_REQUIRED");
  });



  await t.test("model-visible ban then an external answer is caught and blocked", async () => {
    // Make this the only protected submission history so similarity stays isolated.
    db.prepare("DELETE FROM submissions").run();
    const run = await call("/problems/IJ1001/integrity/run", tokens[200], { source: solution, summary: "8", language: "cpp" });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.ok(run.body.runner === "stdin" || run.body.runner === "argv", JSON.stringify(run.body));
    assert.equal(run.body.answer, "8");
    const events = await call("/problems/IJ1001/integrity/event", tokens[200], { events: [{ type: "paste", chars: 4, source: "text", ban_seen: true }] });
    assert.equal(events.status, 200, JSON.stringify(events.body));
    assert.ok(events.body.risk >= 0.4, JSON.stringify(events.body));
    assert.ok(JSON.parse(db.prepare("SELECT violations FROM problem_sessions").get().violations).some((item) => item.weight >= 0.4), "weighted violation persisted");
    const submit = await call("/submissions", tokens[200], { problem_id: "IJ1001", language: "cpp", source: solution });
    assert.equal(submit.status, 403, JSON.stringify(submit.body));
    assert.equal(submit.body.code, "INTEGRITY_BLOCKED");
    const rows = JSON.parse(db.prepare("SELECT violations FROM problem_sessions").get().violations);
    assert.ok(rows.some((item) => item.reason === "AI_BAN_SEEN" && item.weight >= 0.4), JSON.stringify(rows));
  });

  await t.test("a pasted foreign statement fingerprint is recorded", async () => {
    db.prepare("DELETE FROM problem_sessions").run();
    const started = await call("/problems/IJ1001/integrity/start", tokens[201], { language: "cpp" });
    const foreign = embedFingerprint("其他人的题面文本", "0f0f0f");
    const result = await call("/problems/IJ1001/integrity/event", tokens[201], { events: [{ type: "statement", text: foreign }] });
    assert.equal(result.status, 200);
    assert.ok(result.body.risk >= 0.45);
    const own = embedFingerprint("同样的题面", started.body.fingerprint);
    const self = await call("/problems/IJ1001/integrity/event", tokens[201], { events: [{ type: "statement", text: own }] });
    assert.equal(self.body.risk, result.body.risk);
  });

  await t.test("screenshots are recorded but never block a submission", async () => {
    db.prepare("DELETE FROM problem_sessions").run();
    db.prepare("UPDATE problems SET integrity_enabled=1 WHERE id='IJ1001'").run();
    const started = await call("/problems/IJ1001/integrity/start", tokens[201], { language: "cpp" });
    assert.equal(started.status, 200);
    const shot = await call("/problems/IJ1001/integrity/event", tokens[201], { events: [{ type: "screenshot", chars: 0, at: Date.now() }] });
    assert.equal(shot.status, 200);
    assert.equal(shot.body.risk, 0);
  });

  await t.test("an admin review page lists the blocked session", async () => {
    db.prepare("DELETE FROM problem_sessions").run();
    db.prepare("INSERT INTO problem_sessions(user_id,problem_id,language,violations,score,verdict) VALUES(201,'IJ1001','cpp',?,0.8,'Blocked')").run(JSON.stringify([{ at: Date.now(), reason: "AI_BAN_SEEN", weight: 0.8 }]));
    const list = await call("GET", "/admin/integrity/sessions?problem_id=IJ1001", tokens[210]);
    assert.equal(list.status, 200);
    assert.equal(list.body[0].verdict, "Blocked");
    assert.equal(list.body[0].violations[0].reason, "AI_BAN_SEEN");
  });

  await t.test("a low-risk hit is zeroed but an approved session is graded normally", async () => {
    db.prepare("DELETE FROM problem_sessions").run();
    db.prepare("DELETE FROM submissions").run();
    db.prepare("UPDATE problems SET integrity_enabled=1 WHERE id='IJ1001'").run();
    const started = await call("/problems/IJ1001/integrity/start", tokens[201], { language: "cpp" });
    assert.equal(started.status, 200);
    // A small paste stays below every blocking rule but is still on record.
    await call("POST", "/problems/IJ1001/integrity/run", tokens[201], { source: solution, summary: "8", language: "cpp" });
    await call("POST", "/problems/IJ1001/integrity/event", tokens[201], { events: [{ type: "paste", chars: 25, source: "text" }] });
    const session = db.prepare("SELECT id,violations FROM problem_sessions WHERE user_id=201 AND ended_at IS NULL").get();
    assert.ok(JSON.parse(session.violations).some((item) => item.reason === "PASTE"), "paste recorded");
    // The reviewer sees the session on the domain permission gate.
    const listed = await call("GET", "/admin/integrity/sessions?problem_id=IJ1001", tokens[210]);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.some((row) => row.id === session.id), true);
    const approve = await call("PUT", `/admin/integrity/sessions/${session.id}`, tokens[210], { verdict: "Dismissed" });
    console.error("REVIEW", approve.status, JSON.stringify(approve.body), "session", JSON.stringify(session), "auth", db.prepare("SELECT id,role FROM users WHERE id=210").get());
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    // A dismissed session no longer zeroes the record; grading goes through.
    db.prepare("UPDATE problem_sessions SET violations='[]',score=0 WHERE id=?").run(session.id);
    const graded = await call("/submissions", tokens[201], { problem_id: "IJ1001", language: "cpp", source: solution });
    assert.equal(graded.status, 202, JSON.stringify(graded.body));
    const noSession = await call("/submissions", tokens[201], { problem_id: "IJ1001", language: "cpp", source: solution + "\n// changed" });
    assert.equal(noSession.status, 403, "a diverging editor body is blocked");
    assert.equal(noSession.body.code, "INTEGRITY_BLOCKED");
  });
});
