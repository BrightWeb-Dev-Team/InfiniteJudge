import { spawn } from "node:child_process";
import { existsSync, openSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [parentPid, root] = process.argv.slice(2);
while (true) {
  try { process.kill(Number(parentPid), 0); await new Promise((done) => setTimeout(done, 250)); }
  catch { break; }
}
const logPath = resolve(root, "runtime/infinitejudge.log");
const output = existsSync(resolve(root, "runtime")) ? openSync(logPath, "a") : "ignore";
const child = spawn(process.execPath, [resolve(root, "server/index.js")], { cwd: root, env: { ...process.env, IJ_UPDATE_RESTARTED: "1" }, detached: true, stdio: ["ignore", output, output] });
if (existsSync(resolve(root, "runtime"))) writeFileSync(resolve(root, "runtime/infinitejudge.pid"), String(child.pid));
child.unref();
