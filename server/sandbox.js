import { spawn } from "node:child_process";
import { platform } from "node:os";
import { join } from "node:path";
const os = platform();
export const sandboxInfo = {
  platform: os,
  backend:
    os === "darwin"
      ? "sandbox-exec"
      : os === "win32"
        ? "windows-process"
        : "posix-process",
  isolation:
    os === "darwin"
      ? "filesystem+network"
      : os === "win32"
        ? "process-tree"
        : "process",
};
function commandLine(command, args) {
  return [command, ...args]
    .map((v) => `'${String(v).replaceAll("'", "'\\''")}'`)
    .join(" ");
}
export function runSandbox({
  command,
  args = [],
  cwd,
  input = "",
  timeout = 3000,
  outputLimit = 1024 * 1024,
  sandbox = true,
}) {
  return new Promise((resolve) => {
    let bin = command,
      argv = args;
    if (os === "darwin" && sandbox) {
      const profile = `(version 1)(deny default)(allow process*)(allow file-read*)(allow file-write* (subpath "${cwd.replaceAll('"', '\\"')}"))(deny network*)`;
      bin = "/usr/bin/sandbox-exec";
      argv = ["-p", profile, command, ...args];
    } else if (process.env.IJ_SANDBOX_COMMAND && sandbox) {
      bin = process.env.IJ_SANDBOX_COMMAND;
      argv = [commandLine(command, args)];
    }
    const env = {
      PATH: process.env.PATH || "",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      HOME: cwd,
      TMPDIR: cwd,
      TEMP: cwd,
      TMP: cwd,
    };
    const start = Date.now(),
      child = spawn(bin, argv, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: os !== "win32",
      });
    let out = "",
      err = "",
      settled = false,
      overflow = false;
    const collect = (key, d) => {
      const text = d.toString();
      if (key === "out") out += text;
      else err += text;
      if (out.length + err.length > outputLimit) {
        overflow = true;
        kill();
      }
    };
    child.stdout.on("data", (d) => collect("out", d));
    child.stderr.on("data", (d) => collect("err", d));
    function kill() {
      if (child.killed) return;
      if (os === "win32")
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
        });
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }
    const timer = setTimeout(kill, timeout);
    function finish(code, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: overflow ? 125 : (code ?? 127),
        out: out.slice(0, outputLimit),
        err: (error?.message || err).slice(0, outputLimit),
        ms: Date.now() - start,
        overflow,
      });
    }
    child.on("error", (e) => finish(127, e));
    child.on("close", (code) => finish(code));
    child.stdin.end(input);
  });
}
export const executable = (cwd, name) =>
  os === "win32" ? join(cwd, name + ".exe") : join(cwd, name);
