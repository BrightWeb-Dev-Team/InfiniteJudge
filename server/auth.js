import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}
export function createSession(userId) {
  const token = randomBytes(32).toString("hex"),
    expires = Date.now() + 7 * 864e5;
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(token, userId, expires);
  return token;
}
export function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "请先登录" });
  const user = db
    .prepare(
      "SELECT users.id,username,role,avatar,rp,bio FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?",
    )
    .get(token, Date.now());
  if (!user) return res.status(401).json({ error: "登录已过期" });
  req.user = user;
  presence.set(user.id, Date.now());
  next();
}
const presence = new Map();
export function isUserOnline(userId) {
  return Date.now() - (presence.get(Number(userId)) || 0) < 45_000;
}
export function admin(req, res, next) {
  auth(req, res, () =>
    req.user.role === "admin" || req.user.role === "root"
      ? next()
      : res.status(403).json({ error: "需要管理员权限" }),
  );
}
export function rootAdmin(req, res, next) {
  auth(req, res, () => req.user.role === "root" ? next() : res.status(403).json({ error: "需要 Root 权限" }));
}
const elevations = new Map();
const ADMIN_VERIFICATION_TTL_MS = 4 * 60 * 60_000;
export function createElevation(userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ADMIN_VERIFICATION_TTL_MS;
  elevations.set(token, { userId, expiresAt });
  return { token, expiresAt };
}
export function elevatedAdmin(req, res, next) {
  rootAdmin(req, res, () => {
    const token = req.headers["x-admin-verification"];
    const elevation = elevations.get(token);
    if (
      !elevation ||
      elevation.userId !== req.user.id ||
      elevation.expiresAt <= Date.now()
    ) {
      if (token) elevations.delete(token);
      return res
        .status(403)
        .json({ error: "需要管理员二次验证", code: "ADMIN_REVERIFY" });
    }
    next();
  });
}
