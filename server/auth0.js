import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const CALLBACK_PATH = "/api/auth/auth0/callback";
const COOKIE_NAME = "ij-auth0-state";
const COMPLETION_COOKIE = "ij-auth0-completion";
const TTL = 10 * 60_000;
const text = (value) => typeof value === "string" ? value.trim() : "";
const random = () => randomBytes(32).toString("base64url");
const equal = (a, b) => typeof a === "string" && typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function normalizeAuth0Domain(value) {
  const source = text(value);
  if (!source) return "";
  let url;
  try { url = new URL(source.includes("://") ? source : `https://${source}`); }
  catch { throw new Error("Auth0 Domain 无效，请填写 xxx.auth0.com"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.search || url.hash || url.pathname !== "/" ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+auth0\.com$/.test(url.hostname)) {
    throw new Error("Auth0 Domain 须为 xxx.auth0.com 或区域租户域名，不包含路径");
  }
  return url.hostname;
}

function normalizeSiteUrl(value) {
  let url;
  try { url = new URL(text(value)); } catch { throw new Error("请先在站点设置中填写本站公网服务地址"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("统一登录的站点服务地址须为 HTTPS 域名（本机开发可用 HTTP），不包含路径");
  }
  return url.origin;
}

// Dependency injection keeps network verification testable without a live tenant.
export function mountAuth0(app, { db, setting, elevatedAdmin, hashPassword, createSession,
  fetchImpl = (...args) => fetch(...args), jwksFactory = (url) => createRemoteJWKSet(url, { timeoutDuration: 10_000 }) }) {
  const states = new Map();
  const completions = new Map();
  const keys = new Map();
  const read = () => {
    const stored = setting("auth0", {}) || {};
    return { enabled: stored.enabled === true, domain: text(stored.domain), clientId: text(stored.clientId), clientSecret: text(stored.clientSecret) };
  };
  const siteBase = () => normalizeSiteUrl(process.env.IJ_PUBLIC_URL || setting("site", {})?.serviceUrl);
  const config = () => {
    const value = read();
    return { ...value, domain: normalizeAuth0Domain(value.domain), publicBase: siteBase(), callbackUrl: `${siteBase()}${CALLBACK_PATH}` };
  };
  const enabled = () => {
    try { const cfg = config(); return Boolean(cfg.enabled && cfg.domain && cfg.clientId && cfg.clientSecret); }
    catch { return false; }
  };
  const publicSettings = () => {
    const { clientSecret, ...value } = read();
    let callbackUrl = "";
    try { callbackUrl = `${siteBase()}${CALLBACK_PATH}`; } catch {}
    return { ...value, clientSecret: "", clientSecretConfigured: Boolean(clientSecret), callbackUrl };
  };
  const purge = () => {
    for (const [key, state] of states) if (state.expiresAt <= Date.now()) states.delete(key);
    for (const [key, record] of completions) if (record.expiresAt <= Date.now()) completions.delete(key);
  };
  const cookieOptions = (cfg) => ({ httpOnly: true, secure: cfg.publicBase.startsWith("https:"), sameSite: "lax", path: "/api/auth/auth0" });
  const readCookie = (req, name = COOKIE_NAME) => {
    const part = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
    return part?.slice(name.length + 1) || "";
  };
  const redirectError = (res, message) => {
    let base = "";
    try { base = siteBase(); } catch {}
    return res.redirect(`${base}/#oauth_error=${encodeURIComponent(message)}`);
  };
  const safeJson = async (response) => {
    // A bounded response also protects against broken tenant/proxy responses.
    if (!response.ok) throw new Error("Auth0 请求失败，请检查应用配置后重试");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Auth0 返回空响应");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) throw new Error("Auth0 响应过大");
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };

  app.get("/api/admin/settings/auth0", elevatedAdmin, (_, res) => {
    res.set("Cache-Control", "no-store").json(publicSettings());
  });
  app.put("/api/admin/settings/auth0", elevatedAdmin, (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new Error("Auth0 配置无效");
      const current = read(), body = req.body;
      if (body.enabled !== undefined && typeof body.enabled !== "boolean") throw new Error("启用状态无效");
      for (const name of ["domain", "clientId", "clientSecret"]) {
        if (body[name] !== undefined && (typeof body[name] !== "string" || body[name].length > 2048)) throw new Error("Auth0 配置字段无效");
      }
      const next = {
        enabled: body.enabled ?? current.enabled,
        domain: normalizeAuth0Domain(body.domain ?? current.domain),
        clientId: text(body.clientId ?? current.clientId),
        clientSecret: text(body.clientSecret) || current.clientSecret,
      };
      if (next.enabled) {
        if (!next.domain || !next.clientId || !next.clientSecret) throw new Error("启用统一登录前请填写 Domain、Client ID 和 Client Secret");
        siteBase();
      }
      db.prepare("INSERT INTO system_settings(key,value) VALUES('auth0',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify(next));
      if (JSON.stringify(current) !== JSON.stringify(next)) { states.clear(); completions.clear(); keys.clear(); }
      res.set("Cache-Control", "no-store").json(publicSettings());
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.get("/api/auth/auth0/start", (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    try {
      if (!enabled()) return redirectError(res, "Auth0 统一登录尚未启用或配置不完整");
      const cfg = config();
      purge();
      if (states.size + completions.size >= 2000) return redirectError(res, "登录请求较多，请稍后重试");
      const state = random(), verifier = random(), nonce = random(), browser = random();
      states.set(state, { verifier, nonce, browser, cfg, expiresAt: Date.now() + TTL });
      res.cookie(COOKIE_NAME, browser, { ...cookieOptions(cfg), maxAge: TTL });
      const params = new URLSearchParams({
        response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.callbackUrl,
        scope: "openid profile email", state, nonce,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
      });
      res.redirect(`https://${cfg.domain}/authorize?${params}`);
    } catch { redirectError(res, "无法开始 Auth0 登录，请检查统一登录配置"); }
  });

  app.get(CALLBACK_PATH, async (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    try {
      purge();
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const record = states.get(state);
      if (!record || !equal(readCookie(req), record.browser)) throw new Error("登录状态无效或已过期，请重新登录");
      states.delete(state);
      const { cfg } = record;
      res.clearCookie(COOKIE_NAME, cookieOptions(cfg));
      if (!enabled() || JSON.stringify(config()) !== JSON.stringify(cfg)) throw new Error("统一登录配置已变更，请重新登录");
      if (req.query.error) throw new Error("Auth0 登录已取消或未获授权，请重试");
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code || code.length > 4096) throw new Error("Auth0 未返回有效授权码");
      const issuer = `https://${cfg.domain}/`;
      const response = await fetchImpl(`${issuer}oauth/token`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: cfg.clientId,
          client_secret: cfg.clientSecret, redirect_uri: cfg.callbackUrl, code_verifier: record.verifier }),
      });
      const token = await safeJson(response);
      if (typeof token?.id_token !== "string") throw new Error("Auth0 未返回身份凭据，请检查 openid 配置");
      if (!keys.has(issuer)) keys.set(issuer, jwksFactory(new URL(`${issuer}.well-known/jwks.json`)));
      let profile;
      try {
        ({ payload: profile } = await jwtVerify(token.id_token, keys.get(issuer), {
          issuer, audience: cfg.clientId, algorithms: ["RS256"], clockTolerance: 5,
          requiredClaims: ["sub", "iat", "exp", "nonce"], maxTokenAge: "10m",
        }));
        if (!equal(profile.nonce, record.nonce) || typeof profile.sub !== "string" || !profile.sub || profile.sub.length > 255 ||
            (profile.azp !== undefined && profile.azp !== cfg.clientId) ||
            (Array.isArray(profile.aud) && profile.aud.length > 1 && profile.azp !== cfg.clientId)) throw new Error();
      } catch { throw new Error("Auth0 身份验证失败，请重新登录"); }
      // Recheck after network I/O: disabling login must stop in-flight callbacks.
      if (!enabled() || JSON.stringify(config()) !== JSON.stringify(cfg)) throw new Error("统一登录配置已变更，请重新登录");
      const provider = `auth0:${cfg.domain}`;
      const account = db.prepare("SELECT user_id FROM oauth_accounts WHERE provider=? AND subject=?").get(provider, profile.sub);
      let userId = account?.user_id;
      if (!userId) {
        if (setting("advanced", {})?.server?.allowInvite === false) throw new Error("本站已关闭新用户注册，请联系管理员");
        const email = profile.email_verified === true ? text(profile.email).toLowerCase().slice(0, 254) : "";
        const accountEmail = email && !db.prepare("SELECT 1 FROM users WHERE lower(email)=?").get(email) ? email : "";
        const baseName = text(profile.nickname || profile.preferred_username || profile.name).normalize("NFC").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 18);
        const base = baseName.length >= 3 ? baseName : "auth0_user";
        let username = base;
        while (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) username = `${base}_${randomBytes(2).toString("hex")}`;
        let avatar = "";
        try { const picture = new URL(text(profile.picture)); if (picture.protocol === "https:") avatar = picture.href.slice(0, 2048); } catch {}
        db.exec("BEGIN IMMEDIATE");
        try {
          // Identities are issuer + sub. Never link existing accounts by email alone.
          userId = Number(db.prepare("INSERT INTO users(username,password_hash,email,avatar) VALUES(?,?,?,?)").run(username, hashPassword(random()), accountEmail, avatar).lastInsertRowid);
          db.prepare("INSERT INTO oauth_accounts(provider,subject,user_id,email) VALUES(?,?,?,?)").run(provider, profile.sub, userId, email);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      }
      const completionCode = random(), browser = random();
      completions.set(completionCode, { userId, browser, cfg, expiresAt: Date.now() + 60_000 });
      res.cookie(COMPLETION_COOKIE, browser, { ...cookieOptions(cfg), maxAge: 60_000 });
      return res.redirect(`${cfg.publicBase}/#oauth_code=${completionCode}`);
    } catch (error) {
      const message = error instanceof Error && /^(Auth0 |登录状态|统一登录配置|本站已关闭)/.test(error.message)
        ? error.message : "Auth0 登录暂时失败，请稍后重试";
      return redirectError(res, message);
    }
  });
  app.post("/api/auth/auth0/complete", (req, res) => {
    res.set("Cache-Control", "no-store");
    purge();
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const record = completions.get(code);
    if (!record || !equal(readCookie(req, COMPLETION_COOKIE), record.browser)) {
      return res.status(400).json({ error: "登录状态无效或已过期，请重新登录" });
    }
    completions.delete(code);
    res.clearCookie(COMPLETION_COOKIE, cookieOptions(record.cfg));
    if (!enabled() || JSON.stringify(config()) !== JSON.stringify(record.cfg)) {
      return res.status(400).json({ error: "统一登录配置已变更，请重新登录" });
    }
    if (req.headers.origin && req.headers.origin !== record.cfg.publicBase) {
      return res.status(400).json({ error: "登录请求来源无效，请重新登录" });
    }
    res.json({ token: createSession(record.userId) });
  });
  return { enabled };
}
