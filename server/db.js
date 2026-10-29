import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH || resolve(root, "data/infinte.db");
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
export const DEFAULT_AI_SETTINGS = Object.freeze({
  enabled: false,
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 1024,
  timeoutMs: 30000,
});
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_tags(id INTEGER PRIMARY KEY AUTOINCREMENT,label TEXT NOT NULL,color TEXT NOT NULL DEFAULT '#b08c00',scope TEXT NOT NULL DEFAULT 'personal');
CREATE TABLE IF NOT EXISTS user_tag_links(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,tag_id INTEGER NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,PRIMARY KEY(user_id,tag_id));
CREATE TABLE IF NOT EXISTS user_tag_overrides(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,tag_id INTEGER NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,tag_id));
CREATE TABLE IF NOT EXISTS certifications(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#6b4bbd',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,UNIQUE(user_id,kind));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_accounts(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(provider,subject));
CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,public_key TEXT NOT NULL,counter INTEGER NOT NULL DEFAULT 0,transports TEXT NOT NULL DEFAULT '[]',device_type TEXT NOT NULL DEFAULT '',backed_up INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_used_at TEXT);
CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys(user_id);
CREATE TABLE IF NOT EXISTS problems(id TEXT PRIMARY KEY,title TEXT NOT NULL,difficulty TEXT NOT NULL,tags TEXT NOT NULL,time_limit INTEGER NOT NULL,memory_limit INTEGER NOT NULL,description TEXT NOT NULL,input_format TEXT NOT NULL,output_format TEXT NOT NULL,sample_input TEXT NOT NULL,sample_output TEXT NOT NULL,testcases TEXT NOT NULL,submissions INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0,anti_cheat_enabled INTEGER NOT NULL DEFAULT 0,anti_cheat_limit INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS contests(id INTEGER PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL,starts_at TEXT NOT NULL,duration INTEGER NOT NULL,description TEXT NOT NULL DEFAULT '',rule_set TEXT NOT NULL DEFAULT '',team_size INTEGER NOT NULL DEFAULT 0,solving_duration INTEGER NOT NULL DEFAULT 0,hack_duration INTEGER NOT NULL DEFAULT 0,personal_problem_count INTEGER NOT NULL DEFAULT 0,team_problem_count INTEGER NOT NULL DEFAULT 0,mystery_problem INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS contest_problems(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,problem_id TEXT NOT NULL REFERENCES problems(id),position INTEGER NOT NULL,PRIMARY KEY(contest_id,problem_id));
CREATE TABLE IF NOT EXISTS contest_participants(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,team_no INTEGER NOT NULL,seat_no INTEGER NOT NULL,locked INTEGER NOT NULL DEFAULT 0,joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(contest_id,user_id),UNIQUE(contest_id,team_no,seat_no));
CREATE TABLE IF NOT EXISTS contest_team_invites(token TEXT PRIMARY KEY,contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,team_no INTEGER NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(contest_id,team_no));
CREATE TABLE IF NOT EXISTS contest_hacks(id INTEGER PRIMARY KEY AUTOINCREMENT,contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,attacker_id INTEGER NOT NULL REFERENCES users(id),target_user_id INTEGER REFERENCES users(id),problem_id TEXT NOT NULL REFERENCES problems(id),subtask TEXT NOT NULL DEFAULT '',phase TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',score_stolen INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT);
CREATE TABLE IF NOT EXISTS contest_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contest_score_overrides(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,subject_type TEXT NOT NULL,subject_id INTEGER NOT NULL,problem_id TEXT NOT NULL REFERENCES problems(id),score INTEGER NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(contest_id,subject_type,subject_id,problem_id));
CREATE TABLE IF NOT EXISTS learning_collections(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('training','homework')),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',starts_at TEXT,ends_at TEXT,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS learning_problems(collection_id INTEGER NOT NULL REFERENCES learning_collections(id) ON DELETE CASCADE,problem_id TEXT NOT NULL REFERENCES problems(id),position INTEGER NOT NULL,PRIMARY KEY(collection_id,problem_id));
CREATE TABLE IF NOT EXISTS discussions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS discussion_replies(id INTEGER PRIMARY KEY AUTOINCREMENT,discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),problem_id TEXT NOT NULL REFERENCES problems(id),language TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',score INTEGER NOT NULL DEFAULT 0,time_ms INTEGER,memory_kb INTEGER,detail TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS plugin_data(plugin TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(plugin,key));
CREATE TABLE IF NOT EXISTS system_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sponsor_key_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','issued','rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT);
CREATE INDEX IF NOT EXISTS sponsor_key_requests_status_idx ON sponsor_key_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS issued_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,key_hash TEXT NOT NULL UNIQUE,key_suffix TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at TEXT);
CREATE INDEX IF NOT EXISTS issued_keys_user_idx ON issued_keys(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS key_platform_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS license_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer TEXT NOT NULL,contact TEXT NOT NULL,site_url TEXT NOT NULL,amount_fen INTEGER NOT NULL,payment_ref TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','issued','rejected')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT);
CREATE INDEX IF NOT EXISTS license_orders_status_idx ON license_orders(status,created_at DESC);
CREATE TABLE IF NOT EXISTS license_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,customer TEXT NOT NULL,contact TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,key_suffix TEXT NOT NULL,tier TEXT NOT NULL CHECK(tier IN ('community','professional')),site_url TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,expires_at TEXT,bound_at TEXT,issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL);
CREATE INDEX IF NOT EXISTS license_keys_hash_idx ON license_keys(key_hash);
CREATE INDEX IF NOT EXISTS license_keys_site_idx ON license_keys(site_url,status);
CREATE TABLE IF NOT EXISTS ai_conversations(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL DEFAULT '新对话',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ai_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant')),content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx ON ai_conversations(user_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS countdowns(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS email_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,last_sent_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id INTEGER NOT NULL REFERENCES users(id),recipient_id INTEGER NOT NULL REFERENCES users(id),content TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS call_signals(id INTEGER PRIMARY KEY AUTOINCREMENT,sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,call_id TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS call_signals_recipient_idx ON call_signals(recipient_id,id);
CREATE TABLE IF NOT EXISTS blog_posts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id),title TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_files(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,stored_name TEXT NOT NULL,original_name TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS domains(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE NOT NULL,name TEXT NOT NULL,avatar TEXT NOT NULL DEFAULT '',announcement TEXT NOT NULL DEFAULT '',owner_id INTEGER NOT NULL REFERENCES users(id),join_method TEXT NOT NULL DEFAULT 'application',invite_code TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS domain_members(domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(domain_id,user_id));
CREATE TABLE IF NOT EXISTS domain_applications(id INTEGER PRIMARY KEY AUTOINCREMENT,domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,message TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(domain_id,user_id));
CREATE INDEX IF NOT EXISTS submission_created ON submissions(created_at DESC);`);
try { db.exec("ALTER TABLE users ADD COLUMN email TEXT"); } catch {}
try { db.exec("ALTER TABLE email_codes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL AND email <> ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN rp INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN custom_css TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN custom_html TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN custom_head TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN custom_script TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE domains ADD COLUMN carousel TEXT NOT NULL DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE domains ADD COLUMN carousel_interval INTEGER NOT NULL DEFAULT 5"); } catch {}
try { db.exec("ALTER TABLE submissions ADD COLUMN contest_id INTEGER REFERENCES contests(id) ON DELETE SET NULL"); } catch {}
try { db.exec("ALTER TABLE contest_hacks ADD COLUMN target_submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL"); } catch {}
try { db.exec("ALTER TABLE contest_hacks ADD COLUMN input TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS submissions_contest_idx ON submissions(contest_id,user_id,problem_id,id)"); } catch {}
try { db.exec("CREATE TABLE IF NOT EXISTS contest_score_overrides(contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,subject_type TEXT NOT NULL,subject_id INTEGER NOT NULL,problem_id TEXT NOT NULL REFERENCES problems(id),score INTEGER NOT NULL,updated_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(contest_id,subject_type,subject_id,problem_id))"); } catch {}
try { db.exec("ALTER TABLE certifications ADD COLUMN display_text TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.prepare("UPDATE certifications SET title='个人认证' WHERE title='大V个人认证'").run(); } catch {}
try { db.prepare("UPDATE certifications SET status='approved',reviewed_at=CURRENT_TIMESTAMP WHERE status='pending' AND user_id IN (SELECT id FROM users WHERE role IN ('admin','root'))").run(); } catch {}
try { db.exec("ALTER TABLE blog_posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0"); } catch {}
for (const sql of [
  "ALTER TABLE contests ADD COLUMN rule_set TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE contests ADD COLUMN team_size INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN solving_duration INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN hack_duration INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN personal_problem_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN team_problem_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN mystery_problem INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN problem_kinds TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE contests ADD COLUMN anti_cheat_disabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE contests ADD COLUMN team_mode TEXT NOT NULL DEFAULT 'invite'",
  "ALTER TABLE contests ADD COLUMN team_assignments TEXT NOT NULL DEFAULT '[]'",
]) { try { db.exec(sql); } catch {} }
for (const sql of [
  "ALTER TABLE problems ADD COLUMN anti_cheat_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE problems ADD COLUMN anti_cheat_limit INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE problems ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE problems ADD COLUMN spj_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE problems ADD COLUMN spj_source TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE problems ADD COLUMN question_type TEXT NOT NULL DEFAULT 'programming'",
  "ALTER TABLE problems ADD COLUMN objective_options TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE problems ADD COLUMN objective_answer TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE problems ADD COLUMN domain_id INTEGER REFERENCES domains(id)",
  "ALTER TABLE problems ADD COLUMN objective_items TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE problems ADD COLUMN integrity_enabled INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE problems ADD COLUMN integrity_summary_limit INTEGER NOT NULL DEFAULT 4000",
  "ALTER TABLE problems ADD COLUMN creator_id INTEGER",
]) { try { db.exec(sql); } catch {} }
// Domain ownership of the content that permission checks depend on.
for (const sql of [
  "ALTER TABLE contests ADD COLUMN creator_id INTEGER",
  "ALTER TABLE learning_collections ADD COLUMN domain_id INTEGER",
  "ALTER TABLE discussions ADD COLUMN domain_id INTEGER",
]) { try { db.exec(sql); } catch {} }
try {
  const mainDomain = db.prepare("SELECT id FROM domains ORDER BY id LIMIT 1").get();
  if (mainDomain) {
    db.prepare("UPDATE learning_collections SET domain_id=? WHERE domain_id IS NULL").run(mainDomain.id);
    db.prepare("UPDATE discussions SET domain_id=? WHERE domain_id IS NULL").run(mainDomain.id);
  }
} catch {}
db.exec(`CREATE TABLE IF NOT EXISTS problem_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  problem_id TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'cpp',
  watermark TEXT NOT NULL DEFAULT '',
  baseline TEXT NOT NULL DEFAULT '',
  baseline_hash TEXT NOT NULL DEFAULT '',
  fingerprint_token TEXT NOT NULL DEFAULT '',
  blank_lines TEXT NOT NULL DEFAULT '[]',
  violations TEXT NOT NULL DEFAULT '[]',
  score REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT '',
  verdict_summary TEXT NOT NULL DEFAULT '[]',
  pasted_chars INTEGER NOT NULL DEFAULT 0,
  run_json TEXT NOT NULL DEFAULT '',
  source_snapshot TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at INTEGER NOT NULL DEFAULT 0,
  ended_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS problem_sessions_open ON problem_sessions(user_id,problem_id) WHERE ended_at IS NULL;`)
try { const main=db.prepare("SELECT id FROM domains ORDER BY id LIMIT 1").get(); if(main) db.prepare("UPDATE problems SET domain_id=? WHERE domain_id IS NULL").run(main.id); } catch {}
db.exec(`CREATE TABLE IF NOT EXISTS friendships(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(requester_id,addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships(requester_id,status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships(addressee_id,status);
CREATE TABLE IF NOT EXISTS moments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS moments_user_idx ON moments(user_id,id DESC);
CREATE INDEX IF NOT EXISTS moments_created_idx ON moments(id DESC);
CREATE TABLE IF NOT EXISTS moment_likes(
  moment_id INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(moment_id,user_id)
);
CREATE TABLE IF NOT EXISTS moment_comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  moment_id INTEGER NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS moment_comments_moment_idx ON moment_comments(moment_id,id);`);
db.exec("CREATE TABLE IF NOT EXISTS problem_focus_events(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,problem_id))");
try { db.exec("ALTER TABLE problem_focus_events ADD COLUMN last_event_at INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.prepare("UPDATE problem_focus_events SET last_event_at=? WHERE count>0 AND last_event_at=0").run(Date.now()); } catch {}
try { db.exec("ALTER TABLE user_tags ADD COLUMN scope TEXT NOT NULL DEFAULT 'personal'"); } catch {}
try { db.prepare("DELETE FROM user_tag_links WHERE tag_id=-1").run(); db.prepare("DELETE FROM user_tags WHERE id=-1").run(); } catch {}
try { const firstAdmin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get(); if (firstAdmin && !db.prepare("SELECT 1 FROM users WHERE role='root'").get()) db.prepare("UPDATE users SET role='root' WHERE id=?").run(firstAdmin.id); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN banned_until INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN banned_at TEXT NOT NULL DEFAULT ''"); } catch {}
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
// Do not create sample contests or countdowns. A fresh installation starts empty.
// Remove the legacy bundled defaults from existing installations as well.
db.prepare("DELETE FROM contests WHERE title IN (?,?) AND description IN (?,?)").run(
  "Infinte Weekly #18", "秋季算法挑战赛", "每周算法挑战", "综合算法能力测试",
);
db.prepare("DELETE FROM countdowns WHERE id=1 AND title='下一场比赛开始'").run();
db.prepare("DELETE FROM system_settings WHERE key='countdown'").run();
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
    antiCheatResetMinutes: 10080,
    server: { allowInvite: true, uploadMb: 256, language: "简体中文", codeLanguage: "C++", cors: "" },
    limits: { problemFiles: 100, problemFileSize: 268435456, userFiles: 100, userFileSize: 134217728, contestFiles: 100, contestFileSize: 134217728, submissions: 60, submissionsPerUser: 15, pretests: 60, codeLength: 131072 },
    pagination: { problems: 100, contests: 20, discussions: 50, records: 100, ranking: 100, training: 10, replies: 50 },
    categories: "动态规划\n搜索\n计算几何\n贪心\n树结构\n图结构\n数论\n字符串",
    discussionNodes: "问答\n分享\n题解\n建议",
    languages: "C++\nC\nPython\nJava\nRust",
    about: "# 关于 {{ name }}\n\n致力于提供安全、完善、开放的在线评测服务。",
    session: { savedExpireSeconds: 2592000, unsavedExpireSeconds: 10800 },
    ai: { ...DEFAULT_AI_SETTINGS },
    integrity: { autoZeroViolations: true, autoZeroThreshold: 0.72 },
  }),
);
// Add newly introduced AI defaults to existing installations without
// overwriting values that an administrator has already configured.
try {
  const row = db.prepare("SELECT value FROM system_settings WHERE key='advanced'").get();
  const current = row ? JSON.parse(row.value) : {};
  if (!current.ai || typeof current.ai !== "object" || Array.isArray(current.ai)) {
    db.prepare("UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='advanced'")
      .run(JSON.stringify({ ...current, ai: { ...DEFAULT_AI_SETTINGS } }));
  } else {
    const ai = { ...DEFAULT_AI_SETTINGS, ...current.ai };
    if (JSON.stringify(ai) !== JSON.stringify(current.ai)) {
      db.prepare("UPDATE system_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key='advanced'")
        .run(JSON.stringify({ ...current, ai }));
    }
  }
} catch {}
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
  try { p.objective_options=JSON.parse(row.objective_options||"[]"); } catch { p.objective_options=[]; }
  try { p.objective_items=JSON.parse(row.objective_items||"[]"); } catch { p.objective_items=[]; }
  p.objective_items = p.objective_items.map(({ answer, ...item }) => item);
  delete p.testcases;
  delete p.spj_source;
  delete p.objective_answer;
  if (!full) {
    delete p.description;
    delete p.input_format;
    delete p.output_format;
    delete p.sample_input;
    delete p.sample_output;
  }
  return p;
}
