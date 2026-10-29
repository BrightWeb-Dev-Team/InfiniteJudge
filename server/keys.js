import { createHash, randomBytes } from "node:crypto";
import { admin } from "./auth.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const makeKey = () => `IJ-${randomBytes(20).toString("hex").toUpperCase().match(/.{1,5}/g).join("-")}`;
const configId = "public";
const readConfig = (db) => {
  const row = db.prepare("SELECT value FROM key_platform_settings WHERE key=?").get(configId);
  if (!row) return { qrCode: "", instructions: "赞助付款后提交订单信息，管理员确认到账后会签发授权 key。" };
  try { return { ...JSON.parse(row.value) }; } catch { return { qrCode: "", instructions: "" }; }
};
const normalizeSite = (input) => {
  let url;
  try { url = new URL(String(input || "")); } catch { throw new Error("站点地址无效"); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("站点地址必须是 HTTP(S) URL");
  return url.origin;
};

export function mountKeys(app, db) {
  app.get("/api/key-platform/public", (_, res) => res.set("Cache-Control", "no-store").json(readConfig(db)));
  app.post("/api/key-platform/orders", (req, res) => {
    const customer = String(req.body?.customer || "").trim();
    const contact = String(req.body?.contact || "").trim();
    const paymentRef = String(req.body?.paymentRef || "").trim();
    const note = String(req.body?.note || "").trim();
    const amount = Number(req.body?.amount);
    let siteUrl;
    try { siteUrl = normalizeSite(req.body?.siteUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (!customer || customer.length > 80 || !contact || contact.length > 160 || paymentRef.length > 160 || note.length > 500 || !Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000) return res.status(400).json({ error: "请检查客户、联系方式、赞助金额和付款信息" });
    const result = db.prepare("INSERT INTO license_orders(customer,contact,site_url,amount_fen,payment_ref,note) VALUES(?,?,?,?,?,?)").run(customer, contact, siteUrl, Math.round(amount * 100), paymentRef, note);
    res.status(201).json({ id: Number(result.lastInsertRowid), status: "pending", tier: amount >= 100 ? "professional" : "community" });
  });
  app.post("/api/key-platform/activate", (req, res) => {
    const key = String(req.body?.key || "").trim().toUpperCase();
    let siteUrl;
    try { siteUrl = normalizeSite(req.body?.siteUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
    if (!/^IJ-(?:[A-F0-9]{5}-){7}[A-F0-9]{5}$/.test(key)) return res.status(400).json({ error: "授权 key 格式无效" });
    const row = db.prepare("SELECT id,tier,status,site_url FROM license_keys WHERE key_hash=?").get(digest(key));
    if (!row || row.status !== "active") return res.status(403).json({ error: "key 不存在或已撤销" });
    if (row.site_url && row.site_url !== siteUrl) return res.status(409).json({ error: "此 key 已绑定到其他站点" });
    db.prepare("UPDATE license_keys SET site_url=?,bound_at=COALESCE(bound_at,CURRENT_TIMESTAMP) WHERE id=?").run(siteUrl, row.id);
    res.set("Cache-Control", "no-store").json({ tier: row.tier, siteUrl, licenseId: row.id });
  });
  app.get("/api/key-platform/admin", admin, (_, res) => {
    const orders = db.prepare("SELECT * FROM license_orders ORDER BY status='pending' DESC,id DESC LIMIT 1000").all();
    const keys = db.prepare("SELECT id,customer,contact,key_suffix,tier,site_url,status,created_at,expires_at,bound_at FROM license_keys ORDER BY id DESC LIMIT 1000").all();
    const settings = readConfig(db);
    const stats = { pending: db.prepare("SELECT COUNT(*) count FROM license_orders WHERE status='pending'").get().count, active: db.prepare("SELECT COUNT(*) count FROM license_keys WHERE status='active'").get().count, professional: db.prepare("SELECT COUNT(*) count FROM license_keys WHERE status='active' AND tier='professional'").get().count };
    res.json({ orders, keys, settings, stats });
  });
  app.put("/api/key-platform/admin/settings", admin, (req, res) => {
    const value = { qrCode: String(req.body?.qrCode || "").trim(), instructions: String(req.body?.instructions || "").trim() };
    if (value.qrCode.length > 3_000_000 || value.instructions.length > 2000) return res.status(400).json({ error: "二维码或说明超出长度限制" });
    if (value.qrCode && !/^https:\/\//i.test(value.qrCode) && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(value.qrCode)) return res.status(400).json({ error: "请使用 HTTPS 图片链接或 PNG/JPEG/WebP 图片" });
    db.prepare("INSERT INTO key_platform_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(configId, JSON.stringify(value));
    res.json(value);
  });
  app.post("/api/key-platform/admin/orders/:id/issue", admin, (req, res) => {
    const order = db.prepare("SELECT * FROM license_orders WHERE id=? AND status='pending'").get(req.params.id);
    if (!order) return res.status(404).json({ error: "待处理订单不存在" });
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 1_000_000) return res.status(400).json({ error: "核实后的金额无效" });
    const tier = amount >= 100 ? "professional" : "community";
    const key = makeKey();
    let keyId;
    try {
      db.exec("BEGIN IMMEDIATE");
      const current = db.prepare("SELECT id FROM license_orders WHERE id=? AND status='pending'").get(order.id);
      if (!current) {
        db.exec("ROLLBACK");
        return res.status(409).json({ error: "订单已被处理" });
      }
      const result = db.prepare("INSERT INTO license_keys(customer,contact,key_hash,key_suffix,tier,site_url,issued_by) VALUES(?,?,?,?,?,?,?)").run(order.customer, order.contact, digest(key), key.slice(-5), tier, order.site_url, req.user.id);
      db.prepare("UPDATE license_orders SET amount_fen=?,status='issued',reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(Math.round(amount * 100), order.id);
      db.exec("COMMIT");
      keyId = Number(result.lastInsertRowid);
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    res.status(201).json({ id: keyId, key, tier, siteUrl: order.site_url });
  });
  app.put("/api/key-platform/admin/orders/:id/reject", admin, (req, res) => {
    const result = db.prepare("UPDATE license_orders SET status='rejected',reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: "待处理订单不存在" });
    res.json({ ok: true });
  });
  app.post("/api/key-platform/admin/keys", admin, (req, res) => {
    const customer = String(req.body?.customer || "").trim(), contact = String(req.body?.contact || "").trim(), note = String(req.body?.note || "").trim();
    let siteUrl;
    try { siteUrl = req.body?.siteUrl ? normalizeSite(req.body.siteUrl) : ""; } catch (error) { return res.status(400).json({ error: error.message }); }
    const tier = req.body?.tier === "professional" ? "professional" : req.body?.tier === "community" ? "community" : "";
    if (!customer || customer.length > 80 || contact.length > 160 || note.length > 200 || !tier) return res.status(400).json({ error: "客户名称、版本或联系方式无效" });
    const key = makeKey();
    const result = db.prepare("INSERT INTO license_keys(customer,contact,key_hash,key_suffix,tier,site_url,issued_by) VALUES(?,?,?,?,?,?,?)").run(customer, contact, digest(key), key.slice(-5), tier, siteUrl, req.user.id);
    res.status(201).json({ id: Number(result.lastInsertRowid), key, tier, siteUrl });
  });
  app.delete("/api/key-platform/admin/keys/:id", admin, (req, res) => {
    const result = db.prepare("UPDATE license_keys SET status='revoked' WHERE id=? AND status='active'").run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: "有效授权不存在" });
    res.json({ ok: true });
  });
}
