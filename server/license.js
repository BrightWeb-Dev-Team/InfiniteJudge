const cache = new Map();
const defaultServer = "https://key.brightweb.top";

export function licenseConfig(db) {
  const row = db.prepare("SELECT value FROM system_settings WHERE key='license'").get();
  let stored = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch {}
  return {
    serverUrl: String(stored.serverUrl || process.env.IJ_LICENSE_SERVER_URL || defaultServer).replace(/\/+$/, ""),
    key: String(stored.key || process.env.IJ_LICENSE_KEY || "").trim(),
  };
}

const privateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "localhost.localdomain", "ip6-localhost", "0.0.0.0", "::1", "::"].includes(host)) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true;
  return host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd");
};
export function saveLicenseConfig(db, value) {
  const serverUrl = String(value.serverUrl || defaultServer).trim().replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(serverUrl); } catch { throw new Error("授权服务地址无效"); }
  // The license server is fetched with the stored key, so a private host would turn this
  // setting into an internal-network probe (SSRF).
  if (parsed.protocol !== "https:") throw new Error("授权服务必须使用 HTTPS");
  if (privateHostname(parsed.hostname)) throw new Error("授权服务地址不能指向内网或本机地址");
  if (parsed.username || parsed.password) throw new Error("授权服务地址不能包含认证信息");
  const key = String(value.key || "").trim().toUpperCase();
  if (key && !/^IJ-(?:[A-F0-9]{5}-){7}[A-F0-9]{5}$/.test(key)) throw new Error("授权 key 格式无效");
  db.prepare("INSERT INTO system_settings(key,value) VALUES('license',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(JSON.stringify({ serverUrl, key }));
  cache.clear();
  return { serverUrl, key };
}

export async function siteLicense(db, siteUrl) {
  const config = licenseConfig(db);
  const key = config.key;
  const server = config.serverUrl;
  if (!key) return "community";
  const cacheKey = `${server}|${key}`;
  const current = cache.get(cacheKey);
  if (current && Date.now() - current.checkedAt < 15 * 60_000) return current.tier;
  try {
    const response = await fetch(`${server}/api/key-platform/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, siteUrl }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 409 || response.status === 400) {
        cache.set(cacheKey, { tier: "community", checkedAt: Date.now() });
        return "community";
      }
      throw new Error(`license server ${response.status}`);
    }
    const result = await response.json();
    const tier = result.tier === "professional" ? "professional" : "community";
    cache.set(cacheKey, { tier, checkedAt: Date.now() });
    return tier;
  } catch {
    if (current && Date.now() - current.checkedAt < 30 * 86400_000) return current.tier;
    return "community";
  }
}
