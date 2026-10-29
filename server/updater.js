import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import * as tar from "tar";
import unzipper from "unzipper";

const MAX_ARCHIVE_SIZE = 256 * 1024 * 1024;
const MAX_EXTRACTED_SIZE = 1024 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const PROTECTED = new Set(["data", "node_modules", ".git", ".env"]);

const run = (cmd, args, cwd) => new Promise((done) => {
  const child = spawn(cmd, args, { cwd, env: process.env });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));
  child.on("close", (code) => done({ code, out: output.slice(-12_000) }));
  child.on("error", (error) => done({ code: 127, out: error.message }));
});

function archiveType(buffer, filename = "") {
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "zip";
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return "tar.gz";
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  throw new Error("仅支持 .zip、.tar.gz 或 .tgz 更新包");
}

function safePath(name) {
  const normalized = String(name || "").replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || parts.includes("..")) throw new Error(`更新包包含不安全路径：${name}`);
  return parts;
}

function validateEntries(entries) {
  if (!entries.length || entries.length > MAX_ENTRIES) throw new Error("更新包为空或文件数量超过限制");
  if (entries.reduce((sum, entry) => sum + Number(entry.size || 0), 0) > MAX_EXTRACTED_SIZE) throw new Error("更新包解压后超过 1 GB 限制");
  const paths = entries.map((entry) => safePath(entry.path));
  const commonRoot = paths.every((parts) => parts.length > 1 && parts[0] === paths[0][0]) ? paths[0][0] : null;
  for (const parts of paths) {
    const relative = commonRoot ? parts.slice(1) : parts;
    if (relative.length && PROTECTED.has(relative[0])) throw new Error(`更新包不能包含 ${relative[0]} 目录或文件`);
  }
}

async function extractArchive(buffer, filename, temp, stage) {
  const type = archiveType(buffer, filename), archivePath = resolve(temp, type === "zip" ? "update.zip" : "update.tar.gz");
  writeFileSync(archivePath, buffer);
  mkdirSync(stage);
  if (type === "zip") {
    const directory = await unzipper.Open.file(archivePath);
    const entries = directory.files.map((entry) => ({ path: entry.path, size: entry.uncompressedSize }));
    if (directory.files.some((entry) => !["File", "Directory"].includes(entry.type))) throw new Error("ZIP 更新包不能包含符号链接或特殊文件");
    validateEntries(entries);
    await directory.extract({ path: stage });
  } else {
    const entries = [];
    await tar.t({ file: archivePath, onentry: (entry) => {
      if (!["File", "Directory"].includes(entry.type)) throw new Error("tar.gz 更新包不能包含链接或特殊文件");
      entries.push({ path: entry.path, size: entry.size });
    } });
    validateEntries(entries);
    await tar.x({ file: archivePath, cwd: stage, preservePaths: false });
  }
  const roots = readdirSync(stage).filter((name) => name !== "__MACOSX");
  return roots.length === 1 && statSync(resolve(stage, roots[0])).isDirectory() ? resolve(stage, roots[0]) : stage;
}

export async function installUpdate({ archive, filename, root, expectedVersion, origin }) {
  if (!Buffer.isBuffer(archive) || !archive.length) throw new Error("更新包为空");
  if (archive.length > MAX_ARCHIVE_SIZE) throw new Error("更新包超过 256 MB 限制");
  const logs = [], temp = mkdtempSync(resolve(tmpdir(), "infinitejudge-update-"));
  try {
    const digest = createHash("sha256").update(archive).digest("hex");
    const source = await extractArchive(archive, filename, temp, resolve(temp, "stage"));
    const packagePath = resolve(source, "package.json");
    let manifest;
    try { manifest = JSON.parse(readFileSync(packagePath, "utf8")); } catch { throw new Error("更新包根目录缺少有效的 package.json"); }
    if (!manifest.version) throw new Error("更新包的 package.json 缺少版本号");
    if (expectedVersion && manifest.version !== expectedVersion) throw new Error("更新清单与更新包版本不一致");
    for (const name of readdirSync(source)) {
      if (PROTECTED.has(name)) continue;
      cpSync(resolve(source, name), resolve(root, name), { recursive: true, force: true });
    }
    logs.push(`${origin}更新包 ${manifest.version} 已校验并安装`, `SHA-256: ${digest}`);
    for (const [command, args] of [["npm", ["install", "--include=dev", "--no-audit", "--no-fund"]], ["npm", ["run", "build"]]]) {
      const result = await run(command, args, root);
      logs.push(`$ ${command} ${args.join(" ")}\n${result.out}`);
      if (result.code) throw Object.assign(new Error("更新文件已安装，但依赖安装或构建失败"), { logs });
    }
    return { version: manifest.version, logs };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
