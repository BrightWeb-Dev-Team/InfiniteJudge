import express from "express";
import { brotliCompressSync, gzipSync, constants as brotliConstants } from "node:zlib";
import { fileURLToPath } from "node:url";
import { db, publicProblem, DEFAULT_AI_SETTINGS } from "./db.js";
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
import { mountIntegrity } from "./integrity.js";
import { mountDomainPermissions } from "./domain-permissions.js";
import { licenseConfig, saveLicenseConfig, siteLicense } from "./license.js";
import { mountAuth0 } from "./auth0.js";
import { mountCodeReports, scanCode, recordDangerousCode } from "./code-scanner.js";
import { authenticationOptions, finishAuthentication, finishRegistration, registrationOptions } from "./passkeys.js";
import { installUpdate } from "./updater.js";
import { spawn } from "node:child_process";
import nodemailer from "nodemailer";
import multer from "multer";
import unzipper from "unzipper";
import { mkdirSync, rmSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { randomUUID, randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { tmpdir, cpus, freemem, hostname, platform, release, totalmem, arch } from "node:os";
import { execFileSync } from "node:child_process";
const app = express(),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Comma-separated origins (for example a Capacitor/Cordova WebView) that may call the
// JSON API cross-origin. Left empty, nothing changes for browser deployments.
const chatAppOrigins = new Set(
  String(process.env.CHAT_APP_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
);
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || !chatAppOrigins.has(origin)) return next();
  res.set({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Domain-ID",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  });
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
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
// Credential endpoints are CPU-costly (scrypt) and guessable, so cap them per client IP.
const authAttempts = new Map();
const authClientKey = (req) => String(req.ip || req.socket?.remoteAddress || "unknown");
const authRateLimit = (limit, windowMs = 60_000) => (req, res, next) => {
  const key = authClientKey(req), now = Date.now();
  const state = (authAttempts.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (state.length >= limit) { authAttempts.set(key, state); return res.status(429).json({ error: "尝试过于频繁，请稍后再试" }); }
  state.push(now);
  authAttempts.set(key, state);
  if (authAttempts.size > 10_000) for (const [id, stamps] of authAttempts) if (!stamps.some((stamp) => now - stamp < windowMs)) authAttempts.delete(id);
  next();
};
const AI_MAX_MESSAGES = 32;
const AI_MAX_MESSAGE_CHARS = 16_000;
const AI_MAX_TOTAL_CHARS = 64_000;
const AI_MAX_SYSTEM_PROMPT_CHARS = 16_000;
const AI_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const AI_PROVIDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const AI_MODEL_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;
const privateIpv4 = (host) => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
};
const privateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback", "0.0.0.0", "::1"].includes(host)) return true;
  if (privateIpv4(host)) return true;
  // IPv6 loopback/link-local/ULA ranges. URL.hostname may retain brackets on
  // some Node versions, hence the normalization above.
  return host === "::" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd");
};
const loopbackHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return ["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback", "127.0.0.1", "::1"].includes(host);
};
const normalizeAiBaseUrl = (value) => {
  const source = String(value ?? "").trim();
  let parsed;
  try { parsed = new URL(source); } catch { throw new Error("AI API 地址无效"); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("AI API 地址必须使用 HTTP 或 HTTPS");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("AI API 地址不能包含认证信息、查询参数或片段");
  const host = parsed.hostname;
  // Permit localhost HTTP endpoints for local/self-hosted development. Any
  // non-local HTTP endpoint is rejected to keep credentials off cleartext.
  if (parsed.protocol !== "https:" && !loopbackHostname(host)) throw new Error("非本地 AI API 地址必须使用 HTTPS");
  if (privateHostname(host) && !loopbackHostname(host)) throw new Error("AI API 地址不能指向内网地址");
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.length > 200) throw new Error("AI API 地址路径无效");
  parsed.pathname = pathname || "";
  return parsed.toString().replace(/\/+$/, "");
};
const safeStoredAi = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const result = { ...DEFAULT_AI_SETTINGS };
  result.enabled = source.enabled === true || source.enabled === 1 || source.enabled === "1" || source.enabled === "true";
  if (typeof source.provider === "string" && AI_PROVIDER_RE.test(source.provider.trim())) result.provider = source.provider.trim();
  try { if (source.baseUrl) result.baseUrl = normalizeAiBaseUrl(source.baseUrl); } catch {}
  // Pasted keys often carry zero-width or full-width characters that pass .trim() but make
  // every request fail inside fetch with "Cannot convert argument to a ByteString".
  if (typeof source.apiKey === "string") result.apiKey = source.apiKey.replace(/[^\x21-\x7e]+/g, "").slice(0, 500);
  if (typeof source.model === "string" && AI_MODEL_RE.test(source.model.trim())) result.model = source.model.trim();
  if (typeof source.systemPrompt === "string") result.systemPrompt = source.systemPrompt.slice(0, AI_MAX_SYSTEM_PROMPT_CHARS);
  const temperature = Number(source.temperature);
  if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 2) result.temperature = temperature;
  const maxTokens = Number(source.maxTokens ?? source.max_tokens);
  if (Number.isInteger(maxTokens) && maxTokens >= 1 && maxTokens <= 8192) result.maxTokens = maxTokens;
  const timeoutMs = Number(source.timeoutMs ?? source.timeout_ms);
  if (Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120000) result.timeoutMs = timeoutMs;
  return result;
};
const readAdvanced = () => {
  try {
    const value = setting("advanced", {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};
const separateAiSetting = () => {
  try {
    const value = setting("ai", null);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
};
// New installations keep a mirror under advanced.ai for compatibility with
// the control-panel bundle, while the dedicated `ai` setting is authoritative
// once it exists. This also prevents concurrent advanced/AI saves from
// clobbering a newly entered API key.
const readAiSettings = () => safeStoredAi(separateAiSetting() || readAdvanced().ai);
const publicAiSettings = (raw = readAiSettings()) => {
  const value = safeStoredAi(raw);
  const configured = Boolean(value.apiKey);
  return {
    enabled: value.enabled,
    provider: value.provider,
    baseUrl: value.baseUrl,
    model: value.model,
    systemPrompt: value.systemPrompt,
    temperature: value.temperature,
    maxTokens: value.maxTokens,
    timeoutMs: value.timeoutMs,
    // Keep the editable field empty. The real secret never leaves the server.
    apiKey: "",
    apiKeyConfigured: configured,
    hasApiKey: configured,
    apiKeyMasked: configured ? "••••••••" : "",
  };
};
const parseAiInput = (input, current = readAiSettings()) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("AI 配置格式无效");
  const source = input.ai && typeof input.ai === "object" && !Array.isArray(input.ai) ? input.ai : input;
  const value = { ...safeStoredAi(current) };
  if (Object.prototype.hasOwnProperty.call(source, "enabled")) {
    if (![true, false, 0, 1, "0", "1", "true", "false"].includes(source.enabled)) throw new Error("AI 启用状态无效");
    value.enabled = source.enabled === true || source.enabled === 1 || source.enabled === "1" || source.enabled === "true";
  }
  if (Object.prototype.hasOwnProperty.call(source, "provider")) {
    const provider = String(source.provider ?? "").trim();
    if (!AI_PROVIDER_RE.test(provider)) throw new Error("AI 提供商标识无效");
    value.provider = provider;
  }
  if (Object.prototype.hasOwnProperty.call(source, "baseUrl")) value.baseUrl = normalizeAiBaseUrl(source.baseUrl);
  else if (Object.prototype.hasOwnProperty.call(source, "base_url")) value.baseUrl = normalizeAiBaseUrl(source.base_url);
  if (Object.prototype.hasOwnProperty.call(source, "model")) {
    const model = String(source.model ?? "").trim();
    if (!AI_MODEL_RE.test(model)) throw new Error("AI 模型名称无效");
    value.model = model;
  }
  if (Object.prototype.hasOwnProperty.call(source, "systemPrompt") || Object.prototype.hasOwnProperty.call(source, "system_prompt")) {
    const prompt = String(source.systemPrompt ?? source.system_prompt ?? "");
    if (prompt.length > AI_MAX_SYSTEM_PROMPT_CHARS) throw new Error(`AI 系统提示不能超过 ${AI_MAX_SYSTEM_PROMPT_CHARS} 个字符`);
    value.systemPrompt = prompt;
  }
  if (Object.prototype.hasOwnProperty.call(source, "temperature")) {
    const temperature = Number(source.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new Error("AI 温度必须在 0 到 2 之间");
    value.temperature = temperature;
  }
  if (Object.prototype.hasOwnProperty.call(source, "maxTokens") || Object.prototype.hasOwnProperty.call(source, "max_tokens")) {
    const maxTokens = Number(source.maxTokens ?? source.max_tokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) throw new Error("AI 最大输出令牌数必须是 1 到 8192 的整数");
    value.maxTokens = maxTokens;
  }
  if (Object.prototype.hasOwnProperty.call(source, "timeoutMs") || Object.prototype.hasOwnProperty.call(source, "timeout_ms")) {
    const timeoutMs = Number(source.timeoutMs ?? source.timeout_ms);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("AI 超时时间必须是 100 到 120000 毫秒的整数");
    value.timeoutMs = timeoutMs;
  }
  const clearKey = source.clearApiKey === true || source.clear_api_key === true || source.clearKey === true;
  if (clearKey) value.apiKey = "";
  else if (Object.prototype.hasOwnProperty.call(source, "apiKey") || Object.prototype.hasOwnProperty.call(source, "api_key")) {
    const key = String(source.apiKey ?? source.api_key ?? "");
    if (key.length > 500) throw new Error("AI API Key 不能超过 500 个字符");
    if (/[\u0000-\u001f\u007f]/.test(key)) throw new Error("AI API Key 包含无效字符");
    // Empty input intentionally preserves the existing key, matching SMTP
    // settings behavior. Use clearApiKey to remove it explicitly.
    if (key.trim()) value.apiKey = key.trim();
  }
  return value;
};
const saveAiSettings = (value) => {
  const advanced = readAdvanced();
  const ai = safeStoredAi(value);
  const next = { ...advanced, ai };
  db.prepare("INSERT INTO system_settings(key,value) VALUES('advanced',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify(next));
  db.prepare("INSERT INTO system_settings(key,value) VALUES('ai',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify(ai));
  return ai;
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
const domainPerms = mountDomainPermissions(app, db);
const integrity = mountIntegrity(app, db, { auth, admin, readAdvanced, publicProblem, fileRoot, domainPerms });
const requireDomain = (permission, resolve) => [auth, domainPerms.domainPermission(permission, resolve)];
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
const primaryDomain = () => db.prepare("SELECT id,announcement,carousel,carousel_interval FROM domains ORDER BY id LIMIT 1").get();
const parseCarousel = (value) => {
  try {
    const items = JSON.parse(value || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};
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
  // A lost `installed` flag (restored DB, partial deploy) must not hand root to a stranger.
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get()) return res.status(409).json({ error: "系统已经完成安装" });
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
    // The account created during first-run setup is the platform owner.  It
    // must be a Root account immediately so the installer can open the
    // control panel and configure services such as the AI assistant without
    // requiring a restart or a second administrator account.
    const result = db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'root')").run(username, hashPassword(password));
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
    res.status(201).json({ token: createSession(userId), user: { id: userId, username, role: "root" } });
  } catch (error) { res.status(409).json({ error: "管理员用户名已存在" }); }
});
app.use("/api", (req, res, next) => {
  if (installed() || req.path === "/setup/status" || req.path === "/setup") return next();
  res.status(503).json({ error: "请先完成系统安装", code: "SETUP_REQUIRED" });
});
const plugins = new PluginRuntime(app, db, resolve(root, "plugins"));
const loadedPlugins = await plugins.load();
// Remote judges hand back hidden test data, so they must prove they are one. The secret is
// operator-provided (IJ_JUDGE_KEY) or generated once and stored in system_settings, so every
// deployment is protected without manual setup.
const judgeKey = (() => {
  const fromEnv = String(process.env.IJ_JUDGE_KEY || "").trim();
  if (fromEnv.length >= 32) return fromEnv;
  const row = db.prepare("SELECT value FROM system_settings WHERE key='judge_key'").get();
  if (row) return JSON.parse(row.value);
  const generated = randomBytes(32).toString("hex");
  db.prepare("INSERT OR IGNORE INTO system_settings(key,value) VALUES('judge_key',?)").run(JSON.stringify(generated));
  return JSON.parse(db.prepare("SELECT value FROM system_settings WHERE key='judge_key'").get().value);
})();
const authorizedJudge = (req) => {
  const given = Buffer.from(String(req.get("x-judge-key") || ""));
  const expected = Buffer.from(judgeKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
};
const judgeOnly = (req, res, next) =>
  authorizedJudge(req) ? next() : res.status(401).json({ error: "评测机未授权" });
app.get("/api/judge/pull", judgeOnly, (req, res) => {
  const node = String(req.get("x-judge-node") || "remote").slice(0, 100);
  let task = null;
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT s.id,s.user_id,s.problem_id,s.language,s.source,s.contest_id,s.created_at,p.title,p.time_limit,p.memory_limit,p.testcases,p.spj_enabled,p.spj_source FROM submissions s JOIN problems p ON p.id=s.problem_id WHERE s.status='Pending' ORDER BY s.id LIMIT 1").get();
    if (row) {
      db.prepare("UPDATE submissions SET status='Judging',detail=? WHERE id=?").run(JSON.stringify([{ node, claimed_at: Date.now() }]), row.id);
      task = row;
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json(task ? { task } : { task: null, retry_after: 1000 });
});
app.post("/api/judge/result", judgeOnly, (req, res) => {
  const { id, status, score = 0, time_ms = 0, memory_kb = 0, detail = [] } = req.body || {};
  if (!Number.isInteger(Number(id)) || !status) return res.status(400).json({ error: "结果格式无效" });
  const result = db.prepare("UPDATE submissions SET status=?,score=?,time_ms=?,memory_kb=?,detail=? WHERE id=? AND status='Judging'").run(String(status).slice(0, 40), Number(score)||0, Number(time_ms)||0, Number(memory_kb)||0, JSON.stringify(detail), Number(id));
  if (!result.changes) return res.status(409).json({ error: "任务不存在或已处理" });
  db.prepare("UPDATE problems SET submissions=submissions+1,accepted=accepted+? WHERE id=(SELECT problem_id FROM submissions WHERE id=?)").run(status === "Accepted" ? 1 : 0, Number(id));
  res.json({ ok: true });
});
app.get("/api/health", (_, res) =>
  { const cpu = cpus()[0], memoryTotal = totalmem(), memoryUsed = memoryTotal - freemem(); res.json({
    ok: true,
    // Only the sandbox backend is public; the isolation level would tell an attacker
    // exactly which escape techniques are worth trying.
    judge: { platform: sandboxInfo.platform, backend: sandboxInfo.backend },
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
app.post("/api/admin/problems/:id/testcases/import", auth, domainPerms.domainPermission("read_problem_data", (req) => db.prepare("SELECT domain_id FROM problems WHERE id=?").get(req.params.id)?.domain_id), testcasePackageUpload.single("package"), async (req, res) => {
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
mountContent(app, db, publicProblem, domainPerms);
mountCodeReports();
const auth0 = mountAuth0(app, { db, setting, elevatedAdmin, hashPassword, createSession });
app.get("/api/auth/config", (_, res) => res.set("Cache-Control", "no-store").json({ emailVerification: Boolean(setting("email", {}).enabled), auth0: { enabled: auth0.enabled() } }));
app.post("/api/auth/email-code", authRateLimit(10), async (req, res) => {
  const config = setting("email", {}), email = String(req.body.email || "").trim().toLowerCase();
  if (!config.enabled) return res.status(400).json({ error: "邮件验证未启用" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "邮箱格式无效" });
  const previous = db.prepare("SELECT last_sent_at FROM email_codes WHERE email=?").get(email);
  if (previous && Date.now() - previous.last_sent_at < 60_000) return res.status(429).json({ error: "请一分钟后再发送" });
  const code = String(randomInt(100000, 1000000));
  try {
    const smtp = config.smtp || {}, transport = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port), secure: Boolean(smtp.secure), auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined });
    await transport.sendMail({ from: smtp.from, to: email, subject: `${setting("site", { name: "Infinite Judge" }).name} 注册验证码`, text: `您的注册验证码是 ${code}，10 分钟内有效。` });
    db.prepare("INSERT INTO email_codes(email,code_hash,expires_at,last_sent_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,last_sent_at=excluded.last_sent_at").run(email, hashPassword(code), Date.now() + 600_000, Date.now());
    res.json({ ok: true });
  } catch { res.status(502).json({ error: "邮件发送失败，请检查 SMTP 配置" }); }
});
app.post("/api/auth/register", authRateLimit(20), (req, res) => {
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
    if (!record || record.expires_at < Date.now()) return res.status(400).json({ error: "邮箱验证码无效或已过期" });
    // Six digits are guessable online; burn the code after a handful of misses.
    if (Number(record.attempts) >= 5) { db.prepare("DELETE FROM email_codes WHERE email=?").run(normalizedEmail); return res.status(429).json({ error: "验证码尝试次数过多，请重新获取" }); }
    if (!verifyPassword(String(code), record.code_hash)) {
      db.prepare("UPDATE email_codes SET attempts=attempts+1 WHERE email=?").run(normalizedEmail);
      return res.status(400).json({ error: "邮箱验证码无效或已过期" });
    }
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
app.post("/api/auth/login", authRateLimit(20), (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE username=?")
    .get(normalizeUsername(req.body.username));
  if (!user || !verifyPassword(req.body.password || "", user.password_hash))
    return res.status(401).json({ error: "用户名或密码错误" });
  if (user.banned_until > Date.now()) {
    const reason = user.ban_reason || "违反社区规则";
    const now = Date.now();
    const remaining = user.banned_until - now;
    const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    const durationText = days > 365 ? "永久" : `${days} 天`;
    return res.status(403).json({
      error: `您的账号因「${reason}」已被封禁 ${durationText}`,
      banned: true,
      banned_until: user.banned_until,
      ban_reason: reason,
      remaining_days: days,
    });
  }
  res.json({
    token: createSession(user.id),
    user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar || "", rp: user.rp || 0, bio: user.bio || "", custom_css: user.custom_css || "", custom_html: user.custom_html || "", custom_head: user.custom_head || "", custom_script: user.custom_script || "" },
  });
});
const passkeySiteName = () => setting("site", {})?.name || "Infinite Judge";
const passkeyError = (res, error) => res.status(400).json({ error: String(error?.message || "通行密钥操作失败") });
// Rate-limited and deliberately ambiguous: the response must not reveal which accounts
// exist or which of them have a passkey.
app.post("/api/auth/passkey/options", authRateLimit(20), async (req, res) => {
  try {
    const user = db.prepare("SELECT id FROM users WHERE username=?").get(normalizeUsername(req.body.username));
    if (!user || !db.prepare("SELECT 1 FROM passkeys WHERE user_id=? LIMIT 1").get(user.id))
      return res.status(400).json({ error: "无法使用通行密钥登录，请改用密码" });
    res.json(await authenticationOptions(req, passkeySiteName(), "login", user.id));
  } catch (error) { passkeyError(res, error); }
});
app.post("/api/auth/passkey/verify", async (req, res) => {
  try {
    const userId = await finishAuthentication(req, passkeySiteName(), "login");
    const user = db.prepare("SELECT id,username,role,avatar,rp,bio,custom_css,custom_html,custom_head,custom_script,banned_until,ban_reason FROM users WHERE id=?").get(userId);
    if (user.banned_until > Date.now()) {
      const reason = user.ban_reason || "违反社区规则";
      const now = Date.now();
      const remaining = user.banned_until - now;
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
      const durationText = days > 365 ? "永久" : `${days} 天`;
      return res.status(403).json({
        error: `您的账号因「${reason}」已被封禁 ${durationText}`,
        banned: true,
        banned_until: user.banned_until,
        ban_reason: reason,
        remaining_days: days,
      });
    }
    res.json({ token: createSession(user.id), user: { ...user, avatar: user.avatar || "", rp: user.rp || 0 } });
  } catch (error) { passkeyError(res, error); }
});
app.get("/api/me", auth, (req, res) => res.json(req.user));
app.get("/api/me/customize", auth, (req, res) => res.json({ custom_css: req.user.custom_css || "", custom_script: req.user.custom_script || "", custom_html: req.user.custom_html || "", custom_head: req.user.custom_head || "" }));
app.put("/api/me/customize", auth, (req, res) => {
  const customCss = String(req.body.custom_css || "").slice(0, 100000);
  const customScript = String(req.body.custom_script || "").slice(0, 50000);
  const customHtml = String(req.body.custom_html || "").slice(0, 50000);
  const customHead = String(req.body.custom_head || "").slice(0, 30000);
  try {
    db.prepare("UPDATE users SET custom_css=?,custom_script=?,custom_html=?,custom_head=? WHERE id=?").run(customCss, customScript, customHtml, customHead, req.user.id);
    res.json({ custom_css: customCss, custom_script: customScript, custom_html: customHtml, custom_head: customHead });
  } catch (error) { res.status(500).json({ error: `自定义内容保存失败：${error.message}` }); }
});
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
  const locked = integrity.assetLocked(file.stored_name, req.query.sid);
  if (locked) return res.status(423).json(locked);
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
app.get("/api/users/search", auth, (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) return res.json([]);
  const rows = db.prepare("SELECT id,username,avatar,bio FROM users WHERE id<>? AND username LIKE ? ESCAPE '\\' ORDER BY username LIMIT 20")
    .all(req.user.id, `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  res.json(rows.map((user) => {
    const pair = friendPair(req.user.id, user.id);
    const relation = !pair ? "none" : pair.status === "accepted" ? "friend" : pair.requester_id === req.user.id ? "pending_out" : "pending_in";
    return { ...user, relation, request_id: pair && pair.status === "pending" && pair.addressee_id === req.user.id ? pair.id : null };
  }));
});
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

// The iOS "信" shell forwards device tokens to a separate push service.
app.post("/api/chat/push/register", auth, async (req, res) => {
  const base = String(process.env.IJ_CHAT_PUSH_BASE || "").replace(/\/+$/, "");
  const token = String(req.body?.token || "").toLowerCase();
  if (!base) return res.status(501).json({ error: "推送服务未配置" });
  if (!/^[a-f0-9]{32,400}$/.test(token) || !["sandbox", "production"].includes(req.body?.env)) return res.status(400).json({ error: "设备令牌无效" });
  try {
    const response = await fetch(`${base}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: req.user.id, token, env: req.body.env }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return res.status(502).json({ error: "推送服务暂时不可用" });
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "推送服务暂时不可用" });
  }
});

// ICE servers. Static STUN/TURN come from CALL_ICE_SERVERS; when the operator runs coturn
// with the TURN REST API (CALL_TURN_REST_SECRET), every user gets a short-lived credential.
const turnRestSecret = () => String(process.env.CALL_TURN_REST_SECRET || "");
const turnUrls = () => String(process.env.CALL_TURN_URLS || "").split(",").map((url) => url.trim()).filter(Boolean);
const turnTtlSeconds = () => Math.max(60, Math.min(86400, Number.parseInt(String(process.env.CALL_TURN_TTL || "3600"), 10) || 3600));

app.get("/api/calls/config", auth, (req, res) => {
  let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  const secret = turnRestSecret();
  const urls = turnUrls();
  if (secret && urls.length) {
    const username = `${Math.floor(Date.now() / 1000) + turnTtlSeconds()}:${req.user.id}`;
    const credential = createHmac("sha1", secret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  }
  if (process.env.CALL_ICE_SERVERS) {
    try {
      const configured = JSON.parse(process.env.CALL_ICE_SERVERS);
      if (Array.isArray(configured) && configured.length) iceServers = configured;
    } catch {
      // Keep the generated fallback when the optional environment value is invalid.
    }
  }
  res.set("Cache-Control", "no-store").json({ iceServers });
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
  if (post.user_id !== req.user.id && !["admin", "root"].includes(req.user.role)) return res.status(403).json({ error: "无权编辑此博客" });
  const title = String(req.body.title || "").trim(), content = String(req.body.content || "").trim();
  if (!title || title.length > 120 || !content) return res.status(400).json({ error: "请填写博客标题和内容" });
  db.prepare("UPDATE blog_posts SET title=?,content=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title, content, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/blog/:id", auth, (req, res) => {
  const post = db.prepare("SELECT user_id FROM blog_posts WHERE id=?").get(req.params.id);
  if (!post) return res.status(404).json({ error: "博客不存在" });
  if (post.user_id !== req.user.id && !["admin", "root"].includes(req.user.role)) return res.status(403).json({ error: "无权删除此博客" });
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
      .prepare("SELECT id,username,role,created_at,banned_until,ban_reason,banned_at FROM users ORDER BY id")
      .all(),
  ),
);
// Impersonation mints a session for any UID, so it must need the same Root gate as the
// control panel it is reached from — not just any admin with a stolen elevation header.
app.post("/api/admin/switch-user", elevatedAdmin, rootAdmin, (req, res) => {
  const uid = req.body.uid;
  if (!Number.isSafeInteger(uid) || uid < 1)
    return res.status(400).json({ error: "请输入有效的用户 UID" });
  if (uid === req.user.id)
    return res.status(400).json({ error: "已经是当前用户" });
  const user = db.prepare("SELECT id,username,role FROM users WHERE id=?").get(uid);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json({ token: createSession(user.id), user });
});
app.get("/api/admin/tag-users", auth, domainPerms.domainPermission("view_tag"), (_, res) => {
  const rows = db.prepare("SELECT u.id,u.username,COALESCE(json_group_array(l.tag_id) FILTER (WHERE l.tag_id IS NOT NULL),'[]') tag_ids,EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems p ON p.id=e.problem_id WHERE e.user_id=u.id AND p.anti_cheat_enabled AND e.count>=p.anti_cheat_limit AND e.last_event_at>?) cheater FROM users u LEFT JOIN user_tag_links l ON l.user_id=u.id GROUP BY u.id ORDER BY u.username").all(Date.now() - antiCheatResetMs());
  res.json(rows.map((x) => { const ids = JSON.parse(x.tag_ids).filter((id) => id !== -1); const disabled = db.prepare("SELECT disabled FROM user_tag_overrides WHERE user_id=? AND tag_id=-1").get(x.id)?.disabled; return { ...x, tag_ids: [...ids, ...(x.cheater && disabled !== 1 ? [-1] : [])] }; }));
});
app.get("/api/admin/tags", auth, domainPerms.domainPermission("view_tag"), (_, res) => res.json([{ id: -1, label: "作弊者", color: "#b08c00", scope: "personal", builtin: true }, ...db.prepare("SELECT t.*,COUNT(l.user_id) users FROM user_tags t LEFT JOIN user_tag_links l ON l.tag_id=t.id WHERE t.id<>-1 GROUP BY t.id ORDER BY t.id DESC").all()]));
app.post("/api/admin/tags", auth, domainPerms.domainPermission("manage_tag"), (req, res) => { const label=String(req.body.label||"").trim(), color=String(req.body.color||"#b08c00"), scope=req.body.scope === "global" ? "global" : "personal"; if (!label || label.length>24 || !/^#[0-9a-f]{6}$/i.test(color)) return res.status(400).json({error:"标签文字或颜色无效"}); const r=db.prepare("INSERT INTO user_tags(label,color,scope) VALUES(?,?,?)").run(label,color,scope); res.status(201).json({id:Number(r.lastInsertRowid),label,color,scope}); });
app.delete("/api/admin/tags/:id", auth, domainPerms.domainPermission("manage_tag"), (req,res)=>{ db.prepare("DELETE FROM user_tags WHERE id=?").run(req.params.id); res.status(204).end(); });
app.put("/api/admin/users/:id/tags", auth, domainPerms.domainPermission("manage_tag"), (req,res)=>{
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
  const immediatelyApproved=req.user.role==="admin"||req.user.role==="root";
  let userId=req.user.id;
  if (req.body.userId !== undefined) {
    if (!immediatelyApproved) return res.status(403).json({error:"需要管理员权限"});
    if (!Number.isSafeInteger(req.body.userId) || req.body.userId < 1)
      return res.status(400).json({error:"请输入有效的用户 UID"});
    userId=req.body.userId;
    if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(userId))
      return res.status(404).json({error:"用户不存在"});
  }
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
  const status=immediatelyApproved?"approved":"pending";
  try {
    const row=db.prepare("INSERT INTO certifications(user_id,kind,title,display_text,description,color,status,reviewed_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(user_id,kind) DO UPDATE SET title=excluded.title,display_text=excluded.display_text,description=excluded.description,color=excluded.color,status=excluded.status,reviewed_at=excluded.reviewed_at,created_at=CURRENT_TIMESTAMP RETURNING id").get(userId,kind,title,displayText,description,color,status,immediatelyApproved?1:0);
    res.status(201).json({ok:true,id:row.id,status});
  } catch(e){res.status(400).json({error:e.message});}
});
app.get("/api/admin/certifications", auth, domainPerms.domainPermission("review_certification"), (_,res)=>res.json(db.prepare("SELECT c.*,u.username FROM certifications c JOIN users u ON u.id=c.user_id ORDER BY c.status='pending' DESC,c.id DESC").all()));
app.put("/api/admin/certifications/:id", auth, domainPerms.domainPermission("review_certification"), (req,res)=>{ const status=["approved","rejected","revoked"].includes(req.body.status)?req.body.status:"rejected"; db.prepare("UPDATE certifications SET status=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(status,req.params.id); res.json({ok:true}); });
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
// --- Code reports (dangerous code auto-detection) ---
app.get("/api/admin/code-reports", admin, (req, res) => {
  const status = String(req.query.status || "pending");
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = db.prepare(
    `SELECT r.*,u.username,p.title AS problem_title
     FROM code_reports r
     JOIN users u ON u.id=r.user_id
     LEFT JOIN problems p ON p.id=r.problem_id
     WHERE r.status=?
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`
  ).all(status, limit, offset);
  const total = db.prepare("SELECT COUNT(*) count FROM code_reports WHERE status=?").get(status).count;
  res.json({
    reports: rows.map((r) => ({ ...r, matches: JSON.parse(r.matches || "[]") })),
    total,
  });
});
app.put("/api/admin/code-reports/:id", admin, (req, res) => {
  const report = db.prepare("SELECT id,status FROM code_reports WHERE id=?").get(req.params.id);
  if (!report) return res.status(404).json({ error: "报告不存在" });
  const status = String(req.body.status || "");
  if (!["reviewed", "dismissed", "pending"].includes(status))
    return res.status(400).json({ error: "状态无效" });
  const note = String(req.body.note || "").slice(0, 500);
  db.prepare(
    "UPDATE code_reports SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?"
  ).run(status, req.user.id, note, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/code-reports/:id", admin, (req, res) => {
  db.prepare("DELETE FROM code_reports WHERE id=?").run(req.params.id);
  res.status(204).end();
});
// --- User ban management ---
app.post("/api/admin/users/:id/ban", rootAdmin, (req, res) => {
  const target = db.prepare("SELECT id,role,banned_until FROM users WHERE id=?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (target.role === "root") return res.status(403).json({ error: "不能封禁 Root 用户" });
  const durationMs = Number(req.body.duration_ms || 0);
  const reason = String(req.body.reason || "").slice(0, 500);
  const bannedUntil = durationMs > 0 ? Date.now() + durationMs : 0;
  db.prepare(
    "UPDATE users SET banned_until=?,ban_reason=?,banned_by=?,banned_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(bannedUntil, reason, req.user.id, req.params.id);
  // Invalidate all sessions for the banned user
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
  res.json({ ok: true, banned_until: bannedUntil, reason });
});
app.post("/api/admin/users/:id/unban", rootAdmin, (req, res) => {
  const target = db.prepare("SELECT id FROM users WHERE id=?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  db.prepare(
    "UPDATE users SET banned_until=0,ban_reason='',banned_by=NULL,banned_at='' WHERE id=?"
  ).run(req.params.id);
  res.json({ ok: true });
});
app.post("/api/admin/users/import", auth, domainPerms.domainPermission("import_user"), (req, res) => {
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
app.post("/api/admin/problems/import", auth, domainPerms.domainPermission("create_problem"), problemPackageUpload.single("package"), (req, res) => {
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
    const domainId = req.domain.id;
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
      .all()
      .filter((d) => domainPerms.permissionsFor(req.user, d.id).perms.view),
  ),
);
app.post("/api/domains", auth, (req, res, next) => req.user.role === "root" ? next() : res.status(403).json({ error: "只有 Root 可以创建域", code: "ROOT_REQUIRED" }), (req, res) => {
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
app.get("/api/domains/:id", auth, domainPerms.domainPermission("view", (req) => req.params.id), (req, res) => {
  const d = db
    .prepare(
      `SELECT d.*,u.username owner FROM domains d JOIN users u ON u.id=d.owner_id WHERE d.id=?`,
    )
    .get(req.params.id);
  if (!d) return res.status(404).json({ error: "域不存在" });
  const perms = req.domainPermissions.perms;
  d.carousel = parseCarousel(d.carousel);
  // Members are private to people who manage them or may see private info.
  d.members = perms.manage_user || perms.view_private
    ? db
        .prepare(
          `SELECT m.*,u.username FROM domain_members m JOIN users u ON u.id=m.user_id WHERE domain_id=? ORDER BY m.joined_at`,
        )
        .all(d.id)
    : [];
  d.applications =
    perms.join_application
      ? db
          .prepare(
            `SELECT a.*,u.username FROM domain_applications a JOIN users u ON u.id=a.user_id WHERE domain_id=? ORDER BY a.id DESC`,
          )
          .all(d.id)
      : [];
  d.my_permissions = perms;
  d.my_role = req.domainPermissions.role;
  res.json(d);
});
app.put("/api/domains/:id", auth, domainPerms.domainPermission("edit_domain", (req) => req.params.id), (req, res) => {
  const name = String(req.body.name || "").trim(),
    avatar = String(req.body.avatar || "").trim(),
    announcement = String(req.body.announcement || ""),
    join_method = String(req.body.join_method || "application"),
    invite_code = String(req.body.invite_code || "").trim(),
    carousel_interval = Math.max(1, Math.min(60, Number(req.body.carousel_interval) || 5)),
    carousel = (Array.isArray(req.body.carousel) ? req.body.carousel : [])
      .slice(0, 10)
      .map((item) => ({
        image: String(item?.image || "").trim(),
        title: String(item?.title || "").trim().slice(0, 100),
        link: String(item?.link || "").trim(),
      }))
      .filter((item) => item.image);
  if (
    !name ||
    name.length > 50 ||
    !["closed", "application", "open", "invite"].includes(join_method)
  )
    return res.status(400).json({ error: "域设置无效" });
  const r = db
    .prepare(
      "UPDATE domains SET name=?,avatar=?,announcement=?,join_method=?,invite_code=?,carousel=?,carousel_interval=? WHERE id=?",
    )
    .run(name, avatar, announcement, join_method, invite_code, JSON.stringify(carousel), carousel_interval, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "域不存在" });
  if (Number(primaryDomain()?.id) === Number(req.params.id)) {
    const site = setting("site", {});
    db.prepare("UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='site'").run(JSON.stringify({ ...site, announcement }));
  }
  res.json({ ok: true });
});
app.delete("/api/domains/:id", auth, domainPerms.domainPermission("manage_domain", (req) => req.params.id), (req, res) => {
  const d = db.prepare("SELECT id FROM domains WHERE id=?").get(req.params.id);
  if (!d) return res.status(404).json({ error: "域不存在" });
  if (db.prepare("SELECT COUNT(*) n FROM domains").get().n <= 1)
    return res.status(409).json({ error: "至少需要保留一个域，无法删除" });
  const ids = db.prepare("SELECT id FROM problems WHERE domain_id=?").all(d.id).map((row) => row.id);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (ids.length) {
      db.exec("CREATE TEMP TABLE IF NOT EXISTS _domain_problems(id TEXT PRIMARY KEY)");
      db.exec("DELETE FROM _domain_problems");
      const mark = db.prepare("INSERT INTO _domain_problems(id) VALUES(?)");
      for (const id of ids) mark.run(id);
      for (const sql of [
        "DELETE FROM contest_hacks WHERE problem_id IN (SELECT id FROM _domain_problems) OR target_submission_id IN (SELECT id FROM submissions WHERE problem_id IN (SELECT id FROM _domain_problems))",
        "DELETE FROM submissions WHERE problem_id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM contest_problems WHERE problem_id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM contest_score_overrides WHERE problem_id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM learning_problems WHERE problem_id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM problem_focus_events WHERE problem_id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM problems WHERE id IN (SELECT id FROM _domain_problems)",
        "DELETE FROM _domain_problems",
      ]) db.exec(sql);
    }
    const wasPrimary = Number(primaryDomain()?.id) === d.id;
    db.prepare("DELETE FROM domains WHERE id=?").run(d.id);
    if (wasPrimary) {
      const site = setting("site", { announcement: "" });
      db.prepare("UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='site'").run(JSON.stringify({ ...site, announcement: primaryDomain()?.announcement ?? "" }));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  res.json({ ok: true, removed: { problems: ids.length } });
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
  auth,
  domainPerms.domainPermission("join_application", (req) => req.params.domainId),
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
app.put("/api/domains/:domainId/members/:userId", auth, domainPerms.domainPermission("manage_user", (req) => req.params.domainId), (req, res) => {
  const allowed = ["member", "manager", ...db.prepare("SELECT name FROM domain_roles WHERE domain_id=?").all(req.params.domainId).map((row) => row.name)];
  if (!allowed.includes(req.body.role))
    return res.status(400).json({ error: "角色无效" });
  if (Number(req.params.userId) === Number(req.user.id) && req.body.role !== req.domainPermissions.role)
    return res.status(400).json({ error: "不能修改自己的域角色" });
  const r = db
    .prepare(
      "UPDATE domain_members SET role=? WHERE domain_id=? AND user_id=? AND role!='owner'",
    )
    .run(req.body.role, req.params.domainId, req.params.userId);
  res.json({ ok: !!r.changes });
});
app.post("/api/admin/maintenance/:action", auth, domainPerms.domainPermission("maintenance"), (req, res) => {
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
app.get("/api/settings/site", async (req, res) => {
  const row = db
    .prepare("SELECT value FROM system_settings WHERE key='site'")
    .get();
  const value = JSON.parse(row.value);
  const requestedDomainId = Number(req.headers["x-domain-id"]);
  const main = (requestedDomainId && db.prepare("SELECT id,announcement,carousel,carousel_interval FROM domains WHERE id=?").get(requestedDomainId)) || primaryDomain();
  const pageSize = Math.max(1, Math.min(500, Number(setting("advanced", {})?.pagination?.problems) || 100));
  const licenseTier = await siteLicense(db, value.serviceUrl);
  res.json({ ...value, licenseTier, carousel: parseCarousel(main?.carousel), carouselInterval: Math.max(1, Math.min(60, Number(main?.carousel_interval) || 5)), pagination: { problems: pageSize }, homeAnnouncement: value.homeAnnouncement || value.announcement || `# 欢迎使用 ${value.name}\n\n一个兼容 HydroOJ 插件、支持本地沙箱评测的在线编程系统。`, domainAnnouncement: value.domainAnnouncement ?? main?.announcement ?? "" });
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
  const advanced = readAdvanced();
  const configuredEmail = setting("email", { enabled: false, smtp: {} }) || {};
  const email = {
    ...configuredEmail,
    smtp: { ...(configuredEmail.smtp || {}), pass: "" },
  };
  res.json({
    ...advanced,
    ai: publicAiSettings(readAiSettings()),
    email,
  });
});
app.get("/api/admin/settings/license", elevatedAdmin, async (_, res) => {
  const config = licenseConfig(db);
  const tier = await siteLicense(db, setting("site", {})?.serviceUrl || "http://localhost");
  res.json({ serverUrl: config.serverUrl, keyConfigured: Boolean(config.key), keyMasked: config.key ? `••••••••${config.key.slice(-5)}` : "", tier });
});
app.put("/api/admin/settings/license", elevatedAdmin, async (req, res) => {
  try {
    const current = licenseConfig(db);
    const config = saveLicenseConfig(db, { serverUrl: req.body?.serverUrl, key: req.body?.clearKey ? "" : (req.body?.key || current.key) });
    const tier = await siteLicense(db, setting("site", {})?.serviceUrl || "http://localhost");
    res.json({ serverUrl: config.serverUrl, keyConfigured: Boolean(config.key), keyMasked: config.key ? `••••••••${config.key.slice(-5)}` : "", tier });
  } catch (cause) { res.status(400).json({ error: cause.message || "授权配置无效" }); }
});
app.get("/api/about", (_, res) => res.json({
  content: String(setting("advanced", {})?.about || bundledAbout || "").replace(/\]\((?:\.\/)?LICENSE\)/gi, "](/about/license)"),
  version: localVersion,
  name: setting("site", {})?.name || "InfiniteJudge",
}));
app.get("/api/license", (_, res) => res.json({ content: bundledLicense, name: "InfiniteJudge 部署与署名许可协议" }));
app.put("/api/admin/settings/advanced", elevatedAdmin, (req, res) => {
  const currentAdvanced = readAdvanced();
  const dedicatedAi = separateAiSetting();
  const currentEmail = setting("email", { enabled: false, smtp: {} });
  const email = req.body.email || {};
  const smtp = { ...(currentEmail.smtp || {}), ...(email.smtp || {}) };
  if (!smtp.pass) smtp.pass = currentEmail.smtp?.pass || "";
  if (email.enabled && (!smtp.host || !smtp.port || !smtp.from))
    return res.status(400).json({ error: "启用邮件验证前请填写 SMTP 地址、端口和发件人" });
  let ai;
  try {
    // Once the dedicated setting exists, it wins over the snapshot included
    // in an advanced-settings form. The control panel saves both sections in
    // parallel, so accepting that stale snapshot here could overwrite a new
    // API key entered in the dedicated request.
    ai = dedicatedAi ? readAiSettings() : parseAiInput(req.body.ai ?? currentAdvanced.ai, currentAdvanced.ai);
  }
  catch (error) { return res.status(400).json({ error: error.message || "AI 配置无效" }); }
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
    ai,
    integrity: {
      autoZeroViolations: req.body.integrity?.autoZeroViolations !== false,
      autoZeroThreshold: Math.max(0.3, Math.min(1, Number(req.body.integrity?.autoZeroThreshold) || 0.72)),
    },
  };
  const save = db.prepare("INSERT INTO system_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
  save.run("advanced", JSON.stringify(advanced));
  save.run("email", JSON.stringify({ enabled: Boolean(email.enabled), smtp }));
  res.json({ ...advanced, ai: publicAiSettings(ai), email: { enabled: Boolean(email.enabled), smtp: { ...smtp, pass: "" } } });
});
const aiChatEndpoint = (baseUrl) => {
  const base = normalizeAiBaseUrl(baseUrl);
  return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
};
const readLimitedResponse = async (response, limit = AI_MAX_RESPONSE_BYTES) => {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > limit) {
        await reader.cancel();
        throw new Error("AI 响应过大");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock?.(); }
  return Buffer.concat(chunks).toString("utf8");
};
// Upstream failures were silently collapsed into "AI 服务暂时不可用", which makes a bad
// model name indistinguishable from an invalid key. Surface the provider's error kind
// (never the request or the key) in the response and the server log.
const AI_UPSTREAM_HINTS = {
  authentication_error: "AI 密钥无效或已过期，请在配置管理中更新 API Key",
  invalid_api_key: "AI 密钥无效或已过期，请在配置管理中更新 API Key",
  invalid_request_error: "AI 接口拒绝了请求（常见原因：模型名称或接口地址不正确）",
  model_not_found: "AI 模型不存在，请检查配置管理中的模型名称",
  insufficient_balance: "AI 账户余额不足，请前往服务商充值",
  rate_limit_exceeded: "AI 服务限流，请稍后再试",
  server_error: "AI 服务商暂时故障，请稍后再试",
};
const aiUpstreamMessage = (body) => {
  const value = body?.error;
  const message = String(typeof value === "string" ? value : value?.message || "");
  for (const kind of [typeof value === "string" ? "" : value?.type, value?.code]) {
    if (AI_UPSTREAM_HINTS[kind]) return AI_UPSTREAM_HINTS[kind];
  }
  if (/model/i.test(message) && /not\s*(found|exist)|does not exist|无此模型|不存在/i.test(message)) return AI_UPSTREAM_HINTS.model_not_found;
  return "AI 服务暂时不可用";
};
const assistantUsage = new Map();
const AI_RATE_WINDOW_MS = 60_000;
const AI_RATE_LIMIT = 30;
const AI_MAX_CONCURRENT = 2;
const acquireAiSlot = (req) => {
  const key = `${req.user.id}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
  const now = Date.now();
  let state = assistantUsage.get(key);
  if (!state) { state = { timestamps: [], inFlight: 0 }; assistantUsage.set(key, state); }
  state.timestamps = state.timestamps.filter((stamp) => now - stamp < AI_RATE_WINDOW_MS);
  if (state.inFlight >= AI_MAX_CONCURRENT || state.timestamps.length >= AI_RATE_LIMIT) return null;
  state.timestamps.push(now);
  state.inFlight += 1;
  return key;
};
const releaseAiSlot = (key) => {
  const state = assistantUsage.get(key);
  if (!state) return;
  state.inFlight = Math.max(0, state.inFlight - 1);
  const cutoff = Date.now() - AI_RATE_WINDOW_MS;
  state.timestamps = state.timestamps.filter((stamp) => stamp > cutoff);
  if (!state.inFlight && !state.timestamps.length) assistantUsage.delete(key);
};
const publicRuntimeAi = () => {
  const value = readAiSettings();
  return { enabled: Boolean(value.enabled && value.apiKey), model: value.model, provider: value.provider };
};
app.get("/api/ai/config", (_, res) => {
  res.set("Cache-Control", "no-store").json(publicRuntimeAi());
});
app.get("/api/assistant/config", (_, res) => {
  res.set("Cache-Control", "no-store").json(publicRuntimeAi());
});
app.get("/api/admin/settings/ai", elevatedAdmin, (_, res) => {
  res.set("Cache-Control", "no-store").json(publicAiSettings());
});
app.put("/api/admin/settings/ai", elevatedAdmin, (req, res) => {
  try {
    const value = parseAiInput(req.body, readAiSettings());
    if (value.enabled && !value.apiKey) return res.status(400).json({ error: "启用 AI 助手前请填写 API Key" });
    const saved = saveAiSettings(value);
    res.set("Cache-Control", "no-store").json(publicAiSettings(saved));
  } catch (error) { res.status(400).json({ error: error.message || "AI 配置无效" }); }
});
const normalizeChatMessages = (body) => {
  let incoming = body?.messages;
  if (incoming === undefined && typeof body?.message === "string") incoming = [{ role: "user", content: body.message }];
  if (!Array.isArray(incoming) || !incoming.length) throw new Error("请输入消息");
  if (incoming.length > AI_MAX_MESSAGES) throw new Error(`消息历史不能超过 ${AI_MAX_MESSAGES} 条`);
  let total = 0;
  const messages = incoming.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("消息格式无效");
    const role = item.role;
    // The system instruction is owned by the control panel.  Accepting a
    // client supplied system message would let a user override that policy.
    if (!["user", "assistant"].includes(role)) throw new Error("消息角色无效");
    if (typeof item.content !== "string") throw new Error("消息内容必须是文本");
    const content = item.content.trim();
    if (!content || content.length > AI_MAX_MESSAGE_CHARS) throw new Error(`单条消息不能超过 ${AI_MAX_MESSAGE_CHARS} 个字符且不能为空`);
    total += content.length;
    if (total > AI_MAX_TOTAL_CHARS) throw new Error(`消息总长度不能超过 ${AI_MAX_TOTAL_CHARS} 个字符`);
    return { role, content };
  });
  return messages;
};
const extractAssistantContent = (body) => {
  const value = body?.choices?.[0]?.message?.content;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : String(part?.text || "")).join("");
  return "";
};
const handleAiChat = async (req, res) => {
  const config = readAiSettings();
  if (!config.enabled || !config.apiKey) return res.status(503).json({ error: "AI 助手尚未配置，请联系管理员" });
  let messages;
  try { messages = normalizeChatMessages(req.body); }
  catch (error) { return res.status(400).json({ error: error.message || "消息格式无效" }); }
  if (config.systemPrompt) {
    const system = { role: "system", content: config.systemPrompt };
    if (messages[0]?.role === "system") messages = [system, ...messages.slice(1)];
    else messages = [system, ...messages];
  }
  const slot = acquireAiSlot(req);
  if (!slot) {
    res.set("Retry-After", "5");
    return res.status(429).json({ error: "AI 请求过于频繁，请稍后再试" });
  }
  const controller = new AbortController();
  const timeout = Math.max(100, Math.min(120000, Number(config.timeoutMs) || DEFAULT_AI_SETTINGS.timeoutMs));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(aiChatEndpoint(config.baseUrl), {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, temperature: config.temperature, max_tokens: config.maxTokens, stream: false }),
    });
    let raw;
    try { raw = await readLimitedResponse(response); }
    catch (error) { return res.status(502).json({ error: "AI 服务响应过大" }); }
    let body;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { return res.status(502).json({ error: response.ok ? "AI 服务返回了无效响应" : "AI 服务暂时不可用" }); }
    if (!response.ok) {
      // Log only the provider's error kind: the body may echo request details.
      const error = body?.error;
      const kind = error && typeof error === "object" ? `${error.type || ""}/${error.code || ""}` : "";
      console.warn(`[ai] upstream ${response.status} ${kind} model=${config.model}`);
      return res.status(502).json({ error: aiUpstreamMessage(body) });
    }
    const content = extractAssistantContent(body).trim();
    if (!content || content.length > AI_MAX_RESPONSE_BYTES) return res.status(502).json({ error: "AI 服务没有返回有效内容" });
    res.set("Cache-Control", "no-store").json({ message: { role: "assistant", content }, content, model: typeof body?.model === "string" ? body.model : config.model, usage: body?.usage && typeof body.usage === "object" ? { prompt_tokens: Number(body.usage.prompt_tokens) || 0, completion_tokens: Number(body.usage.completion_tokens) || 0, total_tokens: Number(body.usage.total_tokens) || 0 } : undefined });
  } catch (error) {
    if (error?.name === "AbortError") return res.status(504).json({ error: "AI 服务请求超时" });
    // fetch failures (DNS, TLS, connection reset) land here; the message names the cause.
    console.warn(`[ai] request failed: ${error?.message || error}`);
    return res.status(502).json({ error: `AI 服务暂时不可用：${String(error?.cause?.code || error?.message || "连接失败").slice(0, 120)}` });
  } finally {
    clearTimeout(timer);
    releaseAiSlot(slot);
  }
};
app.post("/api/ai/chat", auth, handleAiChat);
app.post("/api/assistant/chat", auth, handleAiChat);

// Persist AI conversations per account. Every lookup includes user_id so a
// conversation token cannot be used to read another user's history.
const AI_TITLE_MAX_CHARS = 80;
const AI_HISTORY_MESSAGE_MAX_CHARS = 64_000;
const conversationId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const conversationTitle = (value) => {
  const title = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return title.slice(0, AI_TITLE_MAX_CHARS) || "新对话";
};
const getConversation = (id, userId) => db.prepare(
  "SELECT id,user_id,title,created_at,updated_at FROM ai_conversations WHERE id=? AND user_id=?",
).get(id, userId);
const listConversations = (req, res) => {
  const rows = db.prepare(
    "SELECT id,title,created_at,updated_at,(SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id=ai_conversations.id) message_count FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC,id DESC",
  ).all(req.user.id);
  res.set("Cache-Control", "no-store").json({ conversations: rows });
};
const createConversation = (req, res) => {
  const title = conversationTitle(req.body?.title);
  const result = db.prepare("INSERT INTO ai_conversations(user_id,title) VALUES(?,?)").run(req.user.id, title);
  const row = getConversation(Number(result.lastInsertRowid), req.user.id);
  res.status(201).json({ conversation: { ...row, messages: [] } });
};
const readConversation = (req, res) => {
  const id = conversationId(req.params.id);
  if (!id) return res.status(400).json({ error: "会话 ID 无效" });
  const row = getConversation(id, req.user.id);
  if (!row) return res.status(404).json({ error: "会话不存在" });
  const messages = db.prepare("SELECT id,role,content,created_at FROM ai_messages WHERE conversation_id=? ORDER BY id").all(id);
  res.set("Cache-Control", "no-store").json({ conversation: { ...row, messages } });
};
const appendConversationMessage = (req, res) => {
  const id = conversationId(req.params.id);
  if (!id) return res.status(400).json({ error: "会话 ID 无效" });
  if (!getConversation(id, req.user.id)) return res.status(404).json({ error: "会话不存在" });
  const role = req.body?.role;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (role !== "user" && role !== "assistant") return res.status(400).json({ error: "消息角色无效" });
  if (!content || content.length > AI_HISTORY_MESSAGE_MAX_CHARS) return res.status(400).json({ error: "消息内容无效或过长" });
  const result = db.prepare("INSERT INTO ai_messages(conversation_id,role,content) VALUES(?,?,?)").run(id, role, content);
  const title = role === "user" ? conversationTitle(content) : null;
  if (title) db.prepare("UPDATE ai_conversations SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(title, id, req.user.id);
  else db.prepare("UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(id, req.user.id);
  const message = db.prepare("SELECT id,role,content,created_at FROM ai_messages WHERE id=?").get(Number(result.lastInsertRowid));
  res.status(201).json({ message });
};
const deleteConversation = (req, res) => {
  const id = conversationId(req.params.id);
  if (!id) return res.status(400).json({ error: "会话 ID 无效" });
  const result = db.prepare("DELETE FROM ai_conversations WHERE id=? AND user_id=?").run(id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: "会话不存在" });
  res.status(204).end();
};
for (const prefix of ["/api/ai/conversations", "/api/assistant/conversations"]) {
  app.get(prefix, auth, listConversations);
  app.post(prefix, auth, createConversation);
  app.get(`${prefix}/:id`, auth, readConversation);
  app.post(`${prefix}/:id/messages`, auth, appendConversationMessage);
  app.delete(`${prefix}/:id`, auth, deleteConversation);
}
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
app.post("/api/admin/settings/countdown", auth, domainPerms.domainPermission("manage_countdown"), (req, res) => {
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
app.put("/api/admin/settings/countdown/:id", auth, domainPerms.domainPermission("manage_countdown"), (req, res) => {
  const title = String(req.body.title || "").trim(), target = new Date(req.body.target);
  if (!title || Number.isNaN(target.getTime())) return res.status(400).json({ error: "倒计时配置无效" });
  const result = db.prepare("UPDATE countdowns SET title=?,target=? WHERE id=?").run(title, target.toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "倒计时不存在" });
  res.json({ id: Number(req.params.id), title, target: target.toISOString() });
});
app.delete("/api/admin/settings/countdown/:id", auth, domainPerms.domainPermission("manage_countdown"), (req, res) => {
  db.prepare("DELETE FROM countdowns WHERE id=?").run(req.params.id); res.status(204).end();
});
app.get("/api/problems", (req, res) => {
  const token=req.headers.authorization?.replace(/^Bearer /,""), viewer=token?db.prepare("SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token,Date.now()):null;
  // Listing follows the same rule as opening one problem.
  if (!domainPerms.permissionsFor(viewer ? db.prepare("SELECT id,role FROM users WHERE id=(SELECT user_id FROM sessions WHERE token=?)").get(token) : null, Number(req.headers["x-domain-id"])||primaryDomain()?.id).perms.view_problem) return res.json([]);
  const domainId=Number(req.headers["x-domain-id"])||primaryDomain()?.id, conditions=["domain_id=?"], args=[domainId];
  const viewerUser = viewer && token ? db.prepare("SELECT id,role FROM users WHERE id=(SELECT user_id FROM sessions WHERE token=?)").get(token) : null;
  if (!domainPerms.permissionsFor(viewerUser, domainId).perms.view_hidden_problem) conditions.push("hidden=0");
  const rows = db.prepare(`SELECT * FROM problems WHERE ${conditions.join(" AND ")} ORDER BY id`).all(...args);
  res.json(rows.map((r) => publicProblem(r)));
});
app.get("/api/problems/:id", (req, res) => {
  const raw=decodeURIComponent(req.params.id), cross=raw.startsWith("*"), id=cross?raw.slice(1):raw, domainId=Number(req.headers["x-domain-id"])||primaryDomain()?.id;
  const row=cross?db.prepare("SELECT p.*,d.slug source_domain FROM problems p LEFT JOIN domains d ON d.id=p.domain_id WHERE p.id=? ORDER BY p.domain_id LIMIT 1").get(id):db.prepare("SELECT * FROM problems WHERE id=? AND domain_id=?").get(id,domainId);
  if (!row) return res.status(404).json({ error: "题目不存在" });
  const token=req.headers.authorization?.replace(/^Bearer /,""), viewerUser=token?db.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token,Date.now()):null;
  const detailPerms=domainPerms.permissionsFor(viewerUser, row.domain_id || domainId).perms;
  if (!detailPerms.view_problem) return res.status(404).json({ error: "题目不存在" });
  if (row.hidden && !detailPerms.view_hidden_problem) return res.status(404).json({error:"题目不存在"});
  const result=publicProblem(row,true); if(cross){result.id=`*${row.id}`;result.source_domain=row.source_domain;} res.json(result);
});
app.get("/api/contests/:contestId/problems/:problemId", auth, (req, res) => {
  const contest = db.prepare("SELECT id,type,starts_at FROM contests WHERE id=?").get(req.params.contestId);
  if (!contest) return res.status(404).json({ error: "比赛不存在" });
  if (Date.now() < new Date(contest.starts_at).getTime() && !["admin", "root"].includes(req.user.role)) return res.status(403).json({ error: "比赛尚未开始" });
  const row = db.prepare("SELECT p.* FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=? AND cp.problem_id=?").get(contest.id, req.params.problemId);
  if (!row) return res.status(404).json({ error: "该题目不属于本场比赛" });
  if (contest.type === "OIL" && !["admin", "root"].includes(req.user.role)) {
    const participant = db.prepare("SELECT locked,seat_no FROM contest_participants WHERE contest_id=? AND user_id=?").get(contest.id, req.user.id);
    if (!participant) return res.status(403).json({ error: "你尚未加入本场比赛" });
    const contestRules = db.prepare("SELECT problem_kinds,personal_problem_count,team_size,mystery_problem FROM contests WHERE id=?").get(contest.id);
    let kinds = {}; try { kinds = JSON.parse(contestRules?.problem_kinds || "{}"); } catch {}
    const position = db.prepare("SELECT position FROM contest_problems WHERE contest_id=? AND problem_id=?").get(contest.id,row.id)?.position;
    const personalCount = Number(contestRules?.personal_problem_count) || Number(contestRules?.team_size) || 5;
    const kind = kinds[row.id] || (Number(position) < personalCount ? "personal" : "team");
    if (participant.locked && kind === "personal") return res.status(403).json({ error: "锁题后不能查看个人题" });
  }
  res.json(publicProblem(row, true));
});
app.get("/api/contests", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, ""), viewer = token ? db.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token, Date.now()) : null;
  const domainId = Number(req.headers["x-domain-id"]) || primaryDomain()?.id;
  const perms = domainPerms.permissionsFor(viewer, domainId).perms;
  if (!perms.view_contest) return res.json([]);
  res.json(db.prepare("SELECT * FROM contests ORDER BY starts_at").all().filter((c) => perms.view_all_contest || c.starts_at <= new Date().toISOString().replace("T", " ").slice(0, 19)).map((c) => perms.view_all_contest ? c : { ...c, team_assignments: "[]" }));
});
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
  const domainId = Number(req.headers["x-domain-id"]) || primaryDomain()?.id;
  res.json(db.prepare("SELECT c.*,u.username creator FROM learning_collections c JOIN users u ON u.id=c.created_by WHERE c.kind=? AND c.domain_id=? ORDER BY COALESCE(c.starts_at,c.created_at) DESC").all(kind, domainId));
});
app.get("/api/learning/:kind/:id", (req, res) => {
  const kind = collectionKind(req.params.kind), row = kind && db.prepare("SELECT c.*,u.username creator FROM learning_collections c JOIN users u ON u.id=c.created_by WHERE c.kind=? AND c.id=?").get(kind, req.params.id);
  if (!row) return res.status(404).json({ error: "内容不存在" });
  res.json({ ...row, problems: collectionProblems.all(row.id) });
});
const learningPermission = (req) => {
  const kind = req.params.kind;
  return kind === "homework" ? "create_homework" : "create_training";
};
const learningOwnPermission = (req) => {
  const kind = req.params.kind;
  return kind === "homework" ? "modify_own_homework" : "modify_own_training";
};
const learningAnyPermission = (req) => {
  const kind = req.params.kind;
  return kind === "homework" ? "modify_homework" : "modify_training";
};
const learningCreator = (req) => db.prepare("SELECT created_by FROM learning_collections WHERE id=?").get(req.params.id)?.created_by;
const canModifyLearning = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "请先登录" });
  const row = db.prepare("SELECT domain_id,created_by FROM learning_collections WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "内容不存在" });
  const perms = domainPerms.permissionsFor(req.user, row.domain_id).perms;
  if (!perms[learningAnyPermission(req)] && !(row.created_by === req.user.id && perms[learningOwnPermission(req)]))
    return res.status(403).json({ error: "当前域没有该权限" });
  next();
};
app.post("/api/admin/learning/:kind", auth, (req, res, next) => domainPerms.domainPermission(learningPermission(req))(req, res, next), (req, res) => {
  const kind = collectionKind(req.params.kind), value = collectionBody(req.body);
  if (!kind || !value.title) return res.status(400).json({ error: "请填写标题" });
  if ((value.startsAt && Number.isNaN(value.startsAt.getTime())) || (value.endsAt && Number.isNaN(value.endsAt.getTime()))) return res.status(400).json({ error: "时间格式无效" });
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) return res.status(400).json({ error: "结束时间必须晚于开始时间" });
  if (value.problems.some((id) => !db.prepare("SELECT 1 FROM problems WHERE id=?").get(id))) return res.status(400).json({ error: "包含不存在的题目" });
  const result = db.prepare("INSERT INTO learning_collections(kind,title,description,starts_at,ends_at,created_by,domain_id) VALUES(?,?,?,?,?,?,?)").run(kind, value.title, value.description, value.startsAt?.toISOString() || null, value.endsAt?.toISOString() || null, req.user.id, req.domain.id);
  const insert = db.prepare("INSERT INTO learning_problems(collection_id,problem_id,position) VALUES(?,?,?)");
  value.problems.forEach((id, index) => insert.run(result.lastInsertRowid, id, index));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.put("/api/admin/learning/:kind/:id", auth, canModifyLearning, (req, res) => {
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
app.delete("/api/admin/learning/:kind/:id", auth, canModifyLearning, (req, res) => {
  const kind = collectionKind(req.params.kind);
  if (!kind) return res.status(404).end();
  db.prepare("DELETE FROM learning_collections WHERE id=? AND kind=?").run(req.params.id, kind);
  res.status(204).end();
});
app.get("/api/submissions", (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.id,s.problem_id,p.title title,p.title problem,u.username user,EXISTS(SELECT 1 FROM problem_focus_events e JOIN problems fp ON fp.id=e.problem_id WHERE e.user_id=u.id AND fp.anti_cheat_enabled AND e.count>=fp.anti_cheat_limit AND e.last_event_at>?) cheater,s.status,s.score,s.language,s.time_ms,s.memory_kb,s.created_at,s.user_id,p.domain_id FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id ORDER BY s.id DESC LIMIT 100`,
    )
    .all(Date.now()-antiCheatResetMs());
  const token = req.headers.authorization?.replace(/^Bearer /, ""), viewer = token ? db.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token, Date.now()) : null;
  res.json(rows.filter((row) => row.user_id === viewer?.id || domainPerms.permissionsFor(viewer, row.domain_id).perms.view_record_other).map(({ user_id, domain_id, ...row }) => row));
});
app.get("/api/submissions/:id", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const viewer = token ? db.prepare("SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?").get(token, Date.now()) : null;
  const row = db
    .prepare(
      "SELECT s.id,s.user_id,s.problem_id,p.title,s.language,s.source,s.status,s.score,s.time_ms,s.memory_kb,s.detail,s.created_at,u.username user,u.role viewer_role FROM submissions s JOIN problems p ON p.id=s.problem_id JOIN users u ON u.id=s.user_id WHERE s.id=?",
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  // Owner, holders of "read all code", or anyone allowed to read the accepted
  // code of a problem this viewer has already solved.
  const domainId = db.prepare("SELECT domain_id FROM problems WHERE id=?").get(row.problem_id)?.domain_id;
  const perms = domainPerms.permissionsFor(viewer, domainId).perms;
  const ownView = Boolean(viewer && viewer.id === row.user_id);
  const acceptedView = Boolean(viewer && row.status === "Accepted" && perms.read_accepted_code);
  const canViewCode = ownView || perms.read_record_code || acceptedView;
  const { source, detail, viewer_role, ...metadata } = row;
  const session = canViewCode ? db.prepare("SELECT violations FROM problem_sessions WHERE user_id=? AND problem_id=? AND verdict<>'Dismissed' ORDER BY id DESC LIMIT 1").get(row.user_id, row.problem_id) : null;
  const integrity = session ? JSON.parse(session.violations || "[]").slice(-6) : [];
  res.json({ ...metadata, source: canViewCode ? source : null, detail: canViewCode ? JSON.parse(detail) : [], can_view_code: canViewCode, integrity });
});
app.get("/api/contests/:id/ranking", (req, res) => {
  db.exec("CREATE TABLE IF NOT EXISTS contest_score_overrides(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,subject_type TEXT NOT NULL,subject_id INTEGER NOT NULL,problem_id TEXT NOT NULL REFERENCES problems(id),score INTEGER NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(contest_id,subject_type,subject_id,problem_id))");
  const contest = db.prepare("SELECT id,type,starts_at,duration,problem_kinds,personal_problem_count,team_size FROM contests WHERE id=?").get(req.params.id);
  if (!contest) return res.status(404).json({ error: "比赛不存在" });
  const formatSqlTime = (time) => new Date(time).toISOString().slice(0, 19).replace("T", " ");
  const start = formatSqlTime(contest.starts_at);
  const end = formatSqlTime(new Date(contest.starts_at).getTime() + Number(contest.duration) * 60_000);
  const problems = db.prepare("SELECT cp.problem_id id,p.title,cp.position FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=? ORDER BY cp.position").all(contest.id);
  const baseRows = db.prepare(`
    WITH contest_submissions AS (
      SELECT s.* FROM submissions s
      WHERE s.contest_id=? AND s.created_at>=? AND s.created_at<=?
      UNION
      SELECT s.* FROM submissions s
      WHERE s.contest_id IS NULL
        AND s.created_at>=? AND s.created_at<=?
        AND EXISTS (SELECT 1 FROM contest_problems cp WHERE cp.contest_id=? AND cp.problem_id=s.problem_id)
    ), best AS (
      SELECT user_id,problem_id,MAX(score) score,MAX(CASE WHEN status='Accepted' THEN 1 ELSE 0 END) accepted,MAX(created_at) last_submit_at
      FROM contest_submissions GROUP BY user_id,problem_id
    )
    SELECT u.id user_id,u.username,best.problem_id,best.accepted,best.score,best.last_submit_at
    FROM best JOIN users u ON u.id=best.user_id
  `).all(contest.id, start, end, start, end, contest.id);
  if (contest.type !== "OIL") {
    const users = new Map();
    for (const row of baseRows) {
      if (!users.has(row.user_id)) users.set(row.user_id, { user_id: row.user_id, username: row.username, members: [row.username], submissions: 0, solved: 0, score: 0, last_submit_at: null, team_no: null, problem_results: {} });
      const user = users.get(row.user_id);
      user.problem_results[row.problem_id] = { accepted: Boolean(row.accepted), score: Number(row.score || 0) };
      user.submissions += 1;
      if (!user.last_submit_at || String(row.last_submit_at) > String(user.last_submit_at)) user.last_submit_at = row.last_submit_at;
    }
    const overrides = db.prepare("SELECT subject_id,problem_id,score FROM contest_score_overrides WHERE contest_id=? AND subject_type='user'").all(contest.id);
    for (const override of overrides) { const user=users.get(override.subject_id); if (user) user.problem_results[override.problem_id] = { accepted: Number(override.score)>0, score:Number(override.score), overridden:true }; }
    for (const user of users.values()) { const results=Object.values(user.problem_results); user.solved=results.filter((item) => item.accepted).length; user.score=results.reduce((sum,item) => sum+Number(item.score||0),0); }
    const rows = [...users.values()].sort((a, b) => b.solved - a.solved || b.score - a.score || String(a.last_submit_at || "~").localeCompare(String(b.last_submit_at || "~")) || a.user_id - b.user_id);
    return res.json({ problems, rows: rows.map((row, index) => ({ ...row, rank: index + 1 })) });
  }

  const participants = db.prepare("SELECT cp.user_id,cp.team_no,cp.seat_no,u.username FROM contest_participants cp JOIN users u ON u.id=cp.user_id WHERE cp.contest_id=? ORDER BY cp.team_no,cp.seat_no").all(contest.id);
  let problemKinds = {}; try { problemKinds = JSON.parse(contest.problem_kinds || "{}"); } catch {}
  const personalCount = Number(contest.personal_problem_count) || Number(contest.team_size) || 5;
  const positions = new Map(db.prepare("SELECT problem_id,position FROM contest_problems WHERE contest_id=?").all(contest.id).map((item) => [item.problem_id, Number(item.position)]));
  const teams = new Map();
  for (const participant of participants) {
    if (!teams.has(participant.team_no)) teams.set(participant.team_no, { team_no: participant.team_no, members: [], solved: 0, score: 0, submissions: 0, last_submit_at: null, problem_results: {} });
    teams.get(participant.team_no).members.push(participant.username);
  }
  const teamProblems = new Map();
  for (const row of baseRows) {
    const participant = participants.find((item) => item.user_id === row.user_id);
    if (!participant) continue;
    const kind = problemKinds[row.problem_id] || (Number(positions.get(row.problem_id)) < personalCount ? "personal" : "team");
    const key = `${participant.team_no}:${row.problem_id}`;
    const previous = teamProblems.get(key);
    if (!previous || Number(row.score) > Number(previous.score) || (Number(row.score) === Number(previous.score) && String(row.last_submit_at) < String(previous.last_submit_at))) teamProblems.set(key, { ...row, team_no: participant.team_no });
  }
  for (const row of teamProblems.values()) {
    const team = teams.get(row.team_no);
    const result=team.problem_results[row.problem_id] || { accepted:false,score:0 };
    result.accepted ||= Boolean(row.accepted); result.score += Number(row.score || 0); team.problem_results[row.problem_id]=result;
    team.submissions += 1;
    if (!team.last_submit_at || String(row.last_submit_at) > String(team.last_submit_at)) team.last_submit_at = row.last_submit_at;
  }
  const overrides = db.prepare("SELECT subject_id,problem_id,score FROM contest_score_overrides WHERE contest_id=? AND subject_type='team'").all(contest.id);
  for (const override of overrides) { const team=teams.get(override.subject_id); if (team) team.problem_results[override.problem_id] = { accepted:Number(override.score)>0,score:Number(override.score),overridden:true }; }
  for (const team of teams.values()) { const results=Object.values(team.problem_results); team.solved=results.filter((item) => item.accepted).length; team.score=results.reduce((sum,item) => sum+Number(item.score||0),0); }
  const rows = [...teams.values()].sort((a, b) => b.solved - a.solved || b.score - a.score || String(a.last_submit_at || "~").localeCompare(String(b.last_submit_at || "~")) || a.team_no - b.team_no);
  res.json({ problems, rows: rows.map((row, index) => ({ ...row, rank: index + 1 })) });
});
app.put("/api/admin/contests/:id/ranking-score", auth, domainPerms.domainPermission("modify_contest"), (req,res) => {
  db.exec("CREATE TABLE IF NOT EXISTS contest_score_overrides(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,subject_type TEXT NOT NULL,subject_id INTEGER NOT NULL,problem_id TEXT NOT NULL REFERENCES problems(id),score INTEGER NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(contest_id,subject_type,subject_id,problem_id))");
  const contest=db.prepare("SELECT id,type FROM contests WHERE id=?").get(req.params.id);
  if (!contest) return res.status(404).json({error:"比赛不存在"});
  const subjectType=contest.type === "OIL" ? "team" : "user", subjectId=Number(req.body.subject_id), problemId=String(req.body.problem_id||""), score=Number(req.body.score);
  if (!Number.isInteger(subjectId) || subjectId<=0 || !Number.isInteger(score) || score<0 || score>100000) return res.status(400).json({error:"分数必须是 0 到 100000 的整数"});
  if (!db.prepare("SELECT 1 FROM contest_problems WHERE contest_id=? AND problem_id=?").get(contest.id,problemId)) return res.status(400).json({error:"该题不属于本场比赛"});
  db.prepare("INSERT INTO contest_score_overrides(contest_id,subject_type,subject_id,problem_id,score,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(contest_id,subject_type,subject_id,problem_id) DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").run(contest.id,subjectType,subjectId,problemId,score,req.user.id);
  res.json({ok:true});
});
app.post("/api/submissions", auth, async (req, res) => {
  let { problem_id, language, source } = req.body; problem_id=String(problem_id||"").replace(/^\*/,"");
  const contestId=Number(req.body.contest_id||0), contestAntiCheatOff=Boolean(contestId&&db.prepare("SELECT c.anti_cheat_disabled FROM contests c JOIN contest_problems cp ON cp.contest_id=c.id WHERE c.id=? AND cp.problem_id=?").get(contestId,problem_id)?.anti_cheat_disabled);
  if (contestId && !["admin","root"].includes(req.user.role)) {
    const contest=db.prepare("SELECT type,problem_kinds,personal_problem_count,team_size FROM contests WHERE id=?").get(contestId);
    if (!contest || !db.prepare("SELECT 1 FROM contest_problems WHERE contest_id=? AND problem_id=?").get(contestId,problem_id)) return res.status(400).json({error:"该题不属于本场比赛"});
    if (contest.type === "OIL") {
      const participant=db.prepare("SELECT locked FROM contest_participants WHERE contest_id=? AND user_id=?").get(contestId,req.user.id);
      if (!participant) return res.status(403).json({error:"你尚未加入本场比赛"});
      let kinds={}; try{kinds=JSON.parse(contest.problem_kinds||"{}");}catch{}
      const position=db.prepare("SELECT position FROM contest_problems WHERE contest_id=? AND problem_id=?").get(contestId,problem_id)?.position;
      const personalCount=Number(contest.personal_problem_count)||Number(contest.team_size)||5;
      const kind=kinds[problem_id]||(Number(position)<personalCount?"personal":"team");
      if (participant.locked && kind === "personal") return res.status(403).json({error:"锁题后不能提交个人题"});
    }
  }
  const problem = db.prepare("SELECT * FROM problems WHERE id=?").get(problem_id);
  if (!problem)
    return res.status(404).json({ error: "题目不存在" });
  if (!domainPerms.permissionsFor(req.user, problem.domain_id).perms.submit_problem) return res.status(403).json({ error: "当前域没有递交题目的权限", permission: "submit_problem" });
  if (problem.question_type && problem.question_type !== "programming") {
    if (problem.question_type === "objective") {
      const items = JSON.parse(problem.objective_items || "[]");
      const answer = Array.isArray(req.body.answer) ? req.body.answer : [];
      const accepted = items.length === answer.length && items.every((item, i) => {
        const expected = [...item.answer].map(String).sort();
        const actual = Array.isArray(answer[i]) ? answer[i].map(String).sort() : [];
        return expected.length === actual.length && expected.every((x, j) => x === actual[j]);
      });
      const r = db.prepare("INSERT INTO submissions(user_id,problem_id,language,source,status,score,detail,time_ms,memory_kb,contest_id) VALUES(?,?,? ,?,?,?, ?,0,0,?)").run(req.user.id,problem_id,"objective",JSON.stringify(answer),accepted?"Accepted":"Wrong Answer",accepted?100:0,JSON.stringify([{status:accepted?"Accepted":"Wrong Answer"}]),contestId || null);
      db.prepare("UPDATE problems SET submissions=submissions+1,accepted=accepted+? WHERE id=?").run(accepted?1:0,problem_id);
      return res.status(201).json({id:Number(r.lastInsertRowid),status:accepted?"Accepted":"Wrong Answer",score:accepted?100:0});
    }
    const expected=JSON.parse(problem.objective_answer||"[]").map(String).sort(), answer=(Array.isArray(req.body.answer)?req.body.answer:[]).map(String).sort();
    const accepted=expected.length===answer.length&&expected.every((x,i)=>x===answer[i]);
    const r=db.prepare("INSERT INTO submissions(user_id,problem_id,language,source,status,score,detail,time_ms,memory_kb,contest_id) VALUES(?,?,? ,?,?,?, ?,0,0,?)").run(req.user.id,problem_id,"objective",JSON.stringify(answer),accepted?"Accepted":"Wrong Answer",accepted?100:0,JSON.stringify([{status:accepted?"Accepted":"Wrong Answer"}]),contestId || null);
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
  const check = await integrity.evaluate(req, problem, language, source);
  if (!check.proceed) return res.status(403).json({ error: check.error, code: check.code, risk: check.score });
  const r = db
    .prepare(
      "INSERT INTO submissions(user_id,problem_id,language,source,contest_id) VALUES(?,?,?,?,?)",
    )
    .run(req.user.id, problem_id, language, source, contestId || null);
  const id = Number(r.lastInsertRowid);
  // Scan for dangerous code patterns and auto-report
  setImmediate(() => {
    try {
      const scan = scanCode(source, language);
      if (scan.dangerous) {
        recordDangerousCode(id, req.user.id, problem_id, language, source, scan.matches);
      }
    } catch {}
  });
  // Risk below the blocking threshold is recorded and zeroed without touching the queue.
  if (check.failure) {
    db.prepare("UPDATE submissions SET status='AntiCheat',score=0,detail=? WHERE id=?").run(JSON.stringify(check.failure.detail), id);
    return res.status(201).json({ id, status: "AntiCheat", score: 0, integrity: check.failure.detail[0].integrity });
  }
  setImmediate(processQueue);
  res.status(202).json({ id, status: "Pending" });
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
const momentRoot = resolve(uploadRoot, "moments");
mkdirSync(momentRoot, { recursive: true });
const momentUpload = multer({
  storage: multer.diskStorage({ destination: momentRoot, filename: (_, file, done) => done(null, `${randomUUID()}${safeExtension(file.originalname)}`) }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, done) => done(file.mimetype.startsWith("image/") ? null : new Error("只支持图片格式"), file.mimetype.startsWith("image/")),
});
const friendPair = (a, b) => db.prepare(
  "SELECT * FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)",
).get(a, b, b, a);
const areFriends = (a, b) => Boolean(db.prepare(
  "SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))",
).get(a, b, b, a));
const friendIds = (userId) => db.prepare(
  `SELECT CASE WHEN requester_id=? THEN addressee_id ELSE requester_id END uid
   FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)`,
).all(userId, userId, userId).map((row) => row.uid);
const momentVisibleTo = (moment, userId) =>
  moment && (moment.user_id === userId || areFriends(moment.user_id, userId));

app.get("/api/friends", auth, (req, res) => {
  const friends = db.prepare(
    `SELECT u.id,u.username,u.avatar,u.bio FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END
     WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?) ORDER BY u.username`,
  ).all(req.user.id, req.user.id, req.user.id);
  const incoming = db.prepare(
    `SELECT f.id,f.requester_id user_id,u.username,u.avatar,f.created_at FROM friendships f
     JOIN users u ON u.id=f.requester_id WHERE f.addressee_id=? AND f.status='pending' ORDER BY f.id DESC`,
  ).all(req.user.id).map((row) => ({ ...row, direction: "in" }));
  const outgoing = db.prepare(
    `SELECT f.id,f.addressee_id user_id,u.username,u.avatar,f.created_at FROM friendships f
     JOIN users u ON u.id=f.addressee_id WHERE f.requester_id=? AND f.status='pending' ORDER BY f.id DESC`,
  ).all(req.user.id).map((row) => ({ ...row, direction: "out" }));
  res.json({ friends, incoming, outgoing });
});
app.post("/api/friends/requests", auth, (req, res) => {
  const target = Number(req.body.userId), recipient = Number.isInteger(target) && target > 0
    ? db.prepare("SELECT id,username FROM users WHERE id=?").get(target) : null;
  if (!recipient) return res.status(404).json({ error: "用户不存在" });
  if (recipient.id === req.user.id) return res.status(400).json({ error: "不能添加自己为好友" });
  const pair = friendPair(req.user.id, recipient.id);
  if (pair?.status === "accepted") return res.status(409).json({ error: "你们已经是好友" });
  if (pair && pair.requester_id === req.user.id) return res.status(409).json({ error: "已发送好友申请，等待对方确认" });
  if (pair) {
    db.prepare("UPDATE friendships SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pair.id);
    return res.json({ id: pair.id, status: "accepted" });
  }
  const result = db.prepare("INSERT INTO friendships(requester_id,addressee_id) VALUES(?,?)").run(req.user.id, recipient.id);
  res.status(201).json({ id: Number(result.lastInsertRowid), status: "pending" });
});
app.put("/api/friends/requests/:id", auth, (req, res) => {
  const request = db.prepare("SELECT * FROM friendships WHERE id=?").get(req.params.id);
  if (!request || request.status !== "pending" || request.addressee_id !== req.user.id)
    return res.status(404).json({ error: "好友申请不存在" });
  if (req.body.status === "rejected") {
    db.prepare("DELETE FROM friendships WHERE id=?").run(request.id);
    return res.json({ ok: true, status: "rejected" });
  }
  if (req.body.status !== "accepted") return res.status(400).json({ error: "无效的操作" });
  db.prepare("UPDATE friendships SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(request.id);
  res.json({ ok: true, status: "accepted" });
});
app.delete("/api/friends/:userId", auth, (req, res) => {
  const target = Number(req.params.userId);
  if (!Number.isInteger(target) || target <= 0) return res.status(400).json({ error: "无效的用户" });
  db.prepare("DELETE FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)")
    .run(req.user.id, target, target, req.user.id);
  res.json({ ok: true });
});
app.get("/api/moments", auth, (req, res) => {
  const ids = [req.user.id, ...friendIds(req.user.id)];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT m.id,m.user_id,m.content,m.images,m.created_at,u.username,u.avatar
     FROM moments m JOIN users u ON u.id=m.user_id WHERE m.user_id IN (${placeholders}) ORDER BY m.id DESC LIMIT 50`,
  ).all(...ids);
  const likeStmt = db.prepare("SELECT l.user_id,u.username FROM moment_likes l JOIN users u ON u.id=l.user_id WHERE l.moment_id=? ORDER BY l.created_at");
  const commentStmt = db.prepare("SELECT c.id,c.user_id,c.content,c.created_at,u.username,u.avatar FROM moment_comments c JOIN users u ON u.id=c.user_id WHERE c.moment_id=? ORDER BY c.id");
  res.json(rows.map((row) => {
    const likes = likeStmt.all(row.id);
    let images = [];
    try { images = JSON.parse(row.images || "[]"); } catch { images = []; }
    return {
      ...row, images, likes,
      comments: commentStmt.all(row.id),
      liked: likes.some((like) => like.user_id === req.user.id),
      mine: row.user_id === req.user.id,
    };
  }));
});
app.post("/api/moments", auth, (req, res) => {
  const content = String(req.body.content || "").trim();
  const images = Array.isArray(req.body.images)
    ? [...new Set(req.body.images.map((x) => String(x)).filter((x) => /^\/api\/public\/moments\/[A-Za-z0-9._-]+$/.test(x)))].slice(0, 9)
    : [];
  if (!content && !images.length) return res.status(400).json({ error: "请填写内容或选择图片" });
  if (content.length > 2000) return res.status(400).json({ error: "动态内容不能超过 2000 个字符" });
  const result = db.prepare("INSERT INTO moments(user_id,content,images) VALUES(?,?,?)").run(req.user.id, content, JSON.stringify(images));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.post("/api/moments/images", auth, momentUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择图片" });
  res.status(201).json({ url: `/api/public/moments/${req.file.filename}` });
});
app.get("/api/public/moments/:name", (req, res) => {
  const name = String(req.params.name);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return res.status(400).end();
  res.sendFile(resolve(momentRoot, name), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
app.get("/api/moments/:id", auth, (req, res) => {
  const moment = db.prepare("SELECT * FROM moments WHERE id=?").get(req.params.id);
  if (!momentVisibleTo(moment, req.user.id)) return res.status(404).json({ error: "动态不存在" });
  res.json(moment);
});
app.delete("/api/moments/comments/:id", auth, (req, res) => {
  const comment = db.prepare("SELECT c.*,m.user_id moment_owner FROM moment_comments c JOIN moments m ON m.id=c.moment_id WHERE c.id=?").get(req.params.id);
  if (!comment) return res.status(404).json({ error: "评论不存在" });
  if (comment.user_id !== req.user.id && comment.moment_owner !== req.user.id && !["admin", "root"].includes(req.user.role))
    return res.status(403).json({ error: "只能删除自己的评论" });
  db.prepare("DELETE FROM moment_comments WHERE id=?").run(comment.id);
  res.status(204).end();
});
app.delete("/api/moments/:id", auth, (req, res) => {
  const moment = db.prepare("SELECT * FROM moments WHERE id=?").get(req.params.id);
  if (!momentVisibleTo(moment, req.user.id)) return res.status(404).json({ error: "动态不存在" });
  if (moment.user_id !== req.user.id && !["admin", "root"].includes(req.user.role)) return res.status(403).json({ error: "只能删除自己的动态" });
  db.prepare("DELETE FROM moments WHERE id=?").run(moment.id);
  res.status(204).end();
});
app.put("/api/moments/:id/like", auth, (req, res) => {
  const moment = db.prepare("SELECT * FROM moments WHERE id=?").get(req.params.id);
  if (!momentVisibleTo(moment, req.user.id)) return res.status(404).json({ error: "动态不存在" });
  const existing = db.prepare("SELECT 1 FROM moment_likes WHERE moment_id=? AND user_id=?").get(moment.id, req.user.id);
  if (existing) db.prepare("DELETE FROM moment_likes WHERE moment_id=? AND user_id=?").run(moment.id, req.user.id);
  else db.prepare("INSERT INTO moment_likes(moment_id,user_id) VALUES(?,?)").run(moment.id, req.user.id);
  const likes = db.prepare("SELECT l.user_id,u.username FROM moment_likes l JOIN users u ON u.id=l.user_id WHERE l.moment_id=? ORDER BY l.created_at").all(moment.id);
  res.json({ liked: !existing, likes });
});
app.post("/api/moments/:id/comments", auth, (req, res) => {
  const moment = db.prepare("SELECT * FROM moments WHERE id=?").get(req.params.id);
  if (!momentVisibleTo(moment, req.user.id)) return res.status(404).json({ error: "动态不存在" });
  const content = String(req.body.content || "").trim();
  if (!content || content.length > 500) return res.status(400).json({ error: "评论内容须为 1-500 个字符" });
  const result = db.prepare("INSERT INTO moment_comments(moment_id,user_id,content) VALUES(?,?,?)").run(moment.id, req.user.id, content);
  const row = db.prepare("SELECT c.id,c.user_id,c.content,c.created_at,u.username,u.avatar FROM moment_comments c JOIN users u ON u.id=c.user_id WHERE c.id=?").get(Number(result.lastInsertRowid));
  res.status(201).json(row);
});
if (process.env.NODE_ENV === "production") {
  // Keep unknown API calls JSON; otherwise the SPA fallback returns index.html.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "API 接口不存在", path: req.path });
  });
  // Pre-compress the SPA bundles once at boot; the 845 KB entry chunk is
  // 258 KB gzipped, which is the difference between usable and unusable
  // on a slow mobile link.
  const compressed = new Map();
  const TYPES = { html: "text/html; charset=utf-8", js: "application/javascript; charset=UTF-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", svg: "image/svg+xml" };
  const distDir = resolve(root, "dist");
  const compress = (path) => {
    const type = extname(path).slice(1);
    if (!TYPES[type]) return;
    const body = readFileSync(path);
    compressed.set(path, {
      type: TYPES[type],
      br: brotliCompressSync(body, { params: { [brotliConstants.BROTLI_PARAM_QUALITY]: 11 } }),
      gzip: gzipSync(body, { level: 9 }),
    });
  };
  compress(resolve(distDir, "index.html"));
  for (const name of readdirSync(resolve(distDir, "assets"))) compress(resolve(distDir, "assets", name));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    const entry = compressed.get(resolve(distDir, `.${req.path}`));
    if (!entry) return next();
    if (req.path !== "/index.html" && req.path !== "/") {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "no-cache");
    }
    const accept = String(req.headers["accept-encoding"] || "");
    const encoding = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : "";
    if (encoding) {
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Content-Type", entry.type);
      res.setHeader("Vary", "Accept-Encoding");
      return res.end(entry[encoding]);
    }
    next();
  });
  app.use(express.static(resolve(root, "dist"), {
    setHeaders(res, path) {
      // Vite fingerprinted bundles never change under the same name.
      if (/[\\/]assets[\\/]/.test(path)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
  app.get("*", (req, res) => {
    const entry = compressed.get(resolve(distDir, "index.html"));
    const accept = String(req.headers["accept-encoding"] || "");
    const encoding = entry && (/\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : "");
    res.setHeader("Cache-Control", "no-cache");
    if (!encoding) return res.sendFile(resolve(distDir, "index.html"));
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Content-Type", entry.type);
    res.setHeader("Vary", "Accept-Encoding");
    res.end(entry[encoding]);
  });
}
app.use((err, req, res, next) => {
  console.error(err);
  if (err?.type === "entity.too.large")
    return res.status(413).json({ error: `请求内容超过 ${(jsonBodyLimit / 1024 / 1024).toFixed(0)} MB 限制，请减少单次测试点数据或在控制面板调整单题大小后重启服务` });
  res.status(err instanceof multer.MulterError || err.message === "只支持图片格式" ? 400 : 500).json({ error: err.message || "Plugin error" });
});
if (process.env.IJ_DISABLE_LOCAL_JUDGE === "1") {
  // UI tests simulate revoked logins by expiring every session.
  app.post("/api/admin/revoke-test-sessions", (_, res) =>
    res.json({ changes: db.prepare("UPDATE sessions SET expires_at=0").run().changes }),
  );
}
const port = Number(process.env.PORT || 4001);
app.listen(port, () => {
  console.log(`Infinte Judge API: http://localhost:${port}`);
  console.log(`Sandbox: ${sandboxInfo.backend} (${sandboxInfo.isolation})`);
  console.log(
    `Plugins: ${loadedPlugins.map((p) => p.name).join(", ") || "none"}`,
  );
  if (process.env.IJ_DISABLE_LOCAL_JUDGE !== "1") processQueue();
});
