import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("domain permissions: matrix, roles, overrides and route enforcement", { timeout: 60_000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "ij-domain-perms-"));
  process.env.DB_PATH = resolve(directory, "test.db");
  const { db } = await import("./db.js");
  const { createSession, hashPassword } = await import("./auth.js");
  const { GUEST_DEFAULT, DEFAULT_DEFAULT } = await import("./domain-permissions.js");

  const password = "domain-perms-password";
  const tokens = {};
  const users = [[300, "perm-root", "root"], [301, "perm-admin", "admin"], [302, "perm-owner", "user"], [303, "perm-member", "user"], [304, "perm-outsider", "user"]];
  for (const [id, username, role] of users) {
    db.prepare("INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)").run(id, username, hashPassword(password), role);
    tokens[id] = createSession(id);
  }
  db.prepare("INSERT OR REPLACE INTO system_settings(key,value) VALUES('installed','true')").run();
  db.prepare("INSERT INTO domains(id,slug,name,owner_id) VALUES(1,'main','主域',302)").run();
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(1,302,'owner')").run();
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(1,303,'member')").run();
  db.prepare("UPDATE problems SET domain_id=1 WHERE id='IJ1001'").run();

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
  const call = async (method, path, token, body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    return { status: response.status, body: parsed };
  };

  await t.test("defaults follow the Hydro matrix", async () => {
    assert.equal(GUEST_DEFAULT.view, true);
    assert.equal(GUEST_DEFAULT.view_problem, true);
    assert.equal(GUEST_DEFAULT.submit_problem, false);
    assert.equal(GUEST_DEFAULT.view_private, false);
    assert.equal(DEFAULT_DEFAULT.submit_problem, true);
    assert.equal(DEFAULT_DEFAULT.create_problem, false);
    assert.equal(DEFAULT_DEFAULT.edit_domain, false);
  });

  await t.test("my-permissions resolves guest, member and root", async () => {
    const guest = await call("GET", "/my-permissions", tokens[304]);
    assert.equal(guest.status, 200, JSON.stringify(guest.body));
    assert.equal(guest.body.role, "guest");
    assert.equal(guest.body.permissions.view_problem, true);
    assert.equal(guest.body.permissions.submit_problem, false);
    const member = await call("GET", "/my-permissions", tokens[303]);
    assert.equal(member.body.role, "member");
    assert.equal(member.body.permissions.submit_problem, true);
    const root = await call("GET", "/my-permissions", tokens[300]);
    assert.equal(root.body.is_root, true);
    assert.equal(root.body.permissions.manage_permission, true);
    const adminOutside = await call("GET", "/my-permissions", tokens[301]);
    assert.equal(adminOutside.body.role, "guest", "admins are guests until a domain grants them a role");
  });

  await t.test("root edits the matrix, the member is gated by it and by guest column", async () => {
    const matrix = await call("GET", "/domains/1/permissions", tokens[300]);
    assert.equal(matrix.status, 200);
    assert.equal(Object.keys(matrix.body.guest).length > 20, true);
    const updated = await call("PUT", "/domains/1/permissions", tokens[300], { guest: { ...matrix.body.guest, view_problem: false } });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.guest.view_problem, false);
    const guestProblems = await call("GET", "/problems", tokens[304]);
    assert.deepEqual(guestProblems.body, []);
    const memberProblems = await call("GET", "/problems", tokens[303]);
    assert.equal(memberProblems.body.length, 8);
    const outsiderSubmit = await call("POST", "/submissions", tokens[304], { problem_id: "IJ1001", language: "cpp", source: "int main(){}" });
    assert.equal(outsiderSubmit.status, 403);
    assert.equal(outsiderSubmit.body.permission, "submit_problem");
  });

  await t.test("domain member cannot change the matrix; owners can", async () => {
    const denied = await call("PUT", "/domains/1/permissions", tokens[303], { guest: {} });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.permission, "manage_permission");
    const owner = await call("GET", "/domains/1/permissions", tokens[302]);
    assert.equal(owner.status, 200, "owner role receives root defaults");
  });

  await t.test("custom roles add permissions on top of the default column", async () => {
    assert.equal((await call("PUT", "/domains/1/permissions", tokens[300], { guest: GUEST_DEFAULT, member: DEFAULT_DEFAULT })).status, 200);
    const created = await call("POST", "/domains/1/roles", tokens[302], { name: "助教", permissions: { create_problem: true } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const role = created.body.roles.find((item) => item.name === "助教");
    const assign = await call("PUT", "/domains/1/members/303", tokens[302], { role: "助教" });
    assert.equal(assign.status, 200, JSON.stringify(assign.body));
    const mine = await call("GET", "/my-permissions", tokens[303]);
    assert.equal(mine.body.role, "助教");
    assert.equal(mine.body.permissions.create_problem, true);
    assert.equal(mine.body.permissions.submit_problem, true, "member column still applies");
    assert.equal(mine.body.permissions.edit_domain, false);
    const badRole = await call("PUT", "/domains/1/members/303", tokens[302], { role: "不存在" });
    assert.equal(badRole.status, 400);
    assert.equal((await call("DELETE", `/domains/1/roles/${role.id}`, tokens[302])).status, 200);
    const reset = await call("GET", "/my-permissions", tokens[303]);
    assert.equal(reset.body.role, "member");
  });

  await t.test("per-user overrides win over the role and can be cleared", async () => {
    const grant = await call("PUT", "/domains/1/member-permissions/303", tokens[302], { permissions: { edit_domain: true } });
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    const mine = await call("GET", "/my-permissions", tokens[303]);
    assert.equal(mine.body.permissions.edit_domain, true);
    const editDomain = await call("PUT", "/domains/1", tokens[303], { name: "主域-改名", join_method: "application" });
    assert.equal(editDomain.status, 200, JSON.stringify(editDomain.body));
    const clear = await call("PUT", "/domains/1/member-permissions/303", tokens[302], { permissions: {} });
    assert.deepEqual(clear.body.overrides, {});
    const after = await call("GET", "/my-permissions", tokens[303]);
    assert.equal(after.body.permissions.edit_domain, false);
  });

  await t.test("admin without a domain role is limited by the guest column", async () => {
    const detail = await call("GET", "/domains/1", tokens[301]);
    assert.equal(detail.status, 200, "guest can view the domain");
    assert.deepEqual(detail.body.members, [], "guests see no member list data");
    const edit = await call("PUT", "/domains/1", tokens[301], { name: "被管理员改掉", join_method: "application" });
    assert.equal(edit.status, 403);
    const create = await call("POST", "/domains", tokens[301], { slug: "other", name: "另一个域" });
    assert.equal(create.status, 403);
    assert.equal(create.body.code, "ROOT_REQUIRED");
  });

  await t.test("only root creates domains; the creator becomes owner", async () => {
    const created = await call("POST", "/domains", tokens[300], { slug: "course", name: "课程" });
    assert.equal(created.status, 201);
    const owner = db.prepare("SELECT role FROM domain_members WHERE domain_id=? AND user_id=300").get(created.body.id);
    assert.equal(owner.role, "owner");
    const list = await call("GET", "/domains", tokens[304]);
    assert.equal(list.body.some((d) => d.id === created.body.id), true, "new domain starts with the guest view column");
  });
});
