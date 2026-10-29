import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("administrator identity switching and certification workflows", { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "ij-switch-user-"));
  process.env.DB_PATH = resolve(directory, "test.db");
  const { db } = await import("./db.js");
  const { createSession, hashPassword } = await import("./auth.js");
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const password = "switch-user-test-password";
  const accounts = {};
  for (const [index, role] of ["root", "admin", "user", "root"].entries()) {
    const id = 100 + index;
    db.prepare("INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)")
      .run(id, `switch-test-${id}`, hashPassword(password), role);
    accounts[id] = createSession(id);
  }
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: String(port), IJ_DISABLE_LOCAL_JUDGE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((done, reject) => {
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
      if (output.includes(`http://localhost:${port}`)) done();
    });
    child.stderr.on("data", (data) => { output += data; });
    child.once("error", reject);
    child.once("exit", () => reject(new Error(output)));
  });
  const request = async (path, token, body, elevation) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(elevation ? { "X-Admin-Verification": elevation } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const verify = async (id) => {
    const result = await request("/admin/verify", accounts[id], { password });
    assert.equal(result.status, 200);
    return result.body.token;
  };
  const elevation = await verify(100);
  const switchTo = (uid, token = accounts[100], verified = elevation) =>
    request("/admin/switch-user", token, { uid }, verified);

  await t.test("requires a logged-in Root and matching secondary verification", async () => {
    assert.equal((await switchTo(102, null)).status, 401);
    assert.equal((await switchTo(102, accounts[102])).status, 403);
    assert.equal((await switchTo(102, accounts[101], await verify(101))).status, 403);
    const missing = await switchTo(102, accounts[100], null);
    assert.equal(missing.status, 403);
    assert.equal(missing.body.code, "ADMIN_REVERIFY");
    assert.equal((await switchTo(102, accounts[100], await verify(103))).status, 403);
  });
  await t.test("rejects malformed, missing, self, and unknown UIDs without creating sessions", async () => {
    const before = db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count;
    for (const uid of [undefined, null, "102", true, [], {}, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 100]) {
      assert.equal((await switchTo(uid)).status, 400, `UID ${JSON.stringify(uid)}`);
    }
    assert.equal((await switchTo(999999)).status, 404);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, before);
    assert.equal((await request("/me", accounts[100])).body.role, "root");
  });
  await t.test("issues a normal target session without exposing private account fields", async () => {
    const switched = await switchTo(102);
    assert.equal(switched.status, 200);
    assert.deepEqual(switched.body.user, { id: 102, username: "switch-test-102", role: "user" });
    assert.notEqual(switched.body.token, accounts[100]);
    const me = await request("/me", switched.body.token);
    assert.equal(me.body.id, 102);
    assert.equal(me.body.role, "user");
    assert.equal((await request("/admin/users", switched.body.token)).status, 403);
    assert.equal((await switchTo(103, switched.body.token)).status, 403);
    const session = db.prepare("SELECT user_id,expires_at FROM sessions WHERE token=?").get(switched.body.token);
    assert.equal(session.user_id, 102);
    assert.ok(session.expires_at > Date.now());
  });
  await t.test("supports admin and other Root targets without inheriting the actor's verification", async () => {
    for (const id of [101, 103]) {
      const switched = await switchTo(id);
      assert.equal(switched.status, 200);
      assert.equal((await request("/me", switched.body.token)).body.id, id);
      assert.equal((await request("/admin/verification", switched.body.token, undefined, elevation)).status, 403);
    }
  });
  const certification = { kind: "programming", title: "OI certification", displayText: "Test award", description: "Private evidence", color: "#d99a00" };
  await t.test("ordinary users can only submit their own certification for review", async () => {
    assert.equal((await request("/certifications", null, certification)).status, 401);
    assert.equal((await request("/certifications", accounts[102], { ...certification, userId: 101 })).status, 403);
    const result = await request("/certifications", accounts[102], certification);
    assert.equal(result.status, 201);
    assert.equal(result.body.status, "pending");
    const row = db.prepare("SELECT user_id,reviewed_at FROM certifications WHERE id=?").get(result.body.id);
    assert.equal(row.user_id, 102);
    assert.equal(row.reviewed_at, null);
  });
  await t.test("both admin and Root can issue certification for a UID and update the same record", async () => {
    const existing = db.prepare("SELECT id FROM certifications WHERE user_id=102 AND kind='programming'").get();
    for (const actor of [101, 100]) {
      const result = await request("/certifications", accounts[actor], { ...certification, userId: 102 });
      assert.equal(result.status, 201);
      assert.equal(result.body.status, "approved");
      assert.equal(result.body.id, existing.id);
      const row = db.prepare("SELECT * FROM certifications WHERE id=?").get(result.body.id);
      assert.equal(row.user_id, 102);
      assert.equal(row.description, "Private evidence");
      assert.ok(row.reviewed_at);
    }
    const own = await request("/certifications", accounts[101], { ...certification, kind: "personal" });
    assert.equal(own.body.status, "approved");
    assert.equal(db.prepare("SELECT user_id FROM certifications WHERE id=?").get(own.body.id).user_id, 101);
    const publicProfile = await request("/users/102");
    assert.equal(publicProfile.status, 200);
    assert.equal(publicProfile.body.certifications[0].display_text, certification.displayText);
    assert.equal(publicProfile.body.certifications[0].description, undefined);
    const edited = await request("/certifications", accounts[102], { ...certification, displayText: "Changed award" });
    assert.equal(edited.body.status, "pending");
  });
  await t.test("invalid certification targets and content never create records", async () => {
    const before = db.prepare("SELECT COUNT(*) AS count FROM certifications").get().count;
    for (const userId of [null, "102", true, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await request("/certifications", accounts[101], { ...certification, userId })).status, 400);
    }
    assert.equal((await request("/certifications", accounts[101], { ...certification, userId: 999999 })).status, 404);
    for (const change of [{ kind: "bad" }, { title: "" }, { displayText: "" }]) {
      assert.equal((await request("/certifications", accounts[101], { ...certification, ...change, userId: 102 })).status, 400);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM certifications").get().count, before);
  });
});
