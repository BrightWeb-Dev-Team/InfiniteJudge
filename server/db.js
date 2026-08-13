import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH || resolve(root, "data/infinte.db");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS problems(id TEXT PRIMARY KEY,title TEXT NOT NULL,difficulty TEXT NOT NULL,tags TEXT NOT NULL,time_limit INTEGER NOT NULL,memory_limit INTEGER NOT NULL,description TEXT NOT NULL,input_format TEXT NOT NULL,output_format TEXT NOT NULL,sample_input TEXT NOT NULL,sample_output TEXT NOT NULL,testcases TEXT NOT NULL,submissions INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS contests(id INTEGER PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL,starts_at TEXT NOT NULL,duration INTEGER NOT NULL,description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS contest_problems(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,problem_id TEXT NOT NULL REFERENCES problems(id),position INTEGER NOT NULL,PRIMARY KEY(contest_id,problem_id));
CREATE TABLE IF NOT EXISTS learning_collections(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('training','homework')),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',starts_at TEXT,ends_at TEXT,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS learning_problems(collection_id INTEGER NOT NULL REFERENCES learning_collections(id) ON DELETE CASCADE,problem_id TEXT NOT NULL REFERENCES problems(id),position INTEGER NOT NULL,PRIMARY KEY(collection_id,problem_id));
CREATE TABLE IF NOT EXISTS discussions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discussion_replies(id INTEGER PRIMARY KEY AUTOINCREMENT,discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),problem_id TEXT NOT NULL REFERENCES problems(id),language TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',score INTEGER NOT NULL DEFAULT 0,time_ms INTEGER,memory_kb INTEGER,detail TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plugin_data(plugin TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(plugin,key));
CREATE TABLE IF NOT EXISTS system_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS countdowns(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS email_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,last_sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id INTEGER NOT NULL REFERENCES users(id),recipient_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS blog_posts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_files(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,stored_name TEXT NOT NULL,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS domains(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,avatar TEXT NOT NULL DEFAULT '',announcement TEXT NOT NULL DEFAULT '',owner_id INTEGER NOT NULL REFERENCES users(id),join_method TEXT NOT NULL DEFAULT 'application',invite_code TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS domain_members(domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(domain_id,user_id));
CREATE TABLE IF NOT EXISTS domain_applications(id INTEGER PRIMARY KEY AUTOINCREMENT,domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,message TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(domain_id,user_id));
CREATE INDEX IF NOT EXISTS submission_created ON submissions(created_at DESC);`);
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL AND email <> ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN rp INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"); } catch {}
const seedProblems = [
  [
    "IJ1001",
    "A + B Problem",
    "入门",
    ["基础", "输入输出"],
    1000,
    128,
    "读入两个整数 a 和 b，输出它们的和。",
    "一行两个整数 a 和 b。",
    "输出一个整数 a+b。",
    "3 5",
    "8",
    [
      ["1 2", "3"],
      ["-5 9", "4"],
      ["1000000 2000000", "3000000"],
    ],
  ],
  [
    "IJ1002",
    "穿越无限回廊",
    "简单",
    ["BFS", "最短路"],
    1000,
    256,
    "给定一张无权无向图，求从节点 1 到节点 n 的最短距离。",
    "第一行 n m，随后 m 行为边。",
    "输出最短距离，不可达输出 -1。",
    "4 4\n1 2\n2 4\n1 3\n3 4",
    "2",
    [
      ["2 1\n1 2", "1"],
      ["3 1\n1 2", "-1"],
    ],
  ],
  [
    "IJ1003",
    "星际信使",
    "中等",
    ["动态规划", "序列"],
    1500,
    256,
    "给定一个整数序列，选择严格递增的子序列，使所选元素之和最大。",
    "第一行 n，第二行 n 个整数。",
    "输出严格递增子序列的最大元素和。",
    "6\n3 1 5 2 6 4",
    "14",
    [
      ["6\n3 1 5 2 6 4", "14"],
      ["4\n4 3 2 1", "4"],
      ["5\n1 2 3 4 5", "15"],
    ],
  ],
  [
    "IJ1004",
    "城市脉络",
    "中等",
    ["图论", "最小生成树"],
    2000,
    256,
    "给定带权连通无向图，求最小生成树的权值和。",
    "第一行 n m，随后 m 行 u v w。",
    "输出最小生成树权值。",
    "3 3\n1 2 2\n2 3 3\n1 3 7",
    "5",
    [["3 3\n1 2 2\n2 3 3\n1 3 7", "5"]],
  ],
  [
    "IJ1005",
    "量子棋盘",
    "困难",
    ["状态压缩", "搜索"],
    2000,
    512,
    "给定 n，计算 n 位二进制数中不存在相邻两个 1 的方案数。",
    "一个整数 n。",
    "输出方案数。",
    "3",
    "5",
    [
      ["1", "2"],
      ["3", "5"],
      ["5", "13"],
    ],
  ],
  [
    "IJ1006",
    "循环节探测器",
    "简单",
    ["字符串", "KMP"],
    1000,
    128,
    "给定字符串，求它的最短循环节长度。",
    "一行非空小写字符串。",
    "输出最短循环节长度。",
    "ababab",
    "2",
    [
      ["ababab", "2"],
      ["abc", "3"],
      ["aaaa", "1"],
    ],
  ],
  [
    "IJ1007",
    "引力场中的路径",
    "困难",
    ["计算几何", "最短路"],
    2500,
    512,
    "给定 n 个点，输出相邻点欧氏距离之和，保留两位小数。",
    "第一行 n，随后 n 行坐标。",
    "输出距离和。",
    "3\n0 0\n3 4\n3 8",
    "9.00",
    [["3\n0 0\n3 4\n3 8", "9.00"]],
  ],
  [
    "IJ1008",
    "数据洪流",
    "中等",
    ["数据结构", "线段树"],
    2000,
    256,
    "维护数组，支持单点修改和区间求和。",
    "第一行 n q，第二行数组，随后 q 个操作。",
    "对每个查询输出一行。",
    "3 2\n1 2 3\nQ 1 3\nC 2 5",
    "6",
    [["3 3\n1 2 3\nQ 1 3\nC 2 5\nQ 1 3", "6\n9"]],
  ],
];
const insert = db.prepare(
  `INSERT OR IGNORE INTO problems(id,title,difficulty,tags,time_limit,memory_limit,description,input_format,output_format,sample_input,sample_output,testcases) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
);
for (const p of seedProblems)
  insert.run(
    ...p.slice(0, 3),
    JSON.stringify(p[3]),
    ...p.slice(4, 11),
    JSON.stringify(p[11]),
  );
const contest = db.prepare(
  "INSERT INTO contests(title,type,starts_at,duration,description) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM contests)",
);
contest.run(
  "Infinte Weekly #18",
  "ACM",
  "2026-08-12T19:30:00+08:00",
  120,
  "每周算法挑战",
);
contest.run(
  "秋季算法挑战赛",
  "IOI",
  "2026-08-16T09:00:00+08:00",
  300,
  "综合算法能力测试",
);
const target = new Date(Date.now() + 7 * 864e5);
target.setSeconds(0, 0);
db.prepare("INSERT OR IGNORE INTO system_settings(key,value) VALUES(?,?)").run(
  "countdown",
  JSON.stringify({ title: "下一场比赛开始", target: target.toISOString() }),
);
db.prepare("INSERT OR IGNORE INTO countdowns(id,title,target) VALUES(1,?,?)").run(
  "下一场比赛开始",
  target.toISOString(),
);
db.prepare("INSERT OR IGNORE INTO system_settings(key,value) VALUES(?,?)").run(
  "site",
  JSON.stringify({
    name: "Infinte Judge",
    serviceUrl: "http://localhost:5173/",
    logo: "",
    announcement: "# 欢迎使用 Infinte Judge\n\n一个兼容 HydroOJ 插件、支持本地沙箱评测的在线编程系统。",
  }),
);
db.prepare("INSERT OR IGNORE INTO system_settings(key,value) VALUES(?,?)").run(
  "advanced",
  JSON.stringify({
    server: { allowInvite: true, uploadMb: 256, language: "简体中文", codeLanguage: "C++", cors: "" },
    limits: { problemFiles: 100, problemFileSize: 268435456, userFiles: 100, userFileSize: 134217728, contestFiles: 100, contestFileSize: 134217728, submissions: 60, submissionsPerUser: 15, pretests: 60, codeLength: 131072 },
    pagination: { problems: 100, contests: 20, discussions: 50, records: 100, ranking: 100, training: 10, replies: 50 },
    categories: "动态规划\n搜索\n计算几何\n贪心\n树结构\n图结构\n数论\n字符串",
    discussionNodes: "问答\n分享\n题解\n建议",
    languages: "C++\nC\nPython\nJava\nRust",
    about: "# 关于 {{ name }}\n\n致力于提供安全、完善、开放的在线评测服务。",
    session: { savedExpireSeconds: 2592000, unsavedExpireSeconds: 10800 },
  }),
);
if (db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get())
  db.prepare("INSERT OR IGNORE INTO system_settings(key,value) VALUES('installed','true')").run();
const existingAdmin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
if (existingAdmin && !db.prepare("SELECT 1 FROM domains LIMIT 1").get()) {
  const site = JSON.parse(db.prepare("SELECT value FROM system_settings WHERE key='site'").get().value);
  const result = db.prepare("INSERT INTO domains(slug,name,announcement,owner_id,join_method) VALUES('main',?,?,?,'application')").run(site.name || "主域", site.announcement || "", existingAdmin.id);
  db.prepare("INSERT INTO domain_members(domain_id,user_id,role) VALUES(?,?,'owner')").run(result.lastInsertRowid, existingAdmin.id);
}

export function publicProblem(row, full = false) {
  const p = {
    ...row,
    tags: JSON.parse(row.tags),
    acceptance: row.submissions
      ? Math.round((row.accepted / row.submissions) * 100)
      : 0,
  };
  delete p.testcases;
  if (!full) {
    delete p.description;
    delete p.input_format;
    delete p.output_format;
    delete p.sample_input;
    delete p.sample_output;
  }
  return p;
}
