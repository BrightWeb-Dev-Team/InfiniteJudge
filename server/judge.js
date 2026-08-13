import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db.js";
import { runSandbox, executable } from "./sandbox.js";
let working = false;
const configs = {
  cpp: {
    file: "Main.cpp",
    compile: ["g++", ["Main.cpp", "-O2", "-std=c++20", "-o", "Main"]],
    run: (d) => [executable(d, "Main"), []],
  },
  python: {
    file: "main.py",
    compile: null,
    run: () => [
      process.platform === "win32" ? "python" : "python3",
      ["main.py"],
    ],
  },
  java: {
    file: "Main.java",
    compile: ["javac", ["Main.java"]],
    run: () => ["java", ["Main"]],
  },
};
const normalize = (s) =>
  s
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "");
export async function runSubmission(sub) {
  const p = db.prepare("SELECT * FROM problems WHERE id=?").get(sub.problem_id),
    cfg = configs[sub.language];
  if (!cfg)
    return finish(sub.id, "System Error", 0, null, 0, [
      { error: "不支持的语言" },
    ]);
  const dir = await mkdtemp(join(tmpdir(), "ij-"));
  await writeFile(join(dir, cfg.file), sub.source);
  try {
    if (cfg.compile) {
      const c = await runSandbox({
        command: cfg.compile[0],
        args: cfg.compile[1],
        cwd: dir,
        timeout: 30000,
        sandbox: false,
      });
      if (c.code)
        return finish(sub.id, "Compile Error", 0, c.ms, 0, [
          { error: (c.err || c.out).slice(0, 3000) },
        ]);
    }
    const tests = JSON.parse(p.testcases),
      detail = [];
    let passed = 0,
      maxMs = 0;
    for (let i = 0; i < tests.length; i++) {
      const [cmd, args] = cfg.run(dir),
        r = await runSandbox({
          command: cmd,
          args,
          cwd: dir,
          input: tests[i][0] + "\n",
          timeout: p.time_limit + 500,
        });
      maxMs = Math.max(maxMs, r.ms);
      const status =
        r.code === 125
          ? "Output Limit"
          : r.ms >= p.time_limit + 450
            ? "Time Limit"
            : r.code
              ? "Runtime Error"
              : normalize(r.out) === normalize(tests[i][1])
                ? "Accepted"
                : "Wrong Answer";
      detail.push({
        test: i + 1,
        status,
        time_ms: r.ms,
        output: status === "Wrong Answer" ? r.out.slice(0, 500) : undefined,
        error: r.err.slice(0, 500) || undefined,
      });
      if (status !== "Accepted")
        return finish(
          sub.id,
          status,
          Math.round((passed / tests.length) * 100),
          maxMs,
          0,
          detail,
        );
      passed++;
    }
    finish(sub.id, "Accepted", 100, maxMs, 0, detail);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function finish(id, status, score, time, memory, detail) {
  db.prepare(
    "UPDATE submissions SET status=?,score=?,time_ms=?,memory_kb=?,detail=? WHERE id=?",
  ).run(status, score, time, memory, JSON.stringify(detail), id);
  db.prepare(
    "UPDATE problems SET submissions=submissions+1,accepted=accepted+? WHERE id=(SELECT problem_id FROM submissions WHERE id=?)",
  ).run(status === "Accepted" ? 1 : 0, id);
}
export async function processQueue() {
  if (working) return;
  working = true;
  try {
    let sub;
    while (
      (sub = db
        .prepare(
          "SELECT * FROM submissions WHERE status='Pending' ORDER BY id LIMIT 1",
        )
        .get())
    ) {
      db.prepare("UPDATE submissions SET status='Judging' WHERE id=?").run(
        sub.id,
      );
      await runSubmission(sub);
    }
  } finally {
    working = false;
  }
}
