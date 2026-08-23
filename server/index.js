import express from "express";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, publicProblem } from "./db.js";
import {
  admin,
  auth,
  createElevation,
  createSession,
  elevatedAdmin,
  hashPassword,
  isUserOnline,
  rootAdmin,
  verifyPassword,
} from "./auth.js";
import { processQueue } from "./judge.js";
import { sandboxInfo } from "./sandbox.js";
import { PluginRuntime } from "./plugins.js";
import { mountContent } from "./content.js";
import { authenticationOptions, finishAuthentication, finishRegistration, registrationOptions } from "./passkeys.js";
import { installUpdate } from "./updater.js";
import { spawn } from "node:child_process";
import nodemailer from "nodemailer";
import multer from "multer";
import unzipper from "unzipper";
import { mkdirSync, rmSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { tmpdir, cpus, freemem, hostname, platform, release, totalmem, arch } from "node:os";
import { execFileSync } from "node:child_process";
const app = express(),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version || "0.0.0"; }
  catch { return "0.0.0"; }
})();
const uploadRoot = resolve(root, "data/uploads"), avatarRoot = resolve(uploadRoot, "avatars"), fileRoot = resolve(uploadRoot, "files");
mkdirSync(avatarRoot, { recursive: true });
mkdirSync(fileRoot, { recursive: true });
const safeExtension = (name) => extname(String(name || "")).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
const avatarUpload = multer({
  storage: multer.diskStorage({ destination: avatarRoot, filename: (_, file, done) => done(null, `${randomUUID()}${safeExtension(file.originalname)}`) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, done) => done(file.mimetype.startsWith("image/") ? null : new Error("只支持图片格式"), file.mimetype.startsWith("image/")),
});
const fileUpload = multer({
  storage: multer.diskStorage({ destination: fileRoot, filename: (_, file, done) => done(null, `${randomUUID()}${safeExtension(file.originalname)}`) }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const problemPackageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const testcasePackageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024, files: 1 } });
const updatePackageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 * 1024, files: 1 } });
const setting = (key, fallback = null) => {
  const row = db.prepare("SELECT value FROM system_settings WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : fallback;
};
const jsonBodyLimit = Math.max(
  1024 * 1024,
  Math.min(
    256 * 1024 * 1024,
    Number(setting("advanced", {})?.limits?.problemFileSize) || 256 * 1024 * 1024,
  ),
);
app.use(express.json({ limit: jsonBodyLimit }));
const antiCheatResetMs = () => Math.max(1, Math.floor(Number(setting("advanced", {})?.antiCheatResetMinutes) || 10080)) * 60000;
const bundledAbout = (() => { try { return readFileSync(resolve(root, "ABOUT.md"), "utf8"); } catch { return ""; } })();
const bundledLicense = (() => { try { return readFileSync(resolve(root, "LICENSE"), "utf8"); } catch { return ""; } })();
try {
  const advanced = setting("advanced", {}), legacyAbout = String(advanced.about || "").trim();
  if (bundledAbout && (!legacyAbout || legacyAbout === "# 关于 {{ name }}\n\n致力于提供安全、完善、开放的在线评测服务。")) {
    db.prepare("INSERT INTO system_settings(key,value) VALUES('advanced',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify({ ...advanced, about: bundledAbout }));
  }
} catch {}
const installed = () => Boolean(setting("installed", false));
const normalizeUsername = (value) => String(value || "").trim().normalize("NFC");
const validUsername = (value) => /^[\p{L}\p{N}_]{3,24}$/u.test(normalizeUsername(value));
const usernameHint = "用户名须为 3-24 个中文、字母、数字或下划线字符";
const brightwebOauthConfig = () => {
  const configured = setting("brightwebOAuth", {}), site = setting("site", {});
  const base = String(process.env.BRIGHTWEB_OAUTH_BASE_URL || configured.baseUrl || "").trim().replace(/\/+$/, "");
  const clientId = String(process.env.BRIGHTWEB_OAUTH_CLIENT_ID || configured.clientId || "").trim();
  const clientSecret = String(process.env.BRIGHTWEB_OAUTH_CLIENT_SECRET || configured.clientSecret || "").trim();
  const publicBase = String(process.env.IJ_PUBLIC_URL || site.serviceUrl || "").trim().replace(/\/+$/, "");
  const redirectUri = String(process.env.BRIGHTWEB_OAUTH_REDIRECT_URI || configured.redirectUri || (publicBase ? `${publicBase}/api/auth/brightweb/callback` : "")).trim();
  return { base, clientId, clientSecret, redirectUri, enabled: Boolean(base && clientId && clientSecret && redirectUri) };
};
const brightwebStates = new Map();
const parseJsonResponse = async (response) => {
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error(`OAuth 返回无效 JSON（HTTP ${response.status}）`); }
};
const primaryDomain = () => db.prepare("SELECT id,announcement FROM domains ORDER BY id LIMIT 1").get();
const calculateRp = () => {
  const users = db.prepare("SELECT id,username,avatar,rp fixed_rp,EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems p ON p.id=e.problem_id WHERE e.user_id=users.id AND p.anti_cheat_enabled AND e.count>=p.anti_cheat_limit AND e.last_event_at>?) cheater FROM users").all(Date.now()-antiCheatResetMs()).map(u=>({...u,tags:db.prepare("SELECT id,label,color FROM user_tags t WHERE t.scope='global' OR EXISTS(SELECT 1 FROM user_tag_links l WHERE l.tag_id=t.id AND l.user_id=?) ORDER BY t.id").all(u.id),certifications:db.prepare("SELECT id,kind,title,display_text,color FROM certifications WHERE user_id=? AND status='approved'").all(u.id)}));
  const accepted = db.prepare("SELECT user_id,problem_id,MIN(id) first_id FROM submissions WHERE status='Accepted' GROUP BY user_id,problem_id ORDER BY problem_id,first_id,user_id").all();
  const byProblem = new Map();
  for (const row of accepted) {
    if (!byProblem.has(row.problem_id)) byProblem.set(row.problem_id, []);
    byProblem.get(row.problem_id).push(row);
  }
  const scores = new Map(users.map((user) => [user.id, Number(user.fixed_rp || 0)]));
  const solved = new Map(users.map((user) => [user.id, 0]));
  for (const rows of byProblem.values()) rows.forEach((row, index) => {
    scores.set(row.user_id, scores.get(row.user_id) + 1000 / Math.sqrt((index + 1) * rows.length));
    solved.set(row.user_id, solved.get(row.user_id) + 1);
  });
  return users.map(({ fixed_rp, ...user }) => ({ ...user, fixed_rp: Number(fixed_rp || 0), solved: solved.get(user.id), rp: Math.round(scores.get(user.id)) })).sort((a, b) => b.rp - a.rp || b.solved - a.solved || a.id - b.id);
};
app.get("/api/setup/status", (_, res) => res.json({ installed: installed() }));
app.post("/api/setup", async (req, res) => {
  if (installed()) return res.status(409).json({ error: "系统已经完成安装" });
  const { name, serviceUrl, logo = "", password, emailVerification = false, smtp = {} } = req.body;
  const username = normalizeUsername(req.body.username);
  if (!name?.trim() || !validUsername(username) || String(password || "").length < 8)
    return res.status(400).json({ error: `请填写品牌名、${usernameHint}，并设置至少 8 位密码` });
  try { new URL(serviceUrl); if (logo) new URL(logo); } catch { return res.status(400).json({ error: "服务地址或 Logo URL 无效" }); }
  if (emailVerification && (!smtp.host || !smtp.port || !smtp.from))
    return res.status(400).json({ error: "启用邮件验证后必须填写 SMTP 主机、端口和发件人" });
  const install = () => {
    db.exec("BEGIN IMMEDIATE");
    try {
    const result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(username, hashPassword(password));
    const userId = Number(result.lastInsertRowid), initialAnnouncement = "# 欢迎使用 " + name.trim() + "\n\n在线评测与算法训练平台。";
    for (const [key, value] of Object.entries({
      site: { name: name.trim(), serviceUrl: serviceUrl.endsWith("/") ? serviceUrl : serviceUrl + "/", logo: logo.trim(), announcement: initialAnnouncement },
      email: { enabled: Boolean(emailVerification), smtp },
      installed: true,
    })) db.prepare("INSERT INTO system_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, JSON.stringify(value));
      const domain = db.prepare("INSERT INTO domains(slug,name,announcement,owner_id,join_method) VALUES('main',?,?,?,'application')").run(name.trim(), initialAnnouncement, userId);
      db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,?,'owner')").run(domain.lastInsertRowid, userId);
      db.exec("COMMIT");
      return userId;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  try {
    const userId = install();
    res.status(201).json({ token: createSession(userId), user: { id: userId, username, role: "admin" } });
  } catch (error) { res.status(409).json({ error: "管理员用户名已存在" }); }
});
app.use("/api", (req, res, next) => {
  if (installed() || req.path === "/setup/status" || req.path === "/setup") return next();
  res.status(503).json({ error: "请先完成系统安装", code: "SETUP_REQUIRED" });
});
const plugins = new PluginRuntime(app, db, resolve(root, "plugins"));
const loadedPlugins = await plugins.load();
app.get("/api/health", (_, res) =>
  { const cpu = cpus()[0], memoryTotal = totalmem(), memoryUsed = memoryTotal - freemem(); res.json({
    ok: true,
    judge: sandboxInfo,
    plugins: loadedPlugins,
    database: "connected",
    queue: {
      pending: db
        .prepare(
          "SELECT COUNT(*) count FROM submissions WHERE status IN ('Pending','Judging')",
        )
        .get().count,
      total: db.prepare("SELECT COUNT(*) count FROM submissions").get().count,
    },
    uptime: Math.round(process.uptime()),
    servers: [{
      id: hostname(),
      status: "Online",
      system: `${platform()} ${release()} ${arch()}`,
      cpu: cpu ? `${cpu.model} · ${(cpu.speed / 1000).toFixed(2)} GHz · ${cpus().length} 核` : "未知",
      memory_used: memoryUsed,
      memory_total: memoryTotal,
      handled_requests: db.prepare("SELECT COUNT(*) count FROM submissions").get().count,
      uptime: Math.round(process.uptime()),
    }],
  }); },
);
app.get("/api/version", async (_, res) => {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch("https://update.brightweb.top/api/version/oj", {
      headers: { Accept: "application/json, text/plain" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`version server returned ${response.status}`);
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = text; }
    const candidate = typeof payload === "string"
      ? payload
      : payload?.version ?? payload?.data?.version ?? payload?.data;
    const version = String(candidate || "").trim().replace(/^v/i, "");
    if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,31}$/.test(version)) throw new Error("invalid version response");
    res.set("Cache-Control", "no-store").json({ version, source: "remote" });
  } catch {
    res.set("Cache-Control", "no-store").json({ version: localVersion, source: "local" });
  } finally { clearTimeout(timeout); }
});
app.get("/api/hitokoto", async (_, res) => {
  try {
    const response = await fetch("https://v1.hitokoto.cn/?encode=json", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("hitokoto unavailable");
    const value = await response.json();
    res.json({ text: value.hitokoto, from: value.from || "一言", url: "https://hitokoto.cn" });
  } catch { res.json({ text: "我之所以想变强，是为了活得轻松写意。", from: "Infinite Judge", url: "https://hitokoto.cn" }); }
});
app.get("/api/plugins", (_, res) =>
  res.json({
    loaded: loadedPlugins,
    ui: Object.fromEntries(
      [...plugins.ui].map(([k, v]) => [k, Object.fromEntries(v)]),
    ),
  }),
);
app.post("/api/admin/problems/:id/testcases/import", admin, testcasePackageUpload.single("package"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择 ZIP 测试点文件包" });
  const problem = db.prepare("SELECT question_type FROM problems WHERE id=?").get(req.params.id);
  if (!problem) return res.status(404).json({ error: "题目不存在" });
  if (problem.question_type !== "programming") return res.status(400).json({ error: "客观题不需要测试点" });
  try {
    const archive = await unzipper.Open.buffer(req.file.buffer), files = new Map(), maxFiles = 200, maxTotal = 256 * 1024 * 1024;
    let total = 0;
    for (const entry of archive.files) {
      if (entry.type !== "File" || entry.path.startsWith("__MACOSX/") || entry.path.endsWith("/.DS_Store")) continue;
      const path = entry.path.replaceAll("\\", "/"), parts = path.split("/");
      if (!path || path.startsWith("/") || parts.includes("..") || path.includes("\0")) throw new Error(`压缩包包含不安全路径：${entry.path}`);
      if (!/\.(?:in|out)$/i.test(path)) continue;
      if (files.size >= maxFiles * 2) throw new Error(`测试点文件不能超过 ${maxFiles * 2} 个`);
      const size = Number(entry.vars?.uncompressedSize || 0);
      total += size;
      if (size > 16 * 1024 * 1024) throw new Error(`单个测试点文件不能超过 16 MB：${path}`);
      if (total > maxTotal) throw new Error("测试点解压后总大小不能超过 256 MB");
      files.set(path, (await entry.buffer()).toString("utf8").replace(/\r\n/g, "\n"));
    }
    const pairs = new Map();
    for (const [path, content] of files) {
      const kind = path.toLowerCase().endsWith(".in") ? "input" : "output", base = path.slice(0, path.lastIndexOf("."));
      pairs.set(base, { ...(pairs.get(base) || {}), [kind]: content });
    }
    const incomplete = [...pairs].filter(([, pair]) => pair.input === undefined || pair.output === undefined).map(([name]) => name);
    if (incomplete.length) throw new Error(`以下测试点缺少同名 .in 或 .out 文件：${incomplete.slice(0, 10).join("、")}`);
    const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
    const ordered = [...pairs].sort(([a], [b]) => collator.compare(a, b));
    if (!ordered.length) throw new Error("ZIP 中未找到同名的 .in/.out 测试点文件");
    if (ordered.length > maxFiles) throw new Error(`测试点不能超过 ${maxFiles} 组`);
    res.json({ names: ordered.map(([name]) => name), testcases: ordered.map(([, pair]) => [pair.input, pair.output]) });
  } catch (error) {
    res.status(400).json({ error: `测试点文件包解析失败：${error.message}` });
  }
});
mountContent(app, db, publicProblem);
app.get("/api/auth/config", (_, res) => res.json({ emailVerification: Boolean(setting("email", {}).enabled), brightwebOauth: { enabled: brightwebOauthConfig().enabled } }));
app.get("/api/auth/brightweb/start", (req, res) => {
  const cfg = brightwebOauthConfig();
  if (!cfg.enabled) return res.status(503).json({ error: "BrightWeb OAuth 尚未配置" });
  for (const [key, value] of brightwebStates) if (value.expiresAt < Date.now()) brightwebStates.delete(key);
  const state = randomBytes(24).toString("hex"), verifier = randomBytes(32).toString("base64url");
  brightwebStates.set(state, { verifier, expiresAt: Date.now() + 600000 });
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: "openid profile email", state, code_challenge: challenge, code_challenge_method: "s256" });
  res.redirect(`${cfg.base}/oauth/authorize?${params}`);
});
app.get("/api/auth/brightweb/callback", async (req, res) => {
  const cfg = brightwebOauthConfig(), publicBase = String(process.env.IJ_PUBLIC_URL || setting("site", {}).serviceUrl || "").trim().replace(/\/+$/, "");
  const redirect = (hash) => res.redirect(`${publicBase || ""}/#${hash}`);
  try {
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const code = String(req.query.code || ""), state = String(req.query.state || ""), record = brightwebStates.get(state);
    if (!code || !record || record.expiresAt < Date.now()) throw new Error("OAuth 授权状态无效或已过期");
    brightwebStates.delete(state);
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.clientSecret, code_verifier: record.verifier });
    const tokenResponse = await fetch(`${cfg.base}/oauth/token`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` }, body });
    const token = await parseJsonResponse(tokenResponse);
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || token.error || "OAuth 令牌交换失败");
    const userResponse = await fetch(`${cfg.base}/oauth/userinfo`, { headers: { Accept: "application/json", Authorization: `Bearer ${token.access_token}` } });
    const profile = await parseJsonResponse(userResponse);
    if (!userResponse.ok || !profile.sub) throw new Error("无法获取 BrightWeb 用户信息");
    const email = String(profile.email || "").trim().toLowerCase();
    let account = db.prepare("SELECT user_id FROM oauth_accounts WHERE provider='brightweb' AND subject=?").get(String(profile.sub));
    let userId = account?.user_id;
    if (!userId && email) userId = db.prepare("SELECT id FROM users WHERE lower(email)=?").get(email)?.id;
    if (!userId) {
      const baseName = String(profile.preferred_username || profile.name || `brightweb_${String(profile.sub).slice(0, 8)}`).normalize("NFC").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 24);
      let username = baseName.length >= 3 ? baseName : "brightweb";
      while (db.prepare("SELECT 1 FROM users WHERE username=?").get(username)) username = `${baseName.slice(0, 18)}_${Math.floor(Math.random() * 100000)}`.slice(0, 24);
      const result = db.prepare("INSERT INTO users(username,password_hash,email,avatar) VALUES(?,?,?,?)").run(username, hashPassword(randomBytes(32).toString("hex")), email, String(profile.profile || "").trim());
      userId = Number(result.lastInsertRowid);
    }
    db.prepare("INSERT INTO oauth_accounts(provider,subject,user_id,email) VALUES('brightweb',?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET user_id=excluded.user_id,email=excluded.email").run(String(profile.sub), userId, email);
    return redirect(`oauth_token=${encodeURIComponent(createSession(userId))}`);
  } catch (error) { return redirect(`oauth_error=${encodeURIComponent(error.message || "BrightWeb 登录失败")}`); }
});
app.post("/api/auth/email-code", async (req, res) => {
  const config = setting("email", {}), email = String(req.body.email || "").trim().toLowerCase();
  if (!config.enabled) return res.status(400).json({ error: "邮件验证未启用" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "邮箱格式无效" });
  const previous = db.prepare("SELECT last_sent_at FROM email_codes WHERE email=?").get(email);
  if (previous && Date.now() - previous.last_sent_at < 60_000) return res.status(429).json({ error: "请一分钟后再发送" });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  try {
    const smtp = config.smtp || {}, transport = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port), secure: Boolean(smtp.secure), auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined });
    await transport.sendMail({ from: smtp.from, to: email, subject: `${setting("site", { name: "Infinite Judge" }).name} 注册验证码`, text: `您的注册验证码是 ${code}，10 分钟内有效。` });
    db.prepare("INSERT INTO email_codes(email,code_hash,expires_at,last_sent_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at").run(email, hashPassword(code), Date.now() + 600_000, Date.now());
    res.json({ ok: true });
  } catch { res.status(502).json({ error: "邮件发送失败，请检查 SMTP 配置" }); }
});
app.post("/api/auth/register", (req, res) => {
  const { password = "", email = "", code = "" } = req.body;
  const username = normalizeUsername(req.body.username);
  if (!validUsername(username))
    return res
      .status(400)
      .json({ error: usernameHint });
  if (password.length < 8)
    return res.status(400).json({ error: "密码至少 8 位" });
  const emailConfig = setting("email", {}), normalizedEmail = String(email).trim().toLowerCase();
  if (emailConfig.enabled) {
    const record = db.prepare("SELECT * FROM email_codes WHERE email=?").get(normalizedEmail);
    if (!record || record.expires_at < Date.now() || !verifyPassword(String(code), record.code_hash)) return res.status(400).json({ error: "邮箱验证码无效或已过期" });
  }
  try {
    const r = db
      .prepare("INSERT INTO users(username,password_hash,email) VALUES(?,?,?)")
      .run(username, hashPassword(password), normalizedEmail || null);
    if (emailConfig.enabled) db.prepare("DELETE FROM email_codes WHERE email=?").run(normalizedEmail);
    const token = createSession(Number(r.lastInsertRowid));
    res.status(201).json({
      token,
      user: { id: Number(r.lastInsertRowid), username, role: "user", avatar: "", rp: 0 },
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("users.username")) return res.status(409).json({ error: "用户名已存在" });
    if (message.includes("users.email") || message.includes("users_email_unique")) return res.status(409).json({ error: "邮箱已被注册" });
    console.error("register failed", error);
    return res.status(500).json({ error: "注册失败，请检查服务器数据库配置" });
  }
});
app.post("/api/auth/login", (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE username=?")
    .get(normalizeUsername(req.body.username));
  if (!user || !verifyPassword(req.body.password || "", user.password_hash))
    return res.status(401).json({ error: "用户名或密码错误" });
  res.json({
    token: createSession(user.id),
    user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar || "", rp: user.rp || 0 },
  });
});
const passkeySiteName = () => setting("site", {})?.name || "Infinite Judge";
const passkeyError = (res, error) => res.status(400).json({ error: String(error?.message || "通行密钥操作失败") });
app.post("/api/auth/passkey/options", async (req, res) => {
  try {
    const user = db.prepare("SELECT id FROM users WHERE username=?").get(normalizeUsername(req.body.username));
    if (!user) return res.status(404).json({ error: "该账户尚未设置通行密钥" });
    res.json(await authenticationOptions(req, passkeySiteName(), "login", user.id));
  } catch (error) { passkeyError(res, error); }
});
app.post("/api/auth/passkey/verify", async (req, res) => {
  try {
    const userId = await finishAuthentication(req, passkeySiteName(), "login");
    const user = db.prepare("SELECT id,username,role,avatar,rp FROM users WHERE id=?").get(userId);
    res.json({ token: createSession(user.id), user: { ...user, avatar: user.avatar || "", rp: user.rp || 0 } });
  } catch (error) { passkeyError(res, error); }
});
app.get("/api/me", auth, (req, res) => res.json(req.user));
app.get("/api/me/passkeys", auth, (req, res) => res.json(db.prepare("SELECT id,name,device_type,backed_up,created_at,last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at DESC").all(req.user.id)));
app.post("/api/me/passkeys/options", auth, async (req, res) => {
  try { res.json(await registrationOptions(req, passkeySiteName())); } catch (error) { passkeyError(res, error); }
});
app.post("/api/me/passkeys", auth, async (req, res) => {
  try { res.status(201).json(await finishRegistration(req, passkeySiteName())); } catch (error) { passkeyError(res, error); }
});
app.put("/api/me/passkeys/:id", auth, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "请输入通行密钥名称" });
  const result = db.prepare("UPDATE passkeys SET name=? WHERE id=? AND user_id=?").run(name, req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "通行密钥不存在" });
  res.json({ ok: true });
});
app.delete("/api/me/passkeys/:id", auth, (req, res) => {
  db.prepare("DELETE FROM passkeys WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.status(204).end();
});
app.put("/api/me/profile", auth, (req, res) => {
  const username = normalizeUsername(req.body.username), avatar = String(req.body.avatar || "").trim(), bio = String(req.body.bio || "").trim();
  if (!validUsername(username)) return res.status(400).json({ error: usernameHint });
  try { if (avatar && !avatar.startsWith("/api/public/avatar/")) new URL(avatar); } catch { return res.status(400).json({ error: "头像 URL 无效" }); }
  try {
    db.prepare("UPDATE users SET username=?,avatar=?,bio=? WHERE id=?").run(username, avatar, bio.slice(0, 2000), req.user.id);
    res.json({ ...req.user, username, avatar, bio: bio.slice(0, 2000) });
  } catch { res.status(409).json({ error: "用户名已存在" }); }
});
app.get("/api/public/avatar/:name", (req, res) => {
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(req.params.name)) return res.status(404).end();
  res.sendFile(resolve(avatarRoot, req.params.name));
});
app.post("/api/me/avatar", auth, avatarUpload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择头像图片" });
  const previous = String(req.user.avatar || ""), avatar = `/api/public/avatar/${req.file.filename}`;
  db.prepare("UPDATE users SET avatar=? WHERE id=?").run(avatar, req.user.id);
  if (previous.startsWith("/api/public/avatar/")) {
    try { rmSync(resolve(avatarRoot, previous.split("/").pop())); } catch {}
  }
  res.json({ ...req.user, avatar });
});
const publicFile = ({ stored_name, ...file }) => ({ ...file, public_url: `/api/public/files/${stored_name}` });
app.get("/api/public/files/:name", (req, res) => {
  if (!/^[a-f0-9-]+(?:\.[a-z0-9]+)?$/i.test(req.params.name)) return res.status(404).end();
  const file = db.prepare("SELECT stored_name,mime_type FROM user_files WHERE stored_name=?").get(req.params.name);
  if (!file) return res.status(404).end();
  res.type(file.mime_type || "application/octet-stream").sendFile(resolve(fileRoot, file.stored_name));
});
app.get("/api/files", auth, (req, res) => res.json(db.prepare("SELECT id,stored_name,original_name,mime_type,size,created_at FROM user_files WHERE user_id=? ORDER BY id DESC").all(req.user.id).map(publicFile)));
app.post("/api/files", auth, fileUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择文件" });
  const result = db.prepare("INSERT INTO user_files(user_id,stored_name,original_name,mime_type,size) VALUES(?,?,?,?,?)").run(req.user.id, req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype || "application/octet-stream", req.file.size);
  res.status(201).json(publicFile({ id: Number(result.lastInsertRowid), stored_name: req.file.filename, original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size }));
});
app.get("/api/files/:id/download", auth, (req, res) => {
  const file = db.prepare("SELECT * FROM user_files WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if (!file) return res.status(404).json({ error: "文件不存在" });
  res.download(resolve(fileRoot, file.stored_name), file.original_name);
});
app.delete("/api/files/:id", auth, (req, res) => {
  const file = db.prepare("SELECT * FROM user_files WHERE id=? AND user_id=?").get(req.params.id, req.user.id);
  if (!file) return res.status(404).json({ error: "文件不存在" });
  try { rmSync(resolve(fileRoot, file.stored_name)); } catch {}
  db.prepare("DELETE FROM user_files WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  res.status(204).end();
});
app.put("/api/me/password", auth, (req, res) => {
  const row = db.prepare("SELECT password_hash FROM users WHERE id=?").get(req.user.id), next = String(req.body.newPassword || "");
  if (!verifyPassword(String(req.body.currentPassword || ""), row.password_hash)) return res.status(400).json({ error: "当前密码错误" });
  if (next.length < 8) return res.status(400).json({ error: "新密码至少 8 位" });
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});
app.get("/api/ranking", (_, res) => res.json(calculateRp().slice(0, 100)));
app.get("/api/users/:id", (req, res) => {
  const user = db.prepare(`SELECT u.id,u.username,u.avatar,u.bio,u.created_at,
    (SELECT COUNT(*) FROM submissions WHERE user_id=u.id) submissions,
    (SELECT COUNT(DISTINCT problem_id) FROM submissions WHERE user_id=u.id AND status='Accepted') solved,
    (SELECT COALESCE(SUM(CASE p.difficulty WHEN '入门' THEN 100 WHEN '简单' THEN 160 WHEN '中等' THEN 240 WHEN '困难' THEN 360 ELSE 100 END),0) FROM (SELECT DISTINCT problem_id FROM submissions WHERE user_id=u.id AND status='Accepted') a JOIN problems p ON p.id=a.problem_id) rp,
    EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems p ON p.id=e.problem_id WHERE e.user_id=u.id AND p.anti_cheat_enabled AND e.count>=p.anti_cheat_limit AND e.last_event_at>?) cheater
    FROM users u WHERE u.id=?`).get(Date.now()-antiCheatResetMs(), req.params.id);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  const calculated = calculateRp().find((item) => item.id === user.id);
  user.rp = calculated?.rp || 0;
  user.fixed_rp = calculated?.fixed_rp || 0;
  user.tags = db.prepare("SELECT id,label,color FROM user_tags t WHERE t.scope='global' OR EXISTS(SELECT 1 FROM user_tag_links l WHERE l.tag_id=t.id AND l.user_id=?) ORDER BY t.id").all(req.params.id);
  user.certifications = db.prepare("SELECT id,kind,title,display_text,color FROM certifications WHERE user_id=? AND status='approved'").all(req.params.id);
  user.blog = db.prepare("SELECT id,title,views,created_at,updated_at FROM blog_posts WHERE user_id=? ORDER BY id DESC").all(req.params.id);
  user.recent_submissions = db.prepare("SELECT s.id,s.problem_id,p.title,s.status,s.score,s.created_at FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 8").all(req.params.id);
  res.json(user);
});
app.get("/api/users/:id/presence", auth, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(id)) return res.status(404).json({ error: "用户不存在" });
  res.json({ online: isUserOnline(id) });
});
app.get("/api/messages", auth, (req, res) => res.json(db.prepare(`
  SELECT m.id,m.sender_id,m.recipient_id,m.content,m.read_at,m.created_at,
    s.username sender,s.avatar sender_avatar,r.username recipient,r.avatar recipient_avatar
  FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
  WHERE m.sender_id=? OR m.recipient_id=? ORDER BY m.id
`).all(req.user.id, req.user.id)));
app.post("/api/messages", auth, (req, res) => {
  const recipientId = Number(req.body.recipientId), recipient = Number.isInteger(recipientId) && recipientId > 0
    ? db.prepare("SELECT id,username,avatar FROM users WHERE id=?").get(recipientId)
    : null, content = String(req.body.content || "").trim();
  if (!recipient) return res.status(404).json({ error: "收件人不存在" });
  if (recipient.id === req.user.id) return res.status(400).json({ error: "不能给自己发消息" });
  if (!content || content.length > 4000) return res.status(400).json({ error: "消息内容须为 1-4000 个字符" });
  const result = db.prepare("INSERT INTO messages(sender_id,recipient_id,content) VALUES(?,?,?)").run(req.user.id, recipient.id, content);
  res.status(201).json({ id: Number(result.lastInsertRowid), recipient });
});
app.put("/api/messages/:id/read", auth, (req, res) => { db.prepare("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE id=? AND recipient_id=?").run(req.params.id, req.user.id); res.json({ ok: true }); });
app.put("/api/messages/conversation/:uid/read", auth, (req, res) => {
  db.prepare("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE sender_id=? AND recipient_id=? AND read_at IS NULL").run(req.params.uid, req.user.id);
  res.json({ ok: true });
});

app.get("/api/calls/config", auth, (_req, res) => {
  let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (process.env.CALL_ICE_SERVERS) {
    try {
      const configured = JSON.parse(process.env.CALL_ICE_SERVERS);
      if (Array.isArray(configured) && configured.length) iceServers = configured;
    } catch {
      // Keep the public STUN fallback when the optional environment value is invalid.
    }
  }
  res.json({ iceServers });
});

app.get("/api/calls/signals", auth, (req, res) => {
  const after = Math.max(0, Number.parseInt(String(req.query.after || "0"), 10) || 0);
  const rows = db.prepare(`SELECT s.*,u.username sender,u.avatar sender_avatar
    FROM call_signals s JOIN users u ON u.id=s.sender_id
    WHERE s.recipient_id=? AND s.id>? AND s.created_at>=datetime('now','-10 minutes')
    ORDER BY s.id ASC LIMIT 100`).all(req.user.id, after);
  res.json(rows.map((row) => {
    try { return { ...row, payload: JSON.parse(row.payload || "{}") }; }
    catch { return { ...row, payload: {} }; }
  }));
});

app.post("/api/calls/signals", auth, (req, res) => {
  const recipientId = Number(req.body?.recipientId);
  const callId = String(req.body?.callId || "");
  const type = String(req.body?.type || "");
  const allowedTypes = new Set(["offer", "answer", "ice", "reject", "hangup", "busy"]);
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === req.user.id) return res.status(400).json({ error: "接收用户无效" });
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(callId) || !allowedTypes.has(type)) return res.status(400).json({ error: "通话信令无效" });
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(recipientId)) return res.status(404).json({ error: "用户不存在" });
  const payload = JSON.stringify(req.body?.payload ?? {});
  if (Buffer.byteLength(payload) > 131072) return res.status(413).json({ error: "通话信令过大" });
  const result = db.prepare("INSERT INTO call_signals(sender_id,recipient_id,call_id,type,payload) VALUES(?,?,?,?,?)")
    .run(req.user.id, recipientId, callId, type, payload);
  db.prepare("DELETE FROM call_signals WHERE created_at<datetime('now','-1 day')").run();
  res.status(201).json({ id: result.lastInsertRowid });
});
app.get("/api/blog", (_, res) => res.json(db.prepare("SELECT b.id,b.user_id,b.title,b.views,b.created_at,b.updated_at,u.username,u.avatar FROM blog_posts b JOIN users u ON u.id=b.user_id ORDER BY b.id DESC").all()));
app.get("/api/blog/:id", (req, res) => {
  const found = db.prepare("SELECT id FROM blog_posts WHERE id=?").get(req.params.id);
  if (!found) return res.status(404).json({ error: "博客不存在" });
  db.prepare("UPDATE blog_posts SET views=views+1 WHERE id=?").run(req.params.id);
  res.json(db.prepare("SELECT b.id,b.user_id,b.title,b.content,b.views,b.created_at,b.updated_at,u.username,u.avatar FROM blog_posts b JOIN users u ON u.id=b.user_id WHERE b.id=?").get(req.params.id));
});
app.post("/api/blog", auth, (req, res) => {
  const title = String(req.body.title || "").trim(), content = String(req.body.content || "").trim();
  if (!title || title.length > 120 || !content) return res.status(400).json({ error: "请填写博客标题和内容" });
  const result = db.prepare("INSERT INTO blog_posts(user_id,title,content) VALUES(?,?,?)").run(req.user.id,title,content);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.put("/api/blog/:id", auth, (req, res) => {
  const post = db.prepare("SELECT user_id FROM blog_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "博客不存在" });
  if (post.user_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "无权编辑此博客" });
  const title = String(req.body.title || "").trim(), content = String(req.body.content || "").trim();
  if (!title || title.length > 120 || !content) return res.status(400).json({ error: "请填写博客标题和内容" });
  db.prepare("UPDATE blog_posts SET title=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title, content, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/blog/:id", auth, (req, res) => {
  const post = db.prepare("SELECT user_id FROM blog_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "博客不存在" });
  if (post.user_id !== req.user.id && req.user.role !== "admin") return res.status(403).json({ error: "无权删除此博客" });
  db.prepare("DELETE FROM blog_posts WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.post("/api/admin/verify", admin, (req, res) => {
  const row = db
    .prepare("SELECT password_hash FROM users WHERE id=?")
    .get(req.user.id);
  if (
    !row ||
    !verifyPassword(String(req.body.password || ""), row.password_hash)
  )
    return res.status(401).json({ error: "管理员密码错误" });
  res.json(createElevation(req.user.id));
});
app.post("/api/admin/verify/passkey/options", admin, async (req, res) => {
  try { res.json(await authenticationOptions(req, passkeySiteName(), "admin", req.user.id)); } catch (error) { passkeyError(res, error); }
});
app.post("/api/admin/verify/passkey", admin, async (req, res) => {
  try {
    const userId = await finishAuthentication(req, passkeySiteName(), "admin");
    if (userId !== req.user.id) return res.status(403).json({ error: "通行密钥与当前管理员不匹配" });
    res.json(createElevation(req.user.id));
  } catch (error) { passkeyError(res, error); }
});
app.get("/api/admin/verification", elevatedAdmin, (req, res) =>
  res.json({ valid: true }),
);
app.get("/api/admin/users", rootAdmin, (_, res) =>
  res.json(
    db
      .prepare("SELECT id,username,role,created_at FROM users ORDER BY id")
      .all(),
  ),
);
app.get("/api/admin/tag-users", admin, (_, res) => {
  const rows = db.prepare("SELECT u.id,u.username,COALESCE(json_group_array(l.tag_id) FILTER (WHERE l.tag_id IS NOT NULL),'[]') tag_ids,EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems p ON p.id=e.problem_id WHERE e.user_id=u.id AND p.anti_cheat_enabled AND e.count>=p.anti_cheat_limit AND e.last_event_at>?) cheater FROM users u LEFT JOIN user_tag_links l ON l.user_id=u.id GROUP BY u.id ORDER BY u.username").all(Date.now() - antiCheatResetMs());
  res.json(rows.map((x) => { const ids = JSON.parse(x.tag_ids).filter((id) => id !== -1); const disabled = db.prepare("SELECT disabled FROM user_tag_overrides WHERE user_id=? AND tag_id=-1").get(x.id)?.disabled; return { ...x, tag_ids: [...ids, ...(x.cheater && disabled !== 1 ? [-1] : [])] }; }));
});
app.get("/api/admin/tags", admin, (_, res) => res.json([{ id: -1, label: "作弊者", color: "#b08c00", scope: "personal", builtin: true }, ...db.prepare("SELECT t.*,COUNT(l.user_id) users FROM user_tags t LEFT JOIN user_tag_links l ON l.tag_id=t.id WHERE t.id<>-1 GROUP BY t.id ORDER BY t.id DESC").all()]));
app.post("/api/admin/tags", admin, (req, res) => { const label=String(req.body.label||"").trim(), color=String(req.body.color||"#b08c00"), scope=req.body.scope === "global" ? "global" : "personal"; if (!label || label.length>24 || !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({error:"标签文字或颜色无效"}); const r=db.prepare("INSERT INTO user_tags(label,color,scope) VALUES(?,?,?)").run(label,color,scope); res.status(201).json({id:Number(r.lastInsertRowid),label,color,scope}); });
app.delete("/api/admin/tags/:id", admin, (req,res)=>{ db.prepare("DELETE FROM user_tags WHERE id=?").run(req.params.id); res.status(204).end(); });
app.put("/api/admin/users/:id/tags", admin, (req,res)=>{
  const requested=Array.isArray(req.body.tagIds)?req.body.tagIds.map(Number).filter(Number.isInteger):[];
  const ids=requested.filter((id)=>id>0 && db.prepare("SELECT 1 FROM user_tags WHERE id=? AND scope='personal'").get(id));
  db.prepare("DELETE FROM user_tag_links WHERE user_id=?").run(req.params.id);
  const add=db.prepare("INSERT OR IGNORE INTO user_tag_links(user_id,tag_id) VALUES(?,?)");
  ids.forEach(id=>add.run(req.params.id,id));
  const activeCheater = db.prepare("SELECT 1 FROM problem_focus_events e JOIN problems p ON p.id=e.problem_id WHERE e.user_id=? AND p.anti_cheat_enabled AND e.count>=p.anti_cheat_limit AND e.last_event_at>? LIMIT 1").get(req.params.id, Date.now()-antiCheatResetMs());
  if (activeCheater && !requested.includes(-1)) {
    // Cancelling the built-in title is a real reset: discard the events that
    // produced it so another endpoint cannot immediately derive it again.
    db.prepare("DELETE FROM problem_focus_events WHERE user_id=?").run(req.params.id);
  }
  db.prepare("DELETE FROM user_tag_overrides WHERE user_id=? AND tag_id=-1").run(req.params.id);
  res.json({ok:true});
});
app.get("/api/certifications", auth, (req,res)=>res.json(db.prepare("SELECT * FROM certifications WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/certifications", auth, (req,res)=>{
  const kind=String(req.body.kind||"");
  if(!["programming","personal"].includes(kind)) return res.status(400).json({error:"认证类型无效"});
  const title=String(req.body.title||"").trim();
  if(!title||title.length>80) return res.status(400).json({error:"请填写 1-80 个字的认证名称"});
  const displayText=String(req.body.displayText||"").trim();
  if(!displayText||displayText.length>120) return res.status(400).json({error:"请填写 1-120 个字的认证展示文本"});
  const description=String(req.body.description||"").trim();
  if(description.length>2000) return res.status(400).json({error:"证明材料或说明不能超过 2000 字"});
  const requestedColor=String(req.body.color||"").toLowerCase();
  const validRequestedColor=/^#[0-9a-f]{6}$/.test(requestedColor);
  const color=req.user.role==="root"?(validRequestedColor?requestedColor:"#d99a00"):kind==="programming"?(requestedColor==="#2daa75"?"#2daa75":"#d99a00"):(validRequestedColor?requestedColor:"#d34b4b");
  const immediatelyApproved=req.user.role==="admin"||req.user.role==="root";
  const status=immediatelyApproved?"approved":"pending";
  try {
    const r=db.prepare("INSERT INTO certifications(user_id,kind,title,display_text,description,color,status,reviewed_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(user_id,kind) DO UPDATE SET title=excluded.title,display_text=excluded.display_text,description=excluded.description,color=excluded.color,status=excluded.status,reviewed_at=excluded.reviewed_at,created_at=CURRENT_TIMESTAMP").run(req.user.id,kind,title,displayText,description,color,status,immediatelyApproved?1:0);
    res.status(201).json({ok:true,id:Number(r.lastInsertRowid),status});
  } catch(e){res.status(400).json({error:e.message});}
});
app.get("/api/admin/certifications", admin, (_,res)=>res.json(db.prepare("SELECT c.*,u.username FROM certifications c JOIN users u ON u.id=c.user_id ORDER BY c.status='pending' DESC,c.id DESC").all()));
app.put("/api/admin/certifications/:id", admin, (req,res)=>{ const status=["approved","rejected","revoked"].includes(req.body.status)?req.body.status:"rejected"; db.prepare("UPDATE certifications SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(status,req.params.id); res.json({ok:true}); });
app.put("/api/admin/users/:id/role", rootAdmin, (req, res) => {
  if (!["user", "admin", "root"].includes(req.body.role))
    return res.status(400).json({ error: "角色无效" });
  const target = db
    .prepare("SELECT role FROM users WHERE id=?")
    .get(req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (
    target.role === "root" &&
    req.body.role !== "root" &&
    db.prepare("SELECT COUNT(*) count FROM users WHERE role='root'").get()
      .count <= 1
  )
    return res.status(409).json({ error: "不能移除最后一个 Root" });
  db.prepare("UPDATE users SET role=? WHERE id=?").run(
    req.body.role,
    req.params.id,
  );
  res.json({ id: Number(req.params.id), role: req.body.role });
});
app.post("/api/admin/users/import", admin, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 500)
    return res.status(400).json({ error: "请提供 1-500 个用户" });
  const insert = db.prepare(
      "INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')",
    ),
    created = [],
    failed = [];
  for (const row of rows) {
    const username = normalizeUsername(row.username),
      password = String(row.password || "");
    if (!validUsername(username) || password.length < 8) {
      failed.push({ username, error: "格式错误或密码少于 8 位" });
      continue;
    }
    try {
      insert.run(username, hashPassword(password));
      created.push(username);
    } catch {
      failed.push({ username, error: "用户名已存在" });
    }
  }
  res.json({ created, failed });
});
app.post("/api/admin/problems/import", admin, problemPackageUpload.single("package"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择 ZIP 题目包" });
  const work = mkdtempSync(resolve(tmpdir(), "infinitejudge-import-"));
  const archive = resolve(work, "problems.zip"), output = resolve(work, "content");
  try {
    writeFileSync(archive, req.file.buffer);
    mkdirSync(output);
    execFileSync("unzip", ["-qq", archive, "-d", output], { timeout: 30000 });
    const dirs = readdirSync(output, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const inserted = [], skipped = [], failed = [];
    const section = (markdown, title) => {
      const match = markdown.match(new RegExp(`(?:^|\\n)#{1,3}\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, "i"));
      return match?.[1]?.trim() || "无";
    };
    const scalar = (yaml, key) => yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^['"]|['"]$/g, "") || "";
    const domainId = Number(req.headers["x-domain-id"]) || db.prepare("SELECT id FROM domains ORDER BY id LIMIT 1").get()?.id;
    const insert = db.prepare(`INSERT INTO problems(id,title,difficulty,tags,time_limit,memory_limit,description,input_format,output_format,sample_input,sample_output,testcases,domain_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const entry of dirs) {
      try {
        const base = resolve(output, entry.name), yamlPath = resolve(base, "problem.yaml"), markdownPath = resolve(base, "problem_zh.md"), configPath = resolve(base, "testdata/config.yaml");
        if (!statSync(yamlPath).isFile() || !statSync(markdownPath).isFile()) continue;
        const yaml = readFileSync(yamlPath, "utf8"), markdown = readFileSync(markdownPath, "utf8"), config = readFileSync(configPath, "utf8");
        const id = scalar(yaml, "pid") || entry.name, title = scalar(yaml, "title") || id;
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(id)) throw new Error("题号格式无效");
        if (db.prepare("SELECT 1 FROM problems WHERE id=?").get(id)) { skipped.push(id); continue; }
        const remote = scalar(config, "type") === "remote_judge", subtype = scalar(config, "subType");
        const tagLines = [...yaml.matchAll(/^\s*-\s+(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
        const tags = [...new Set([...tagLines, ...(remote ? ["远程评测", subtype].filter(Boolean) : [])])].slice(0, 12);
        const time = Number((scalar(config, "time").match(/\d+/) || [1000])[0]);
        const memory = Number((scalar(config, "memory").match(/\d+/) || [256])[0]);
        const background = section(markdown, "题目背景"), description = section(markdown, "题目描述");
        insert.run(id, title, "入门", JSON.stringify(tags), time, memory, background === "无" ? description : `${background}\n\n${description}`, section(markdown, "输入格式"), section(markdown, "输出格式"), section(markdown, "样例输入"), section(markdown, "样例输出"), JSON.stringify([["", ""]]), domainId);
        inserted.push(id);
      } catch (error) { failed.push({ directory: entry.name, error: error.message }); }
    }
    res.json({ inserted, skipped, failed, remoteOnly: inserted.length > 0 });
  } catch (error) {
    res.status(400).json({ error: `题目包解析失败：${error.message}` });
  } finally { rmSync(work, { recursive: true, force: true }); }
});
app.get("/api/domains", auth, (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT d.*,u.username owner,(SELECT COUNT(*) FROM domain_members WHERE domain_id=d.id) members FROM domains d JOIN users u ON u.id=d.owner_id ORDER BY d.id`,
      )
      .all(),
  ),
);
app.post("/api/domains", admin, (req, res) => {
  const slug = String(req.body.slug || "").trim(),
    name = String(req.body.name || "").trim();
  if (!/^[a-z0-9-]{2,32}$/.test(slug) || !name || name.length > 50)
    return res.status(400).json({ error: "域标识或名称无效" });
  try {
    const r = db
      .prepare("INSERT INTO domains(slug,name,owner_id) VALUES(?,?,?)")
      .run(slug, name, req.user.id);
    db.prepare(
      "INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,?,'owner')",
    ).run(r.lastInsertRowid, req.user.id);
    res.status(201).json({ id: Number(r.lastInsertRowid), slug, name });
  } catch {
    return res.status(409).json({ error: "域标识已存在" });
  }
});
app.get("/api/domains/:id", auth, (req, res) => {
  const d = db
    .prepare(
      `SELECT d.*,u.username owner FROM domains d JOIN users u ON u.id=d.owner_id WHERE d.id=?`,
    )
    .get(req.params.id);
  if (!d) return res.status(404).json({ error: "域不存在" });
  d.members = db
    .prepare(
      `SELECT m.*,u.username FROM domain_members m JOIN users u ON u.id=m.user_id WHERE domain_id=? ORDER BY m.joined_at`,
    )
    .all(d.id);
  d.applications =
    req.user.role === "admin"
      ? db
          .prepare(
            `SELECT a.*,u.username FROM domain_applications a JOIN users u ON u.id=a.user_id WHERE domain_id=? ORDER BY a.id DESC`,
          )
          .all(d.id)
      : [];
  res.json(d);
});
app.put("/api/domains/:id", admin, (req, res) => {
  const name = String(req.body.name || "").trim(),
    avatar = String(req.body.avatar || "").trim(),
    announcement = String(req.body.announcement || ""),
    join_method = String(req.body.join_method || "application"),
    invite_code = String(req.body.invite_code || "").trim();
  if (
    !name ||
    name.length > 50 ||
    !["closed", "application", "open", "invite"].includes(join_method)
  )
    return res.status(400).json({ error: "域设置无效" });
  const r = db
    .prepare(
      "UPDATE domains SET name=?,avatar=?,announcement=?,join_method=?,invite_code=? WHERE id=?",
    )
    .run(name, avatar, announcement, join_method, invite_code, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "域不存在" });
  if (Number(primaryDomain()?.id) === Number(req.params.id)) {
    const site = setting("site", {});
    db.prepare("UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='site'").run(JSON.stringify({ ...site, announcement }));
  }
  res.json({ ok: true });
});
app.post("/api/domains/:id/apply", auth, (req, res) => {
  const d = db
    .prepare("SELECT join_method,invite_code FROM domains WHERE id=?")
    .get(req.params.id);
  if (!d) return res.status(404).json({ error: "域不存在" });
  if (d.join_method === "closed")
    return res.status(403).json({ error: "该域不接受加入" });
  if (
    d.join_method === "invite" &&
    String(req.body.invite_code || "") !== d.invite_code
  )
    return res.status(403).json({ error: "邀请码错误" });
  if (d.join_method === "open" || d.join_method === "invite") {
    db.prepare(
      "INSERT OR IGNORE INTO domain_members(domain_id,user_id) VALUES(?,?)",
    ).run(req.params.id, req.user.id);
    return res.json({ joined: true });
  }
  try {
    db.prepare(
      "INSERT INTO domain_applications(domain_id,user_id,message) VALUES(?,?,?) ON CONFLICT(domain_id,user_id) DO UPDATE SET message=excluded.message,status='pending',created_at=CURRENT_TIMESTAMP",
    ).run(req.params.id, req.user.id, String(req.body.message || ""));
    res.json({ applied: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.put(
  "/api/domains/:domainId/applications/:id",
  admin,
  (req, res) => {
    if (!["approved", "rejected"].includes(req.body.status))
      return res.status(400).json({ error: "状态无效" });
    const a = db
      .prepare("SELECT * FROM domain_applications WHERE id=? AND domain_id=?")
      .get(req.params.id, req.params.domainId);
    if (!a) return res.status(404).json({ error: "申请不存在" });
    db.prepare("UPDATE domain_applications SET status=? WHERE id=?").run(
      req.body.status,
      a.id,
    );
    if (req.body.status === "approved")
      db.prepare(
        "INSERT OR IGNORE INTO domain_members(domain_id,user_id) VALUES(?,?)",
      ).run(a.domain_id, a.user_id);
    res.json({ ok: true });
  },
);
app.put("/api/domains/:domainId/members/:userId", admin, (req, res) => {
  if (!["member", "manager"].includes(req.body.role))
    return res.status(400).json({ error: "角色无效" });
  const r = db
    .prepare(
      "UPDATE domain_members SET role=? WHERE domain_id=? AND user_id=? AND role!='owner'",
    )
    .run(req.body.role, req.params.domainId, req.params.userId);
  res.json({ ok: !!r.changes });
});
app.post("/api/admin/maintenance/:action", admin, (req, res) => {
  const actions = {
    cleanSessions: () =>
      db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now())
        .changes,
    recalculateProblems: () => {
      const rows = db.prepare("SELECT id FROM problems").all();
      for (const row of rows)
        db.prepare(
          "UPDATE problems SET submissions=(SELECT COUNT(*) FROM submissions WHERE problem_id=?),accepted=(SELECT COUNT(*) FROM submissions WHERE problem_id=? AND status='Accepted') WHERE id=?",
        ).run(row.id, row.id, row.id);
      return rows.length;
    },
  };
  const action = actions[req.params.action];
  if (!action) return res.status(404).json({ error: "未知维护动作" });
  res.json({ ok: true, affected: action() });
});
app.get("/api/settings/countdown", (_, res) => {
  res.json(db.prepare("SELECT id,title,target FROM countdowns ORDER BY target,id").all());
});
app.get("/api/settings/site", (_, res) => {
  const row = db
    .prepare("SELECT value FROM system_settings WHERE key='site'")
    .get();
  const value = JSON.parse(row.value), main = primaryDomain();
  const pageSize = Math.max(1, Math.min(500, Number(setting("advanced", {})?.pagination?.problems) || 100));
  res.json({ ...value, pagination: { problems: pageSize }, homeAnnouncement: value.homeAnnouncement || value.announcement || `# 欢迎使用 ${value.name}\n\n一个兼容 HydroOJ 插件、支持本地沙箱评测的在线编程系统。`, domainAnnouncement: value.domainAnnouncement ?? main?.announcement ?? "" });
});
app.put("/api/admin/settings/site", elevatedAdmin, (req, res) => {
  const name = String(req.body.name || "").trim(),
    serviceUrl = String(req.body.serviceUrl || "").trim(),
    logo = String(req.body.logo || "").trim(),
    homeAnnouncement = String(req.body.homeAnnouncement ?? req.body.announcement ?? "").trim(),
    domainAnnouncement = String(req.body.domainAnnouncement ?? primaryDomain()?.announcement ?? "").trim(),
    announcementPopup = Boolean(req.body.announcementPopup),
    announcementStartsAt = String(req.body.announcementStartsAt || ""),
    announcementEndsAt = String(req.body.announcementEndsAt || "");
  if (!name || name.length > 50)
    return res.status(400).json({ error: "系统名须为 1-50 个字符" });
  try {
    new URL(serviceUrl);
    if (logo) new URL(logo);
  } catch {
    return res.status(400).json({ error: "服务地址或 Logo URL 无效" });
  }
  const value = {
    name,
    serviceUrl: serviceUrl.endsWith("/") ? serviceUrl : serviceUrl + "/",
    logo,
    homeAnnouncement,
    domainAnnouncement,
    announcementPopup,
    announcementStartsAt,
    announcementEndsAt,
  };
  db.prepare(
    "UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='site'",
  ).run(JSON.stringify(value));
  const main = primaryDomain();
  if (main) db.prepare("UPDATE domains SET announcement=? WHERE id=?").run(domainAnnouncement, main.id);
  res.json(value);
});
app.get("/api/admin/settings/advanced", elevatedAdmin, (_, res) => {
  res.json({
    ...setting("advanced", {}),
    email: setting("email", { enabled: false, smtp: {} }),
  });
});
app.get("/api/about", (_, res) => res.json({
  content: String(setting("advanced", {})?.about || bundledAbout || "").replace(/\]\((?:\.\/)?LICENSE\)/gi, "](/about/license)"),
  version: localVersion,
  name: setting("site", {})?.name || "InfiniteJudge",
}));
app.get("/api/license", (_, res) => res.json({ content: bundledLicense, name: "InfiniteJudge 部署与署名许可协议" }));
app.put("/api/admin/settings/advanced", elevatedAdmin, (req, res) => {
  const currentEmail = setting("email", { enabled: false, smtp: {} });
  const email = req.body.email || {};
  const smtp = { ...(currentEmail.smtp || {}), ...(email.smtp || {}) };
  if (!smtp.pass) smtp.pass = currentEmail.smtp?.pass || "";
  if (email.enabled && (!smtp.host || !smtp.port || !smtp.from))
    return res.status(400).json({ error: "启用邮件验证前请填写 SMTP 地址、端口和发件人" });
  const advanced = {
    antiCheatResetMinutes: Math.max(1, Math.floor(Number(req.body.antiCheatResetMinutes) || 1)),
    server: req.body.server || {},
    limits: req.body.limits || {},
    pagination: req.body.pagination || {},
    categories: String(req.body.categories || ""),
    discussionNodes: String(req.body.discussionNodes || ""),
    languages: String(req.body.languages || ""),
    about: String(req.body.about || ""),
    session: req.body.session || {},
  };
  const save = db.prepare("INSERT INTO system_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
  save.run("advanced", JSON.stringify(advanced));
  save.run("email", JSON.stringify({ enabled: Boolean(email.enabled), smtp }));
  res.json({ ...advanced, email: { enabled: Boolean(email.enabled), smtp: { ...smtp, pass: "" } } });
});
let updating = false;
const scheduleUpdateRestart = () => {
  if (process.env.NODE_ENV !== "production") return false;
  const helper = spawn(process.execPath, [resolve(root, "server/restart.js"), String(process.pid), root], { cwd: root, env: process.env, detached: true, stdio: "ignore" });
  helper.unref();
  setTimeout(() => process.exit(0), 1200).unref();
  return true;
};
app.post("/api/admin/system/update", elevatedAdmin, async (req, res) => {
  if (updating) return res.status(409).json({ error: "更新正在进行中" });
  const origin = "https://update.brightweb.top/oj";
  updating = true;
  const logs = [];
  try {
    const manifestResponse = await fetch(origin, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "InfiniteJudge",
        version: localVersion,
        platform: process.platform,
        arch: process.arch,
      }),
    });
    if (manifestResponse.status === 204) {
      return res.json({ ok: true, origin, version: localVersion, logs: ["当前已是最新版本"] });
    }
    if (manifestResponse.status !== 200) {
      throw new Error(`更新服务返回 HTTP ${manifestResponse.status}`);
    }
    const responseText = await manifestResponse.text();
    let manifest;
    try {
      manifest = JSON.parse(responseText);
    } catch {
      throw new Error("更新服务返回的不是有效 JSON");
    }
    if (manifest.update === false || manifest.latest === true || manifest.version === localVersion)
      return res.json({ ok: true, origin, version: localVersion, logs: ["当前已是最新版本"] });
    if (!manifest.version || !manifest.url || !/^[a-f0-9]{64}$/i.test(manifest.sha256 || "")) throw new Error("更新清单缺少 version、url 或有效的 sha256");
    const packageResponse = await fetch(new URL(manifest.url, origin));
    if (!packageResponse.ok) throw new Error(`下载更新包失败：HTTP ${packageResponse.status}`);
    const archive = Buffer.from(await packageResponse.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error("更新包 SHA-256 校验失败");
    const filename = new URL(manifest.url, origin).pathname.split("/").pop() || "update.tar.gz";
    const installed = await installUpdate({ archive, filename, root, expectedVersion: manifest.version, origin: "在线" });
    logs.push(...installed.logs);
    res.json({ ok: true, origin, version: installed.version, logs, restarting: process.env.NODE_ENV === "production" });
    scheduleUpdateRestart();
  } catch (e) {
    res.status(502).json({ error: e.message || "更新失败", logs: e.logs || logs });
  } finally {
    updating = false;
  }
});
app.post("/api/admin/system/update/upload", elevatedAdmin, updatePackageUpload.single("package"), async (req, res) => {
  if (updating) return res.status(409).json({ error: "更新正在进行中" });
  if (!req.file) return res.status(400).json({ error: "请选择更新包" });
  updating = true;
  try {
    const installed = await installUpdate({ archive: req.file.buffer, filename: req.file.originalname, root, origin: "手动上传" });
    res.json({ ok: true, version: installed.version, logs: installed.logs, restarting: process.env.NODE_ENV === "production" });
    scheduleUpdateRestart();
  } catch (error) {
    res.status(400).json({ error: error.message || "更新失败", logs: error.logs || [] });
  } finally { updating = false; }
});
app.post("/api/admin/settings/countdown", admin, (req, res) => {
  const title = String(req.body.title || "").trim(),
    target = new Date(req.body.target);
  if (!title || title.length > 32)
    return res.status(400).json({ error: "倒计时名称须为 1-32 个字符" });
  if (Number.isNaN(target.getTime()))
    return res.status(400).json({ error: "目标时间无效" });
  const result = db.prepare("INSERT INTO countdowns(title,target) VALUES(?,?)").run(title, target.toISOString());
  const value = { id: Number(result.lastInsertRowid), title, target: target.toISOString() };
  plugins.emit("setting/updated", "countdown", value);
  res.json(value);
});
app.put("/api/admin/settings/countdown/:id", admin, (req, res) => {
  const title = String(req.body.title || "").trim(), target = new Date(req.body.target);
  if (!title || Number.isNaN(target.getTime())) return res.status(400).json({ error: "倒计时配置无效" });
  const result = db.prepare("UPDATE countdowns SET title=?,target=? WHERE id=?").run(title, target.toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "倒计时不存在" });
  res.json({ id: Number(req.params.id), title, target: target.toISOString() });
});
app.delete("/api/admin/settings/countdown/:id", admin, (req, res) => {
  db.prepare("DELETE FROM countdowns WHERE id=?").run(req.params.id); res.status(204).end();
});
app.get("/api/problems", (req, res) => {
  const token=req.headers.authorization?.replace(/^Bearer /,""), viewer=token?db.prepare("SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token,Date.now()):null;
  const domainId=Number(req.headers["x-domain-id"])||primaryDomain()?.id, conditions=["domain_id=?"], args=[domainId]; if(!(viewer&&["admin","root"].includes(viewer.role)))conditions.push("hidden=0");
  const rows = db.prepare(`SELECT * FROM problems WHERE ${conditions.join(" AND ")} ORDER BY id`).all(...args);
  res.json(rows.map((r) => publicProblem(r)));
});
app.get("/api/problems/:id", (req, res) => {
  const raw=decodeURIComponent(req.params.id), cross=raw.startsWith("*"), id=cross?raw.slice(1):raw, domainId=Number(req.headers["x-domain-id"])||primaryDomain()?.id;
  const row=cross?db.prepare("SELECT p.*,d.slug source_domain FROM problems p LEFT JOIN domains d ON d.id=p.domain_id WHERE p.id=? ORDER BY p.domain_id LIMIT 1").get(id):db.prepare("SELECT * FROM problems WHERE id=? AND domain_id=?").get(id,domainId);
  if (!row) return res.status(404).json({ error: "题目不存在" });
  if (row.hidden) { const token=req.headers.authorization?.replace(/^Bearer /,""), viewer=token?db.prepare("SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token,Date.now()):null; if (!viewer || !["admin","root"].includes(viewer.role)) return res.status(404).json({error:"题目不存在"}); }
  const result=publicProblem(row,true); if(cross){result.id=`*${row.id}`;result.source_domain=row.source_domain;} res.json(result);
});
app.get("/api/contests", (_, res) =>
  res.json(db.prepare("SELECT * FROM contests ORDER BY starts_at").all()),
);
const collectionKind = (value) => value === "training" || value === "homework" ? value : null;
const collectionBody = (body) => ({
  title: String(body.title || "").trim(),
  description: String(body.description || "").trim(),
  startsAt: body.starts_at ? new Date(body.starts_at) : null,
  endsAt: body.ends_at ? new Date(body.ends_at) : null,
  problems: [...new Set(Array.isArray(body.problems) ? body.problems.map(String) : [])],
});
const collectionProblems = db.prepare("SELECT p.id,p.title,lp.position FROM learning_problems lp JOIN problems p ON p.id=lp.problem_id WHERE lp.collection_id=? ORDER BY lp.position");
app.get("/api/learning/:kind", (req, res) => {
  const kind = collectionKind(req.params.kind);
  if (!kind) return res.status(404).json({ error: "类型不存在" });
  res.json(db.prepare("SELECT c.*,u.username creator FROM learning_collections c JOIN users u ON u.id=c.created_by WHERE c.kind=? ORDER BY COALESCE(c.starts_at,c.created_at) DESC").all(kind));
});
app.get("/api/learning/:kind/:id", (req, res) => {
  const kind = collectionKind(req.params.kind), row = kind && db.prepare("SELECT c.*,u.username creator FROM learning_collections c JOIN users u ON u.id=c.created_by WHERE c.kind=? AND c.id=?").get(kind, req.params.id);
  if (!row) return res.status(404).json({ error: "内容不存在" });
  res.json({ ...row, problems: collectionProblems.all(row.id) });
});
app.post("/api/admin/learning/:kind", admin, (req, res) => {
  const kind = collectionKind(req.params.kind), value = collectionBody(req.body);
  if (!kind || !value.title) return res.status(400).json({ error: "请填写标题" });
  if ((value.startsAt && Number.isNaN(value.startsAt.getTime())) || (value.endsAt && Number.isNaN(value.endsAt.getTime()))) return res.status(400).json({ error: "时间格式无效" });
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) return res.status(400).json({ error: "结束时间必须晚于开始时间" });
  if (value.problems.some((id) => !db.prepare("SELECT 1 FROM problems WHERE id=?").get(id))) return res.status(400).json({ error: "包含不存在的题目" });
  const result = db.prepare("INSERT INTO learning_collections(kind,title,description,starts_at,ends_at,created_by) VALUES(?,?,?,?,?,?)").run(kind, value.title, value.description, value.startsAt?.toISOString() || null, value.endsAt?.toISOString() || null, req.user.id);
  const insert = db.prepare("INSERT INTO learning_problems(collection_id,problem_id,position) VALUES(?,?,?)");
  value.problems.forEach((id, index) => insert.run(result.lastInsertRowid, id, index));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.put("/api/admin/learning/:kind/:id", admin, (req, res) => {
  const kind = collectionKind(req.params.kind), value = collectionBody(req.body);
  if (!kind || !value.title) return res.status(400).json({ error: "请填写标题" });
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) return res.status(400).json({ error: "结束时间必须晚于开始时间" });
  const result = db.prepare("UPDATE learning_collections SET title=?,description=?,starts_at=?,ends_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind=?").run(value.title, value.description, value.startsAt?.toISOString() || null, value.endsAt?.toISOString() || null, req.params.id, kind);
  if (!result.changes) return res.status(404).json({ error: "内容不存在" });
  db.prepare("DELETE FROM learning_problems WHERE collection_id=?").run(req.params.id);
  const insert = db.prepare("INSERT INTO learning_problems(collection_id,problem_id,position) VALUES(?,?,?)");
  value.problems.forEach((id, index) => insert.run(req.params.id, id, index));
  res.json({ id: Number(req.params.id) });
});
app.delete("/api/admin/learning/:kind/:id", admin, (req, res) => {
  const kind = collectionKind(req.params.kind);
  if (!kind) return res.status(404).end();
  db.prepare("DELETE FROM learning_collections WHERE id=? AND kind=?").run(req.params.id, kind);
  res.status(204).end();
});
app.get("/api/submissions", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id,s.problem_id,p.title title,p.title problem,u.username user,EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems fp ON fp.id=e.problem_id WHERE e.user_id=u.id AND fp.anti_cheat_enabled AND e.count>=fp.anti_cheat_limit AND e.last_event_at>?) cheater,s.status,s.score,s.language,s.time_ms,s.memory_kb,s.created_at FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id ORDER BY s.id DESC LIMIT 100`,
    )
    .all(Date.now()-antiCheatResetMs());
  res.json(rows);
});
app.get("/api/submissions/:id", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const viewer = token ? db.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token, Date.now()) : null;
  const row = db
    .prepare(
      "SELECT s.id,s.user_id,s.problem_id,p.title,s.language,s.source,s.status,s.score,s.time_ms,s.memory_kb,s.detail,s.created_at,u.username user FROM submissions s JOIN problems p ON p.id=s.problem_id JOIN users u ON u.id=s.user_id WHERE s.id=?",
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  const canViewCode = Boolean(viewer && (viewer.id === row.user_id || ["admin", "root"].includes(viewer.role)));
  const { source, detail, ...metadata } = row;
  res.json({ ...metadata, source: canViewCode ? source : null, detail: canViewCode ? JSON.parse(detail) : [], can_view_code: canViewCode });
});
app.post("/api/submissions", auth, (req, res) => {
  let { problem_id, language, source } = req.body; problem_id=String(problem_id||"").replace(/^\*/,"");
  const contestId=Number(req.body.contest_id||0), contestAntiCheatOff=Boolean(contestId&&db.prepare("SELECT c.anti_cheat_disabled FROM contests c JOIN contest_problems cp ON cp.contest_id=c.id WHERE c.id=? AND cp.problem_id=?").get(contestId,problem_id)?.anti_cheat_disabled);
  const problem = db.prepare("SELECT * FROM problems WHERE id=?").get(problem_id);
  if (!problem)
    return res.status(404).json({ error: "题目不存在" });
  if (problem.question_type && problem.question_type !== "programming") {
    if (problem.question_type === "objective") {
      const items = JSON.parse(problem.objective_items || "[]");
      const answer = Array.isArray(req.body.answer) ? req.body.answer : [];
      const accepted = items.length === answer.length && items.every((item, i) => {
        const expected = [...item.answer].map(String).sort();
        const actual = Array.isArray(answer[i]) ? answer[i].map(String).sort() : [];
        return expected.length === actual.length && expected.every((x, j) => x === actual[j]);
      });
      const r = db.prepare("INSERT INTO submissions(user_id,problem_id,language,source,status,score,detail,time_ms,memory_kb) VALUES(?,?,? ,?,?,?, ?,0,0)").run(req.user.id,problem_id,"objective",JSON.stringify(answer),accepted?"Accepted":"Wrong Answer",accepted?100:0,JSON.stringify([{status:accepted?"Accepted":"Wrong Answer"}]));
      db.prepare("UPDATE problems SET submissions=submissions+1,accepted=accepted+? WHERE id=?").run(accepted?1:0,problem_id);
      return res.status(201).json({id:Number(r.lastInsertRowid),status:accepted?"Accepted":"Wrong Answer",score:accepted?100:0});
    }
    const expected=JSON.parse(problem.objective_answer||"[]").map(String).sort(), answer=(Array.isArray(req.body.answer)?req.body.answer:[]).map(String).sort();
    const accepted=expected.length===answer.length&&expected.every((x,i)=>x===answer[i]);
    const r=db.prepare("INSERT INTO submissions(user_id,problem_id,language,source,status,score,detail,time_ms,memory_kb) VALUES(?,?,? ,?,?,?, ?,0,0)").run(req.user.id,problem_id,"objective",JSON.stringify(answer),accepted?"Accepted":"Wrong Answer",accepted?100:0,JSON.stringify([{status:accepted?"Accepted":"Wrong Answer"}]));
    db.prepare("UPDATE problems SET submissions=submissions+1,accepted=accepted+? WHERE id=?").run(accepted?1:0,problem_id);
    return res.status(201).json({id:Number(r.lastInsertRowid),status:accepted?"Accepted":"Wrong Answer",score:accepted?100:0});
  }
  if (problem.anti_cheat_enabled && !contestAntiCheatOff && !["root", "admin"].includes(req.user.role)) {
    const event = db.prepare("SELECT count,last_event_at FROM problem_focus_events WHERE user_id=? AND problem_id=?").get(req.user.id, problem_id);
    if (event && event.count >= problem.anti_cheat_limit && event.last_event_at > Date.now()-antiCheatResetMs()) return res.status(403).json({ error: "切屏次数已达上限，已禁止答题并将成绩记为 0", code: "ANTI_CHEAT_BLOCKED" });
  }
  if (!["cpp", "python", "java"].includes(language))
    return res.status(400).json({ error: "不支持的语言" });
  if (typeof source !== "string" || !source.trim() || source.length > 100000)
    return res.status(400).json({ error: "代码为空或过长" });
  const r = db
    .prepare(
      "INSERT INTO submissions(user_id,problem_id,language,source) VALUES(?,?,?,?)",
    )
    .run(req.user.id, problem_id, language, source);
  setImmediate(processQueue);
  res.status(202).json({ id: Number(r.lastInsertRowid), status: "Pending" });
});
app.post("/api/problems/:id/focus", auth, (req, res) => {
  const problem = db.prepare("SELECT anti_cheat_enabled,anti_cheat_limit FROM problems WHERE id=?").get(req.params.id);
  if (!problem) return res.status(404).json({ error: "题目不存在" });
  const contestId=Number(req.body?.contest_id||0); if(contestId&&db.prepare("SELECT c.anti_cheat_disabled FROM contests c JOIN contest_problems cp ON cp.contest_id=c.id WHERE c.id=? AND cp.problem_id=?").get(contestId,req.params.id)?.anti_cheat_disabled) return res.json({count:0,blocked:false});
  if (!problem.anti_cheat_enabled || ["root", "admin"].includes(req.user.role)) return res.json({ count: 0, blocked: false });
  db.prepare("INSERT INTO problem_focus_events(user_id,problem_id,count,last_event_at) VALUES(?,?,1,?) ON CONFLICT(user_id,problem_id) DO UPDATE SET count=CASE WHEN last_event_at<=? THEN 1 ELSE count+1 END,last_event_at=?").run(req.user.id, req.params.id, Date.now(), Date.now()-antiCheatResetMs(), Date.now());
  const row = db.prepare("SELECT count FROM problem_focus_events WHERE user_id=? AND problem_id=?").get(req.user.id, req.params.id);
  if (row.count >= problem.anti_cheat_limit) db.prepare("UPDATE submissions SET score=0,status='AntiCheat',detail=? WHERE user_id=? AND problem_id=? AND status NOT IN ('Accepted','Wrong Answer','Runtime Error','Compile Error','Time Limit Exceeded','Memory Limit Exceeded','AntiCheat')").run(JSON.stringify([{ error: "切屏次数已达上限" }]), req.user.id, req.params.id);
  res.json({ count: row.count, blocked: row.count >= problem.anti_cheat_limit });
});
if (process.env.NODE_ENV === "production") {
  // Keep unknown API calls JSON; otherwise the SPA fallback returns index.html.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API 接口不存在", path: req.path });
  });
  app.use(express.static(resolve(root, "dist")));
  app.get("*", (_, res) => res.sendFile(resolve(root, "dist/index.html")));
}
app.use((err, req, res, next) => {
  console.error(err);
  if (err?.type === "entity.too.large")
    return res.status(413).json({ error: `请求内容超过 ${(jsonBodyLimit / 1024 / 1024).toFixed(0)} MB 限制，请减少单次测试点数据或在控制面板调整单题大小后重启服务` });
  res.status(err instanceof multer.MulterError || err.message === "只支持图片格式" ? 400 : 500).json({ error: err.message || "Plugin error" });
});
const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Infinte Judge API: http://localhost:${port}`);
  console.log(`Sandbox: ${sandboxInfo.backend} (${sandboxInfo.isolation})`);
  console.log(
    `Plugins: ${loadedPlugins.map((p) => p.name).join(", ") || "none"}`,
  );
  processQueue();
});
