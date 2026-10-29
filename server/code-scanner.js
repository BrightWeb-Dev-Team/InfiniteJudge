import { db } from "./db.js";

const DANGEROUS_PATTERNS = {
  cpp: [
    { pattern: /\bsystem\s*\(/g, label: "system() 调用", severity: "high" },
    { pattern: /\bpopen\s*\(/g, label: "popen() 调用", severity: "high" },
    { pattern: /\bexec[lv]p?e?\s*\(/g, label: "exec 系列调用", severity: "high" },
    { pattern: /\bfork\s*\(/g, label: "fork() 调用", severity: "high" },
    { pattern: /\bsocket\s*\(/g, label: "socket() 调用", severity: "medium" },
    { pattern: /\bconnect\s*\(/g, label: "connect() 调用", severity: "medium" },
    { pattern: /\baccept\s*\(/g, label: "accept() 调用", severity: "medium" },
    { pattern: /\bbind\s*\(/g, label: "bind() 调用", severity: "medium" },
    { pattern: /\blisten\s*\(/g, label: "listen() 调用", severity: "medium" },
    { pattern: /\/etc\/passwd/g, label: "访问 /etc/passwd", severity: "high" },
    { pattern: /\/proc\/self/g, label: "访问 /proc/self", severity: "high" },
    { pattern: /\/dev\/(null|zero|random|urandom)/g, label: "访问 /dev 设备", severity: "medium" },
    { pattern: /\bremove\s*\(\s*["']/g, label: "文件删除操作", severity: "low" },
    { pattern: /\brename\s*\(\s*["']/g, label: "文件重命名操作", severity: "low" },
    { pattern: /\bchmod\s*\(/g, label: "chmod() 调用", severity: "medium" },
    { pattern: /\bchown\s*\(/g, label: "chown() 调用", severity: "medium" },
    { pattern: /\bmknod\s*\(/g, label: "mknod() 调用", severity: "high" },
    { pattern: /\bmount\s*\(/g, label: "mount() 调用", severity: "high" },
    { pattern: /\bumount\s*\(/g, label: "umount() 调用", severity: "high" },
    { pattern: /\bptrace\s*\(/g, label: "ptrace() 调用", severity: "high" },
    { pattern: /\bdlopen\s*\(/g, label: "dlopen() 动态加载", severity: "medium" },
    { pattern: /\bdlsym\s*\(/g, label: "dlsym() 符号查找", severity: "medium" },
    { pattern: /\basm\s*\(/g, label: "内联汇编", severity: "medium" },
    { pattern: /__asm__\s*\(/g, label: "内联汇编", severity: "medium" },
  ],
  python: [
    { pattern: /\bos\.system\s*\(/g, label: "os.system() 调用", severity: "high" },
    { pattern: /\bos\.popen\s*\(/g, label: "os.popen() 调用", severity: "high" },
    { pattern: /\bos\.exec[lv]p?e?\s*\(/g, label: "os.exec 系列调用", severity: "high" },
    { pattern: /\bos\.fork\s*\(/g, label: "os.fork() 调用", severity: "high" },
    { pattern: /\bos\.kill\s*\(/g, label: "os.kill() 调用", severity: "high" },
    { pattern: /\bos\.remove\s*\(/g, label: "os.remove() 文件删除", severity: "medium" },
    { pattern: /\bos\.chmod\s*\(/g, label: "os.chmod() 调用", severity: "medium" },
    { pattern: /\bos\.chown\s*\(/g, label: "os.chown() 调用", severity: "medium" },
    { pattern: /\bos\.mknod\s*\(/g, label: "os.mknod() 调用", severity: "high" },
    { pattern: /\bos\.mount\s*\(/g, label: "os.mount() 调用", severity: "high" },
    { pattern: /\bsubprocess\.(run|call|Popen|check_output|check_call)\s*\(/g, label: "subprocess 调用", severity: "high" },
    { pattern: /\bcommands\.(getoutput|getstatusoutput)\s*\(/g, label: "commands 模块调用", severity: "high" },
    { pattern: /\beval\s*\(/g, label: "eval() 动态执行", severity: "medium" },
    { pattern: /\bexec\s*\(/g, label: "exec() 动态执行", severity: "medium" },
    { pattern: /\b__import__\s*\(/g, label: "__import__() 动态导入", severity: "medium" },
    { pattern: /\bimport\s+ctypes\b/g, label: "ctypes 模块导入", severity: "medium" },
    { pattern: /\bimport\s+socket\b/g, label: "socket 模块导入", severity: "medium" },
    { pattern: /\bsocket\.socket\s*\(/g, label: "socket 创建", severity: "medium" },
    { pattern: /\/etc\/passwd/g, label: "访问 /etc/passwd", severity: "high" },
    { pattern: /\/proc\/self/g, label: "访问 /proc/self", severity: "high" },
    { pattern: /\bopen\s*\(\s*["']\/(etc|proc|dev|sys)/g, label: "打开系统文件", severity: "high" },
  ],
  java: [
    { pattern: /\bRuntime\.getRuntime\(\)\.exec\s*\(/g, label: "Runtime.exec() 调用", severity: "high" },
    { pattern: /\bnew\s+ProcessBuilder\s*\(/g, label: "ProcessBuilder 调用", severity: "high" },
    { pattern: /\bProcessBuilder\s*\(\s*\[/g, label: "ProcessBuilder 调用", severity: "high" },
    { pattern: /\bSystem\.exit\s*\(/g, label: "System.exit() 调用", severity: "medium" },
    { pattern: /\bSystem\.load\s*\(/g, label: "System.load() 动态加载", severity: "high" },
    { pattern: /\bSystem\.loadLibrary\s*\(/g, label: "System.loadLibrary() 调用", severity: "high" },
    { pattern: /\bnew\s+File\s*\(\s*["']\/(etc|proc|dev|sys)/g, label: "访问系统文件", severity: "high" },
    { pattern: /\bnew\s+Socket\s*\(/g, label: "Socket 创建", severity: "medium" },
    { pattern: /\bnew\s+ServerSocket\s*\(/g, label: "ServerSocket 创建", severity: "medium" },
    { pattern: /\bServerSocket\s*\(/g, label: "ServerSocket 调用", severity: "medium" },
    { pattern: /\bnew\s+URL\s*\(/g, label: "URL 创建", severity: "low" },
    { pattern: /\bopenConnection\s*\(/g, label: "网络连接", severity: "medium" },
    { pattern: /\bHttpURLConnection\b/g, label: "HTTP 连接", severity: "medium" },
    { pattern: /\bnew\s+Thread\s*\(/g, label: "创建线程", severity: "low" },
    { pattern: /\breflect\b/g, label: "反射操作", severity: "low" },
    { pattern: /\bClass\.forName\s*\(/g, label: "动态类加载", severity: "medium" },
    { pattern: /\bnew\s+FileInputStream\s*\(/g, label: "文件输入流", severity: "low" },
    { pattern: /\bnew\s+FileOutputStream\s*\(/g, label: "文件输出流", severity: "low" },
    { pattern: /\bnew\s+RandomAccessFile\s*\(/g, label: "随机访问文件", severity: "medium" },
  ],
};

export function scanCode(source, language) {
  const patterns = DANGEROUS_PATTERNS[language];
  if (!patterns) return { dangerous: false, matches: [] };
  const matches = [];
  for (const { pattern, label, severity } of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const found = regex.test(source);
    if (found) {
      matches.push({ label, severity, pattern: pattern.source });
    }
  }
  return {
    dangerous: matches.length > 0,
    matches,
  };
}

export function recordDangerousCode(submissionId, userId, problemId, language, source, matches) {
  try {
    db.prepare(
      `INSERT INTO code_reports(submission_id,user_id,problem_id,language,source,matches,status,created_at)
       VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`
    ).run(
      submissionId,
      userId,
      problemId,
      language,
      source.slice(0, 10000),
      JSON.stringify(matches),
      "pending"
    );
  } catch (err) {
    console.error("Failed to record dangerous code report:", err.message);
  }
}

export function mountCodeReports() {
  // This function is called from index.js to set up the table migration.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS code_reports(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_id TEXT NOT NULL,
      language TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      matches TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      review_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS code_reports_status_idx ON code_reports(status,created_at DESC)`);
    db.exec(`CREATE INDEX IF NOT EXISTS code_reports_user_idx ON code_reports(user_id,created_at DESC)`);
  } catch (err) {
    console.error("code_reports migration:", err.message);
  }
}
