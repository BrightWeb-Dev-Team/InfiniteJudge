import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { once } from "node:events";
import express from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mountAuth0, normalizeAuth0Domain } from "./auth0.js";

test("Auth0 accepts only tenant HTTPS domains", () => {
  for (const [input, expected] of [
    ["tenant.auth0.com", "tenant.auth0.com"],
    ["https://Tenant.us.auth0.com/", "tenant.us.auth0.com"],
    ["  tenant-01.eu.auth0.com  ", "tenant-01.eu.auth0.com"],
    ["", ""],
  ]) assert.equal(normalizeAuth0Domain(input), expected);
  for (const input of [
    "auth0.com", "example.com", "localhost", "tenant.auth0.com.evil.example",
    "http://tenant.auth0.com", "https://tenant.auth0.com/path",
    "https://tenant.auth0.com?query=1", "https://tenant.auth0.com#fragment",
    "https://user:password@tenant.auth0.com", "https://tenant.auth0.com:8443",
    "https://tenant..auth0.com", "https://-tenant.auth0.com",
  ]) assert.throws(() => normalizeAuth0Domain(input), /Auth0 Domain/, input);
});

test("Auth0 administration and authorization code login", { timeout: 30_000 }, async (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "ij-auth0-"));
  const originalDbPath = process.env.DB_PATH;
  const originalPublicUrl = process.env.IJ_PUBLIC_URL;
  process.env.DB_PATH = resolve(directory, "test.db");
  delete process.env.IJ_PUBLIC_URL;
  const { db } = await import("./db.js");
  const { auth, createElevation, createSession, elevatedAdmin, hashPassword } = await import("./auth.js");
  let server;
  t.after(async () => {
    if (server) await new Promise((done) => server.close(done));
    db.close();
    rmSync(directory, { recursive: true, force: true });
    if (originalDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = originalDbPath;
    if (originalPublicUrl === undefined) delete process.env.IJ_PUBLIC_URL; else process.env.IJ_PUBLIC_URL = originalPublicUrl;
  });

  const keys = await generateKeyPair("RS256");
  const otherKeys = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(keys.publicKey), kid: "auth0-test", alg: "RS256", use: "sig" };
  const localKeys = createLocalJWKSet({ keys: [jwk] });
  const defaults = { enabled: true, domain: "test-tenant.us.auth0.com", clientId: "test-client-id", clientSecret: "server-only-secret" };
  const site = "https://judge.example.com";
  const callbackUrl = `${site}/api/auth/auth0/callback`;
  const issuer = `https://${defaults.domain}/`;
  const setting = (name, fallback) => {
    const row = db.prepare("SELECT value FROM system_settings WHERE key=?").get(name);
    return row ? JSON.parse(row.value) : fallback;
  };
  const storeSetting = (name, value) => db.prepare("INSERT INTO system_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(name, JSON.stringify(value));
  const accounts = {};
  const passwordHash = hashPassword("test-admin-password");
  for (const [index, role] of ["root", "user", "admin", "root"].entries()) {
    const id = index + 100;
    db.prepare("INSERT INTO users(id,username,password_hash,role) VALUES(?,?,?,?)").run(id, `auth0-test-${id}`, passwordHash, role);
    accounts[id] = { token: createSession(id), elevation: createElevation(id).token };
  }
  const rootHeaders = { Authorization: `Bearer ${accounts[100].token}`, "X-Admin-Verification": accounts[100].elevation };
  const responses = new Map();
  const requests = [];
  const keyRequests = [];
  const app = express();
  app.use(express.json());
  const auth0 = mountAuth0(app, {
    db, setting, elevatedAdmin, hashPassword, createSession,
    jwksFactory: (url) => { keyRequests.push(url.href); return localKeys; },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      assert.equal(url, `${issuer}oauth/token`);
      const response = responses.get(init.body.get("code"));
      assert.ok(response, "only explicitly prepared authorization codes may reach the mock tenant");
      if (response.beforeResponse) await response.beforeResponse();
      return response.raw || Response.json({ id_token: response.token, access_token: "must-stay-server-side" }, { status: response.status || 200 });
    },
  });
  app.get("/api/me", auth, (req, res) => res.json(req.user));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, redirect: "manual" });
  const save = (body, headers = rootHeaders) => request("/api/admin/settings/auth0", { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const snapshot = () => ["users", "sessions", "oauth_accounts"].map((table) => db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count);
  const failure = (response, pattern = /./) => {
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, new URL(process.env.IJ_PUBLIC_URL || setting("site", {}).serviceUrl).origin);
    const fragment = new URLSearchParams(location.hash.slice(1));
    assert.equal(fragment.has("oauth_token"), false);
    assert.match(fragment.get("oauth_error") || "", pattern);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(location.href, /server-only-secret|must-stay-server-side/);
  };
  const begin = async () => {
    const response = await request("/api/auth/auth0/start");
    assert.equal(response.status, 302);
    const authorize = new URL(response.headers.get("location"));
    assert.equal(authorize.origin, `https://${defaults.domain}`);
    assert.equal(authorize.pathname, "/authorize");
    return { response, authorize, state: authorize.searchParams.get("state"), nonce: authorize.searchParams.get("nonce"), cookie: response.headers.get("set-cookie").split(";")[0] };
  };
  let sequence = 0;
  const prepare = async (options = {}) => {
    const flow = options.flow || await begin();
    const code = `test-code-${++sequence}`;
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: issuer, aud: defaults.clientId, sub: `auth0|test-user-${sequence}`, iat: now, exp: now + 300, nonce: flow.nonce, nickname: "Auth0 Tester", email: `auth0-user-${sequence}@example.com`, email_verified: true, ...options.claims };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "auth0-test" }).sign(options.key || keys.privateKey);
    responses.set(code, { token, beforeResponse: options.beforeResponse, raw: options.raw });
    return { ...flow, code, claims };
  };
  const finish = (flow, query = { code: flow.code, state: flow.state }, cookie = flow.cookie) => request(`/api/auth/auth0/callback?${new URLSearchParams(query)}`, { headers: cookie ? { Cookie: cookie } : {} });
  const loggedInUser = async (response) => {
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, site);
    const code = new URLSearchParams(location.hash.slice(1)).get("oauth_code");
    assert.ok(code, response.headers.get("location"));
    assert.notEqual(code, "must-stay-server-side");
    // The completion code is exchanged for the session token with the browser cookie.
    const completionCookie = (response.headers.get("set-cookie") || "").split(",").map((part) => part.trim()).find((part) => part.startsWith("ij-auth0-completion="))?.split(";")[0];
    assert.ok(completionCookie, "callback sets the completion cookie");
    const completed = await request("/api/auth/auth0/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(completionCookie ? { Cookie: completionCookie } : {}) },
      body: JSON.stringify({ code }),
    });
    assert.equal(completed.status, 200);
    const { token } = await completed.json();
    const me = await request("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    return me.json();
  };
  t.beforeEach(() => {
    delete process.env.IJ_PUBLIC_URL;
    storeSetting("site", { serviceUrl: site });
    storeSetting("auth0", defaults);
    storeSetting("advanced", { server: { allowInvite: true } });
    requests.length = 0;
    responses.clear();
  });

  await t.test("settings require the same Root's secondary verification for both reads and writes", async () => {
    for (const [headers, expected] of [
      [{}, 401],
      [{ Authorization: `Bearer ${accounts[101].token}`, "X-Admin-Verification": accounts[101].elevation }, 403],
      [{ Authorization: `Bearer ${accounts[102].token}`, "X-Admin-Verification": accounts[102].elevation }, 403],
      [{ Authorization: `Bearer ${accounts[100].token}` }, 403],
      [{ Authorization: `Bearer ${accounts[100].token}`, "X-Admin-Verification": accounts[103].elevation }, 403],
    ]) {
      assert.equal((await request("/api/admin/settings/auth0", { headers })).status, expected);
      assert.equal((await save({ enabled: false }, headers)).status, expected);
    }
    assert.equal(setting("auth0").enabled, true);
    assert.equal((await request("/api/admin/settings/auth0", { headers: rootHeaders })).status, 200);
  });

  await t.test("settings redact secrets, preserve blank input, and derive the effective callback", async () => {
    const response = await request("/api/admin/settings/auth0", { headers: rootHeaders });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ...defaults, clientSecret: "", clientSecretConfigured: true, callbackUrl });
    const saved = await save({ domain: "https://TEST-tenant.us.auth0.com/", clientSecret: "" });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).clientSecret, "");
    assert.equal(setting("auth0").clientSecret, defaults.clientSecret);
    assert.equal(setting("auth0").domain, defaults.domain);
    const replacement = await save({ clientSecret: "replacement-secret" });
    assert.equal((await replacement.json()).clientSecret, "");
    assert.equal(setting("auth0").clientSecret, "replacement-secret");
    process.env.IJ_PUBLIC_URL = "https://public.example.com/";
    const overridden = await request("/api/admin/settings/auth0", { headers: rootHeaders });
    assert.equal((await overridden.json()).callbackUrl, "https://public.example.com/api/auth/auth0/callback");
  });

  await t.test("invalid settings cannot replace the saved configuration", async () => {
    for (const body of [
      { domain: "https://example.com" }, { domain: "tenant.auth0.com/authorize" },
      { enabled: "true" }, { clientId: [] }, { clientSecret: 123 },
      { clientId: "" }, { domain: "" }, { clientId: "x".repeat(2049) }, [],
    ]) {
      const response = await save(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.deepEqual(setting("auth0"), defaults);
    }
    storeSetting("auth0", { enabled: false });
    assert.equal((await save({ enabled: true, domain: defaults.domain, clientId: defaults.clientId })).status, 400);
    assert.equal(auth0.enabled(), false);
  });

  await t.test("disabled or incomplete login never redirects to a tenant", async () => {
    for (const config of [{ ...defaults, enabled: false }, { ...defaults, clientSecret: "" }, { ...defaults, domain: "evil.example.com" }]) {
      storeSetting("auth0", config);
      assert.equal(auth0.enabled(), false);
      failure(await request("/api/auth/auth0/start"), /尚未启用|配置不完整/);
    }
    assert.equal(requests.length, 0);
  });

  await t.test("authorization binds state and nonce to a browser and exchanges with matching PKCE", async () => {
    const flow = await prepare();
    const params = flow.authorize.searchParams;
    assert.equal(params.get("response_type"), "code");
    assert.equal(params.get("client_id"), defaults.clientId);
    assert.equal(params.get("redirect_uri"), callbackUrl);
    assert.equal(params.get("scope"), "openid profile email");
    assert.equal(params.get("code_challenge_method"), "S256");
    for (const name of ["state", "nonce", "code_challenge"]) assert.match(params.get(name), /^[A-Za-z0-9_-]{43}$/);
    assert.equal(params.has("client_secret"), false);
    assert.equal(params.has("code_verifier"), false);
    const cookie = flow.response.headers.get("set-cookie");
    for (const pattern of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Path=\/api\/auth\/auth0/, /Max-Age=600/]) assert.match(cookie, pattern);
    assert.equal(flow.response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(flow.response.headers.get("cache-control"), "no-store");
    const before = snapshot();
    const response = await finish(flow);
    const user = await loggedInUser(response);
    assert.equal(user.role, "user");
    assert.deepEqual(snapshot(), before.map((value) => value + 1));
    assert.match(response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/);
    assert.equal(requests.length, 1);
    const exchange = requests[0].init;
    assert.equal(exchange.method, "POST");
    assert.equal(exchange.redirect, "error");
    assert.equal(exchange.body.get("client_secret"), defaults.clientSecret);
    assert.equal(exchange.body.get("grant_type"), "authorization_code");
    assert.equal(exchange.body.get("redirect_uri"), callbackUrl);
    assert.equal(exchange.body.get("code"), flow.code);
    assert.equal(createHash("sha256").update(exchange.body.get("code_verifier")).digest("base64url"), params.get("code_challenge"));
    assert.ok(keyRequests.includes(`${issuer}.well-known/jwks.json`));
    const account = db.prepare("SELECT * FROM oauth_accounts WHERE provider=? AND subject=?").get(`auth0:${defaults.domain}`, flow.claims.sub);
    assert.equal(account.user_id, user.id);
    assert.equal(account.email, flow.claims.email);
    const again = await prepare({ claims: { sub: flow.claims.sub, email: "changed@example.com" } });
    assert.notEqual(again.state, flow.state);
    assert.notEqual(again.nonce, flow.nonce);
    const repeatBefore = snapshot();
    assert.equal((await loggedInUser(await finish(again))).id, user.id);
    assert.deepEqual(snapshot(), [repeatBefore[0], repeatBefore[1] + 1, repeatBefore[2]]);
  });

  await t.test("missing state, missing cookie, wrong browser, and replay cannot create sessions", async () => {
    const flow = await prepare();
    const before = snapshot();
    failure(await finish(flow, { code: flow.code }), /登录状态/);
    failure(await finish(flow, { code: flow.code, state: "unknown" }), /登录状态/);
    failure(await finish(flow, undefined, ""), /登录状态/);
    failure(await finish(flow, undefined, "ij-auth0-state=wrong-browser"), /登录状态/);
    assert.equal(requests.length, 0);
    assert.deepEqual(snapshot(), before);
    await loggedInUser(await finish(flow));
    const afterSuccess = snapshot();
    failure(await finish(flow), /登录状态/);
    assert.equal(requests.length, 1);
    assert.deepEqual(snapshot(), afterSuccess);
  });

  await t.test("provider denial and invalid authorization codes consume the valid state without exchanging", async () => {
    const before = snapshot();
    for (const query of [{ error: "access_denied", error_description: "untrusted provider text" }, {}, { code: "x".repeat(4097) }]) {
      const flow = await prepare();
      const response = await finish(flow, { ...query, state: flow.state });
      failure(response, /取消|授权码/);
      assert.doesNotMatch(response.headers.get("location"), /untrusted/);
      failure(await finish(flow), /登录状态/);
    }
    assert.equal(requests.length, 0);
    assert.deepEqual(snapshot(), before);
  });

  await t.test("invalid nonce, issuer, audience, signature, lifetime, and required claims are rejected", async () => {
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      { claims: { nonce: "other-login-nonce" } },
      { claims: { iss: "https://other.auth0.com/" } },
      { claims: { aud: "other-client" } },
      { key: otherKeys.privateKey },
      { claims: { exp: now - 60 } },
      { claims: { iat: now - 1200 } },
      { claims: { nbf: now + 120 } },
      { claims: { nonce: undefined } },
      { claims: { sub: undefined } },
      { claims: { iat: undefined } },
      { claims: { exp: undefined } },
      { claims: { sub: "" } },
      { claims: { azp: "other-client" } },
      { claims: { aud: [defaults.clientId, "other-client"] } },
    ];
    for (const options of cases) {
      const flow = await prepare(options);
      const before = snapshot();
      failure(await finish(flow), /身份验证失败/);
      assert.deepEqual(snapshot(), before, JSON.stringify(options.claims || "invalid signature"));
    }
  });

  await t.test("a verified matching email creates an isolated ordinary account instead of linking a local Root", async () => {
    db.prepare("UPDATE users SET email=? WHERE id=100").run("existing-local@example.com");
    const flow = await prepare({ claims: { sub: "auth0|same-email", email: "EXISTING-LOCAL@example.com", email_verified: true, nickname: "ExistingRoot", picture: "javascript:alert(1)" } });
    const user = await loggedInUser(await finish(flow));
    assert.notEqual(user.id, 100);
    assert.equal(user.role, "user");
    assert.equal(user.avatar, "");
    const local = db.prepare("SELECT email,role FROM users WHERE id=100").get();
    assert.equal(local.email, "existing-local@example.com");
    assert.equal(local.role, "root");
    assert.equal(db.prepare("SELECT email FROM users WHERE id=?").get(user.id).email, "");
    const account = db.prepare("SELECT user_id FROM oauth_accounts WHERE provider=? AND subject=?").get(`auth0:${defaults.domain}`, flow.claims.sub);
    assert.equal(account.user_id, user.id);
  });

  await t.test("unverified email is not copied into the local account", async () => {
    const flow = await prepare({ claims: { email: "unverified@example.com", email_verified: false } });
    const user = await loggedInUser(await finish(flow));
    assert.equal(db.prepare("SELECT email FROM users WHERE id=?").get(user.id).email, "");
  });

  await t.test("disabled login or changed credentials invalidate pending callbacks", async () => {
    for (const update of [{ enabled: false }, { clientId: "new-client-id" }, { clientSecret: "new-secret" }]) {
      storeSetting("auth0", defaults);
      const flow = await prepare();
      const before = snapshot();
      assert.equal((await save(update)).status, 200);
      failure(await finish(flow), /登录状态|配置已变更/);
      assert.deepEqual(snapshot(), before);
    }
    assert.equal(requests.length, 0);
  });

  await t.test("a site address change also invalidates a pending callback", async () => {
    const flow = await prepare();
    const before = snapshot();
    storeSetting("site", { serviceUrl: "https://new-judge.example.com" });
    failure(await finish(flow), /配置已变更/);
    assert.equal(requests.length, 0);
    assert.deepEqual(snapshot(), before);
  });

  await t.test("disabling login while the token request is in flight prevents session creation", async () => {
    const flow = await prepare({ beforeResponse: () => storeSetting("auth0", { ...defaults, enabled: false }) });
    const before = snapshot();
    failure(await finish(flow), /配置已变更/);
    assert.equal(requests.length, 1);
    assert.deepEqual(snapshot(), before);
  });

  await t.test("registration can be disabled without blocking an already linked Auth0 user", async () => {
    const existing = await prepare({ claims: { sub: "auth0|existing-before-registration-closed" } });
    const user = await loggedInUser(await finish(existing));
    storeSetting("advanced", { server: { allowInvite: false } });
    const before = snapshot();
    failure(await finish(await prepare()), /已关闭新用户注册/);
    assert.deepEqual(snapshot(), before);
    const repeat = await prepare({ claims: { sub: existing.claims.sub } });
    assert.equal((await loggedInUser(await finish(repeat))).id, user.id);
    assert.deepEqual(snapshot(), [before[0], before[1] + 1, before[2]]);
  });

  await t.test("failed, malformed, or oversized token responses never create a session", async () => {
    for (const raw of [
      Response.json({ error: "invalid_client", client_secret: defaults.clientSecret }, { status: 401 }),
      Response.json({ access_token: "must-stay-server-side" }),
      new Response("not-json"),
      new Response("x".repeat(1024 * 1024 + 1)),
    ]) {
      const flow = await prepare({ raw });
      const before = snapshot();
      failure(await finish(flow), /Auth0/);
      assert.deepEqual(snapshot(), before);
    }
  });
});
