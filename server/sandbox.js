import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, chownSync, readdirSync, chmodSync } from "node:fs";
const os = platform();

// bubblewrap needs a real path: it must survive PATH being replaced inside the namespace.
const bwrapPath = (() => {
  if (os !== "linux") return null;
  const probe = spawnSync("which", ["bwrap"], { encoding: "utf8" });
  const found = probe.status === 0 ? probe.stdout.trim() : "";
  return found || null;
})();
// System trees a compiler needs. Each is bound read-only and only if it exists, because
// bwrap aborts the launch when a source path is missing.
const COMPILER_ROOTS = [
  "/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/libx32", "/opt",
  process.env.JAVA_HOME, dirname(process.execPath), dirname(dirname(process.execPath)),
].filter((path) => typeof path === "string" && path.startsWith("/") && existsSync(path));
// Inside the sandbox every process runs as this unprivileged identity; it cannot write
// anywhere except the submission directory, which is bound to it.
const SANDBOX_UID = 65534, SANDBOX_GID = 65534;
// Where the submission directory appears inside the sandbox.
const SANDBOX_CWD = "/work";

export const sandboxInfo = {
  platform: os,
  backend:
    os === "darwin" ? "sandbox-exec" : os === "win32" ? "windows-process" : process.env.IJ_SANDBOX_COMMAND ? "custom" : bwrapPath ? "bubblewrap" : "none",
  // Reported to the control panel only; never exposed on a public endpoint.
  isolation: os === "darwin" ? "filesystem+network" : os === "win32" ? "process-tree" : process.env.IJ_SANDBOX_COMMAND || bwrapPath ? "namespace+filesystem+network" : "process",
};

function commandLine(command, args) {
  return [command, ...args]
    .map((v) => `'${String(v).replaceAll("'", "'\\''")}'`)
    .join(" ");
}

function bubblewrapProfile({ cwd, uid }) {
  // An empty root: nothing from the host exists unless bound below. Both stages get the
  // read-only system tree so compilers and interpreter binaries (python3, java) resolve,
  // never /root, the database, or SSH material.
  return [
    "--unshare-all",
    "--new-session",
    "--die-with-parent",
    "--cap-drop", "ALL",
    "--clearenv",
    "--proc", "/proc",
    "--dev", "/dev",
    // The work dir is remounted at a stable path so the sandbox identity never has to
    // traverse the host's sticky /tmp.
    "--tmpfs", "/tmp",
    "--dir", "/run",
    "--dir", "/work",
    // Writable / and /tmp are private tmpfs mounts, so a fake passwd cannot reach the host,
    // and /etc is empty and read-only instead of exposing the host's real one.
    "--tmpfs", "/etc",
    "--remount-ro", "/etc",
    ...COMPILER_ROOTS.flatMap((path) => ["--ro-bind-try", path, path]),
    "--bind", cwd, SANDBOX_CWD,
    "--chdir", SANDBOX_CWD,
    ...(uid ? ["--uid", String(uid), "--gid", String(uid)] : []),
    "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
    "--setenv", "HOME", SANDBOX_CWD,
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "LANG", "C.UTF-8",
    "--setenv", "LC_ALL", "C.UTF-8",
  ];
}

export function runSandbox({
  command,
  args = [],
  cwd,
  input = "",
  timeout = 3000,
  outputLimit = 1024 * 1024,
  sandbox = true,
  writable = true,
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
    } else if (os === "linux" && sandbox) {
      // No bubblewrap means no isolation; refuse rather than run untrusted code as root.
      if (!bwrapPath) {
        resolve({ code: 127, out: "", err: "评测沙箱不可用：未安装 bubblewrap（bwrap）", ms: 0, overflow: false, sandboxed: false });
        return;
      }
      // Compilers must write their output, which they can only do as the directory owner
      // (the work dir is 0700 for the service user), so that stage keeps the service uid
      // but still gets no network and no visibility outside its directory and /usr.
      // Submitted programs run as nobody and cannot write anywhere on the host.
      if (writable) {
        try {
          // 0777 on a throwaway directory is what lets the nobody-owned process create
          // its own files; the sticky bit keeps it from removing the compiled binary.
          chmodSync(cwd, 0o777);
          if (process.getuid?.() === 0) {
            chownSync(cwd, SANDBOX_UID, SANDBOX_GID);
            for (const entry of readdirSync(cwd)) chownSync(join(cwd, entry), SANDBOX_UID, SANDBOX_GID);
          }
        } catch (error) {
          resolve({ code: 127, out: "", err: `评测沙箱不可用：无法设置提交目录权限（${error.message}）`, ms: 0, overflow: false, sandboxed: false });
          return;
        }
      }
      bin = bwrapPath;
      argv = [...bubblewrapProfile({ cwd, uid: writable ? SANDBOX_UID : null }), "--", command, ...args];
    }
    const env = {
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      HOME: cwd,
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp",
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
        sandboxed: sandbox,
      });
    }
    child.on("error", (e) => finish(127, e));
    child.on("close", (code) => finish(code));
    // The program may exit (or exec fail) before reading stdin; EPIPE must not escape.
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// Inside bubblewrap the work directory is mounted at SANDBOX_CWD, so a host path would not
// resolve there.
export const sandboxPath = (hostPath, cwd) =>
  os === "linux" && bwrapPath && !process.env.IJ_SANDBOX_COMMAND && String(hostPath).startsWith(cwd)
    ? SANDBOX_CWD + String(hostPath).slice(cwd.length)
    : hostPath;
export const executable = (cwd, name) =>
  os === "win32" ? join(cwd, name + ".exe") : join(cwd, name);
