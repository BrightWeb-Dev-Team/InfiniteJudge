import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import { db } from "./db.js";

const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60_000;

function context(req, siteName) {
  const configured = String(process.env.IJ_PUBLIC_URL || "").trim();
  const fallback = `${req.protocol}://${req.get("host")}`;
  const origin = new URL(configured || req.get("origin") || fallback).origin;
  return { origin, rpID: new URL(origin).hostname, rpName: siteName || "Infinite Judge" };
}

function issueChallenge(challenge, userId, purpose) {
  for (const [key, value] of challenges) if (value.expiresAt <= Date.now()) challenges.delete(key);
  const ceremony = randomBytes(24).toString("base64url");
  challenges.set(ceremony, { challenge, userId, purpose, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return ceremony;
}

function consumeChallenge(ceremony, purpose) {
  const record = challenges.get(String(ceremony || ""));
  challenges.delete(String(ceremony || ""));
  if (!record || record.purpose !== purpose || record.expiresAt <= Date.now()) throw new Error("通行密钥请求已失效，请重试");
  return record;
}

function credentials(userId) {
  return db.prepare("SELECT * FROM passkeys WHERE user_id=? ORDER BY created_at DESC").all(userId);
}

function authenticator(row) {
  return {
    id: row.id,
    publicKey: Buffer.from(row.public_key, "base64url"),
    counter: Number(row.counter),
    transports: JSON.parse(row.transports || "[]"),
  };
}

export async function registrationOptions(req, siteName) {
  const ctx = context(req, siteName), existing = credentials(req.user.id);
  const options = await generateRegistrationOptions({
    ...ctx,
    userID: new TextEncoder().encode(String(req.user.id)),
    userName: req.user.username,
    attestationType: "none",
    excludeCredentials: existing.map((key) => ({ id: key.id, transports: JSON.parse(key.transports || "[]") })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  return { options, ceremony: issueChallenge(options.challenge, req.user.id, "register"), ctx };
}

export async function finishRegistration(req, siteName) {
  const record = consumeChallenge(req.body.ceremony, "register");
  if (record.userId !== req.user.id) throw new Error("通行密钥请求与当前用户不匹配");
  const ctx = context(req, siteName);
  const result = await verifyRegistrationResponse({ response: req.body.response, expectedChallenge: record.challenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, requireUserVerification: true });
  if (!result.verified || !result.registrationInfo) throw new Error("无法验证此通行密钥");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const name = String(req.body.name || "").trim().slice(0, 40) || "我的通行密钥";
  db.prepare("INSERT INTO passkeys(id,user_id,name,public_key,counter,transports,device_type,backed_up) VALUES(?,?,?,?,?,?,?,?)")
    .run(credential.id, req.user.id, name, Buffer.from(credential.publicKey).toString("base64url"), credential.counter, JSON.stringify(credential.transports || []), credentialDeviceType, credentialBackedUp ? 1 : 0);
  return { id: credential.id, name };
}

export async function authenticationOptions(req, siteName, purpose, userId) {
  const keys = credentials(userId);
  if (!keys.length) throw new Error("该账户尚未设置通行密钥");
  const ctx = context(req, siteName);
  const options = await generateAuthenticationOptions({ rpID: ctx.rpID, allowCredentials: keys.map((key) => ({ id: key.id, transports: JSON.parse(key.transports || "[]") })), userVerification: "required" });
  return { options, ceremony: issueChallenge(options.challenge, userId, purpose) };
}

export async function finishAuthentication(req, siteName, purpose) {
  const record = consumeChallenge(req.body.ceremony, purpose);
  const row = db.prepare("SELECT * FROM passkeys WHERE id=? AND user_id=?").get(String(req.body.response?.id || ""), record.userId);
  if (!row) throw new Error("找不到此通行密钥");
  const ctx = context(req, siteName);
  const result = await verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: record.challenge, expectedOrigin: ctx.origin, expectedRPID: ctx.rpID, credential: authenticator(row), requireUserVerification: true });
  if (!result.verified) throw new Error("通行密钥验证失败");
  db.prepare("UPDATE passkeys SET counter=?,last_used_at=CURRENT_TIMESTAMP WHERE id=?").run(result.authenticationInfo.newCounter, row.id);
  return record.userId;
}
