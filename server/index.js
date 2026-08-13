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
  verifyPassword,
} from "./auth.js";
import { processQueue } from "./judge.js";
import { sandboxInfo } from "./sandbox.js";
import { PluginRuntime } from "./plugins.js";
import { mountContent } from "./content.js";
import { spawn } from "node:child_process";
import nodemailer from "nodemailer";
import multer from "multer";
import { mkdirSync, rmSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, cpSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { tmpdir } from "node:os";
const app = express(),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localVersion = (() => {
  try { return JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version || "0.0.0"; }
  catch { return "0.0.0"; }
})();
app.use(express.json({ limit: "256kb" }));
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
const setting = (key, fallback = null) => {
  const row = db.prepare("SELECT value FROM system_settings WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : fallback;
};
const installed = () => Boolean(setting("installed", false));
const primaryDomain = () => db.prepare("SELECT id,announcement FROM domains ORDER BY id LIMIT 1").get();
const calculateRp = () => {
  const users = db.prepare("SELECT id,username,avatar,rp fixed_rp FROM users").all();
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
  const { name, serviceUrl, logo = "", username, password, emailVerification = false, smtp = {} } = req.body;
  if (!name?.trim() || !/^[a-zA-Z0-9_]{3,24}$/.test(username || "") || String(password || "").length < 8)
    return res.status(400).json({ error: "请填写品牌名、有效管理员用户名和至少 8 位密码" });
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
  res.json({
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
  }),
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
    res.json({ text: value.hitokoto, from: value.from || "一言" });
  } catch { res.json({ text: "我之所以想变强，是为了活得轻松写意。", from: "Infinite Judge" }); }
});
app.get("/api/plugins", (_, res) =>
  res.json({
    loaded: loadedPlugins,
    ui: Object.fromEntries(
      [...plugins.ui].map(([k, v]) => [k, Object.fromEntries(v)]),
    ),
  }),
);
mountContent(app, db, publicProblem);
app.get("/api/auth/config", (_, res) =>
  res.json({ emailVerification: Boolean(setting("email", {}).enabled) }),
);
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
  const { username = "", password = "", email = "", code = "" } = req.body;
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username))
    return res
      .status(400)
      .json({ error: "用户名须为 3-24 位字母、数字或下划线" });
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
  } catch {
    return res.status(409).json({ error: "用户名已存在" });
  }
});
app.post("/api/auth/login", (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE username=?")
    .get(req.body.username || "");
  if (!user || !verifyPassword(req.body.password || "", user.password_hash))
    return res.status(401).json({ error: "用户名或密码错误" });
  res.json({
    token: createSession(user.id),
    user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar || "", rp: user.rp || 0 },
  });
});
app.get("/api/me", auth, (req, res) => res.json(req.user));
app.put("/api/me/profile", auth, (req, res) => {
  const username = String(req.body.username || "").trim(), avatar = String(req.body.avatar || "").trim(), bio = String(req.body.bio || "").trim();
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "用户名须为 3-24 位字母、数字或下划线" });
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
app.get("/api/files", auth, (req, res) => res.json(db.prepare("SELECT id,original_name,mime_type,size,created_at FROM user_files WHERE user_id=? ORDER BY id DESC").all(req.user.id)));
app.post("/api/files", auth, fileUpload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "请选择文件" });
  const result = db.prepare("INSERT INTO user_files(user_id,stored_name,original_name,mime_type,size) VALUES(?,?,?,?,?)").run(req.user.id, req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype || "application/octet-stream", req.file.size);
  res.status(201).json({ id: Number(result.lastInsertRowid), original_name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size });
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
    (SELECT COALESCE(SUM(CASE p.difficulty WHEN '入门' THEN 100 WHEN '简单' THEN 160 WHEN '中等' THEN 240 WHEN '困难' THEN 360 ELSE 100 END),0) FROM (SELECT DISTINCT problem_id FROM submissions WHERE user_id=u.id AND status='Accepted') a JOIN problems p ON p.id=a.problem_id) rp
    FROM users u WHERE u.id=?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  const calculated = calculateRp().find((item) => item.id === user.id);
  user.rp = calculated?.rp || 0;
  user.fixed_rp = calculated?.fixed_rp || 0;
  user.blog = db.prepare("SELECT id,title,content,created_at FROM blog_posts WHERE user_id=? ORDER BY id DESC").all(req.params.id);
  res.json(user);
});
app.get("/api/messages", auth, (req, res) => res.json(db.prepare("SELECT m.id,m.content,m.read_at,m.created_at,s.id sender_id,s.username sender FROM messages m JOIN users s ON s.id=m.sender_id WHERE recipient_id=? ORDER BY m.id DESC").all(req.user.id)));
app.post("/api/messages", auth, (req, res) => {
  const recipient = db.prepare("SELECT id FROM users WHERE username=?").get(String(req.body.recipient || "").trim()), content = String(req.body.content || "").trim();
  if (!recipient) return res.status(404).json({ error: "收件人不存在" });
  if (!content || content.length > 4000) return res.status(400).json({ error: "消息内容须为 1-4000 个字符" });
  const result = db.prepare("INSERT INTO messages(sender_id,recipient_id,content) VALUES(?,?,?)").run(req.user.id, recipient.id, content);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.put("/api/messages/:id/read", auth, (req, res) => { db.prepare("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE id=? AND recipient_id=?").run(req.params.id, req.user.id); res.json({ ok: true }); });
app.get("/api/blog", (_, res) => res.json(db.prepare("SELECT b.id,b.title,b.content,b.created_at,b.updated_at,u.username,u.avatar FROM blog_posts b JOIN users u ON u.id=b.user_id ORDER BY b.id DESC").all()));
app.post("/api/blog", auth, (req, res) => {
  const title = String(req.body.title || "").trim(), content = String(req.body.content || "").trim();
  if (!title || title.length > 120 || !content) return res.status(400).json({ error: "请填写博客标题和内容" });
  const result = db.prepare("INSERT INTO blog_posts(user_id,title,content) VALUES(?,?,?)").run(req.user.id,title,content);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
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
app.get("/api/admin/verification", elevatedAdmin, (req, res) =>
  res.json({ valid: true }),
);
app.get("/api/admin/users", elevatedAdmin, (_, res) =>
  res.json(
    db
      .prepare("SELECT id,username,role,created_at FROM users ORDER BY id")
      .all(),
  ),
);
app.put("/api/admin/users/:id/role", elevatedAdmin, (req, res) => {
  if (!["user", "admin"].includes(req.body.role))
    return res.status(400).json({ error: "角色无效" });
  const target = db
    .prepare("SELECT role FROM users WHERE id=?")
    .get(req.params.id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (
    target.role === "admin" &&
    req.body.role !== "admin" &&
    db.prepare("SELECT COUNT(*) count FROM users WHERE role='admin'").get()
      .count <= 1
  )
    return res.status(409).json({ error: "不能移除最后一个管理员" });
  db.prepare("UPDATE users SET role=? WHERE id=?").run(
    req.body.role,
    req.params.id,
  );
  res.json({ id: Number(req.params.id), role: req.body.role });
});
app.post("/api/admin/users/import", elevatedAdmin, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 500)
    return res.status(400).json({ error: "请提供 1-500 个用户" });
  const insert = db.prepare(
      "INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')",
    ),
    created = [],
    failed = [];
  for (const row of rows) {
    const username = String(row.username || "").trim(),
      password = String(row.password || "");
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username) || password.length < 8) {
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
app.get("/api/domains", auth, (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT d.*,u.username owner,(SELECT COUNT(*) FROM domain_members WHERE domain_id=d.id) members FROM domains d JOIN users u ON u.id=d.owner_id ORDER BY d.id`,
      )
      .all(),
  ),
);
app.post("/api/domains", elevatedAdmin, (req, res) => {
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
app.put("/api/domains/:id", elevatedAdmin, (req, res) => {
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
  elevatedAdmin,
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
app.put("/api/domains/:domainId/members/:userId", elevatedAdmin, (req, res) => {
  if (!["member", "manager"].includes(req.body.role))
    return res.status(400).json({ error: "角色无效" });
  const r = db
    .prepare(
      "UPDATE domain_members SET role=? WHERE domain_id=? AND user_id=? AND role!='owner'",
    )
    .run(req.body.role, req.params.domainId, req.params.userId);
  res.json({ ok: !!r.changes });
});
app.post("/api/admin/maintenance/:action", elevatedAdmin, (req, res) => {
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
  res.json({ ...value, announcement: main?.announcement || value.announcement || `# 欢迎使用 ${value.name}\n\n一个兼容 HydroOJ 插件、支持本地沙箱评测的在线编程系统。` });
});
app.put("/api/admin/settings/site", elevatedAdmin, (req, res) => {
  const name = String(req.body.name || "").trim(),
    serviceUrl = String(req.body.serviceUrl || "").trim(),
    logo = String(req.body.logo || "").trim(),
    announcement = String(req.body.announcement || "").trim();
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
    announcement,
  };
  db.prepare(
    "UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='site'",
  ).run(JSON.stringify(value));
  const main = primaryDomain();
  if (main) db.prepare("UPDATE domains SET announcement=? WHERE id=?").run(announcement, main.id);
  res.json(value);
});
app.get("/api/admin/settings/advanced", elevatedAdmin, (_, res) => {
  res.json({
    ...setting("advanced", {}),
    email: setting("email", { enabled: false, smtp: {} }),
  });
});
app.put("/api/admin/settings/advanced", elevatedAdmin, (req, res) => {
  const currentEmail = setting("email", { enabled: false, smtp: {} });
  const email = req.body.email || {};
  const smtp = { ...(currentEmail.smtp || {}), ...(email.smtp || {}) };
  if (!smtp.pass) smtp.pass = currentEmail.smtp?.pass || "";
  if (email.enabled && (!smtp.host || !smtp.port || !smtp.from))
    return res.status(400).json({ error: "启用邮件验证前请填写 SMTP 地址、端口和发件人" });
  const advanced = {
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
app.post("/api/admin/system/update", elevatedAdmin, async (req, res) => {
  if (updating) return res.status(409).json({ error: "更新正在进行中" });
  const origin = "https://update.brightweb.top/oj";
  updating = true;
  const logs = [], temp = mkdtempSync(resolve(tmpdir(), "infinitejudge-update-"));
  const run = (cmd, args, cwd = root) => new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out: out.slice(-12000) }));
    p.on("error", (e) => resolve({ code: 127, out: e.message }));
  });
  try {
    const manifestResponse = await fetch(origin, { method: "POST", headers: { Accept: "application/json" } });
    if (manifestResponse.status === 204) return res.json({ ok: true, origin, logs: ["当前已是最新版本"] });
    if (!manifestResponse.ok) throw new Error(`更新服务返回 HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!manifest.version || !manifest.url || !/^[a-f0-9]{64}$/i.test(manifest.sha256 || "")) throw new Error("更新清单缺少 version、url 或有效的 sha256");
    const packageResponse = await fetch(new URL(manifest.url, origin));
    if (!packageResponse.ok) throw new Error(`下载更新包失败：HTTP ${packageResponse.status}`);
    const archive = Buffer.from(await packageResponse.arrayBuffer());
    if (archive.length > 256 * 1024 * 1024) throw new Error("更新包超过 256 MB 限制");
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest.toLowerCase() !== manifest.sha256.toLowerCase()) throw new Error("更新包 SHA-256 校验失败");
    const archivePath = resolve(temp, "update.tar.gz"), stage = resolve(temp, "stage");
    writeFileSync(archivePath, archive); mkdirSync(stage);
    const listing = await run("tar", ["-tzf", archivePath], temp);
    if (listing.code) throw new Error(`无法读取更新包：${listing.out}`);
    const entries = listing.out.split("\n").filter(Boolean);
    if (entries.some((name) => name.startsWith("/") || name.split("/").includes("..") || name.replace(/^\.\//, "").startsWith("data/"))) throw new Error("更新包包含不安全路径或 data 目录");
    const extracted = await run("tar", ["-xzf", archivePath, "-C", stage], temp);
    if (extracted.code) throw new Error(`解压更新包失败：${extracted.out}`);
    const roots = readdirSync(stage).filter((name) => name !== "__MACOSX");
    const source = roots.length === 1 && statSync(resolve(stage, roots[0])).isDirectory() ? resolve(stage, roots[0]) : stage;
    const packagePath = resolve(source, "package.json");
    if (!statSync(packagePath).isFile()) throw new Error("更新包根目录缺少 package.json");
    if (JSON.parse(readFileSync(packagePath, "utf8")).version !== manifest.version) throw new Error("清单版本与更新包版本不一致");
    for (const name of readdirSync(source)) {
      if (["data", "node_modules", ".git", ".env"].includes(name)) continue;
      cpSync(resolve(source, name), resolve(root, name), { recursive: true, force: true });
    }
    logs.push(`已从 ${origin} 下载并校验 InfiniteJudge ${manifest.version}`);
    for (const [cmd, args] of [["npm", ["install", "--no-audit", "--no-fund"]], ["npm", ["run", "build"]]]) {
      const result = await run(cmd, args);
      logs.push(`$ ${cmd} ${args.join(" ")}\n${result.out}`);
      if (result.code) return res.status(500).json({ error: "更新文件已安装，但依赖安装或构建失败", logs });
    }
    res.json({ ok: true, origin, version: manifest.version, logs });
  } catch (e) {
    res.status(502).json({ error: e.message || "更新失败", logs });
  } finally {
    rmSync(temp, { recursive: true, force: true });
    updating = false;
  }
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
  const rows = db.prepare("SELECT * FROM problems ORDER BY id").all();
  res.json(rows.map((r) => publicProblem(r)));
});
app.get("/api/problems/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM problems WHERE id=?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "题目不存在" });
  res.json(publicProblem(row, true));
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
      `SELECT s.id,s.problem_id,p.title problem,u.username user,s.status,s.score,s.language,s.time_ms,s.memory_kb,s.created_at FROM submissions s JOIN users u ON u.id=s.user_id JOIN problems p ON p.id=s.problem_id ORDER BY s.id DESC LIMIT 100`,
    )
    .all();
  res.json(rows);
});
app.get("/api/submissions/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT id,user_id,problem_id,language,status,score,time_ms,memory_kb,detail,created_at FROM submissions WHERE id=?",
    )
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  res.json({ ...row, detail: JSON.parse(row.detail) });
});
app.post("/api/submissions", auth, (req, res) => {
  const { problem_id, language, source } = req.body;
  if (!db.prepare("SELECT 1 FROM problems WHERE id=?").get(problem_id))
    return res.status(404).json({ error: "题目不存在" });
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
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve(root, "dist")));
  app.get("*", (_, res) => res.sendFile(resolve(root, "dist/index.html")));
}
app.use((err, req, res, next) => {
  console.error(err);
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
