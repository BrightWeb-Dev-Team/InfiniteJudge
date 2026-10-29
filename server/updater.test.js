import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as tar from "tar";
import { installUpdate } from "./updater.js";

function fixture() {
  const temp = mkdtempSync(resolve(tmpdir(), "ij-updater-test-"));
  const release = resolve(temp, "release"), target = resolve(temp, "target");
  mkdirSync(release); mkdirSync(target);
  writeFileSync(resolve(release, "package.json"), JSON.stringify({ name: "ij-update-fixture", version: "9.9.9-test", private: true, scripts: { build: "node -e \"\"" } }));
  writeFileSync(resolve(release, "marker.txt"), "updated");
  return { temp, release, target };
}

test("installs a tar.gz update package", async () => {
  const item = fixture(), archive = resolve(item.temp, "update.tar.gz");
  try {
    await tar.c({ gzip: true, cwd: item.temp, file: archive }, ["release"]);
    const result = await installUpdate({ archive: readFileSync(archive), filename: "update.tar.gz", root: item.target, expectedVersion: "9.9.9-test", origin: "test" });
    assert.equal(result.version, "9.9.9-test");
    assert.equal(readFileSync(resolve(item.target, "marker.txt"), "utf8"), "updated");
  } finally { rmSync(item.temp, { recursive: true, force: true }); }
});

test("installs development dependencies for update builds in production", async () => {
  const item = fixture(), archive = resolve(item.temp, "update.tar.gz");
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    const builder = resolve(item.release, "fixture-builder");
    mkdirSync(builder);
    writeFileSync(resolve(builder, "package.json"), JSON.stringify({ name: "ij-fixture-builder", version: "1.0.0", main: "index.cjs" }));
    writeFileSync(resolve(builder, "index.cjs"), "module.exports = 'built with development dependency';\n");
    writeFileSync(resolve(item.release, "package.json"), JSON.stringify({
      name: "ij-update-fixture", version: "9.9.9-test", private: true,
      scripts: { build: "node build.cjs" },
      devDependencies: { "ij-fixture-builder": "file:./fixture-builder" },
    }));
    writeFileSync(resolve(item.release, "build.cjs"), "require('node:fs').writeFileSync('build-result.txt', require('ij-fixture-builder'));\n");
    await tar.c({ gzip: true, cwd: item.temp, file: archive }, ["release"]);
    process.env.NODE_ENV = "production";
    const result = await installUpdate({ archive: readFileSync(archive), filename: "update.tar.gz", root: item.target, origin: "test" });
    assert.equal(result.version, "9.9.9-test");
    assert.equal(readFileSync(resolve(item.target, "build-result.txt"), "utf8"), "built with development dependency");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    rmSync(item.temp, { recursive: true, force: true });
  }
});

test("installs a ZIP update package", { skip: !existsSync("/usr/bin/zip") }, async () => {
  const item = fixture(), archive = resolve(item.temp, "update.zip");
  try {
    const zipped = spawnSync("/usr/bin/zip", ["-qr", archive, "release"], { cwd: item.temp });
    assert.equal(zipped.status, 0);
    const result = await installUpdate({ archive: readFileSync(archive), filename: "update.zip", root: item.target, expectedVersion: "9.9.9-test", origin: "test" });
    assert.equal(result.version, "9.9.9-test");
    assert.equal(readFileSync(resolve(item.target, "marker.txt"), "utf8"), "updated");
  } finally { rmSync(item.temp, { recursive: true, force: true }); }
});
