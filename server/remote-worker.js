import { evaluateTask } from "./judge.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

function readConfig() {
  const file = process.env.CONFIG_FILE || `${homedir()}/.config/hydro/judge.yaml`;
  if (!existsSync(file)) return {};
  const result = {}, lines = readFileSync(file, "utf8").split(/\r?\n/);
  let host = null;
  for (const line of lines) {
    const m = line.match(/^\s{2,}([^:#][^:]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), value = m[2].trim().replace(/^['\"]|['\"]$/g, "");
    if (line.match(/^\s{2}[^ ]/)) { host = key; result[host] = {}; }
    else if (host) result[host][key] = value;
  }
  return result[process.env.IJ_JUDGE_HOST || Object.keys(result)[0]] || {};
}
const config = readConfig();
const base = String(process.env.IJ_JUDGE_SERVER || config.server_url || "http://127.0.0.1:4001").replace(/\/$/, "");
const node = String(process.env.IJ_JUDGE_NODE || process.env.IJ_JUDGE_HOST || `${process.pid}`).slice(0, 100);
const judgeKey = String(process.env.IJ_JUDGE_KEY || config.judge_key || "").trim();
if (!judgeKey) {
  console.error("[judge] 请在 IJ_JUDGE_KEY 或配置文件中提供评测机密钥（与服务端 system_settings.judge_key 一致）");
  process.exit(1);
}
const headers = { "x-judge-node": node, "x-judge-key": judgeKey, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
while (true) {
  try {
    const response = await fetch(`${base}/api/judge/pull`, { headers });
    if (!response.ok) throw new Error(`pull ${response.status}`);
    const { task, retry_after = 1000 } = await response.json();
    if (!task) { await sleep(Math.max(100, Number(retry_after) || 1000)); continue; }
    const result = await evaluateTask(task, task);
    await fetch(`${base}/api/judge/result`, { method: "POST", headers, body: JSON.stringify({ id: task.id, ...result }) });
  } catch (error) {
    console.error(`[judge:${node}]`, error.message);
    await sleep(3000);
  }
}
