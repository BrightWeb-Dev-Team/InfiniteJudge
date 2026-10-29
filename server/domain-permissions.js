// Hydro-style per-domain permission matrix. Every domain owns its own guest /
// default / root columns plus the permissions of any extra roles it defines,
// and individual members can override a single permission.
import { auth } from "./auth.js";

export const PERMISSION_GROUPS = [
  {
    title: "一般",
    items: [
      ["view", "查看此域", "域内容对外可见"],
      ["view_private", "显示域中用户的私有信息", "邮箱、注册时间等"],
      ["edit_domain", "编辑域设置", "名称、公告、轮播图、加入方式"],
      ["show_mod_badge", "展示 MOD 徽章", "用户名旁显示管理标识"],
    ],
  },
  {
    title: "题库",
    items: [
      ["create_problem", "创建题目", ""],
      ["edit_problem", "修改题目", "任意题目，含测试点"],
      ["edit_own_problem", "修改自己的题目", ""],
      ["view_problem", "查看题目", ""],
      ["view_hidden_problem", "查看隐藏的题目", ""],
      ["submit_problem", "递交题目", ""],
      ["read_problem_data", "读取题目数据", "测试点与 Special Judge"],
    ],
  },
  {
    title: "记录",
    items: [
      ["view_record_other", "查看他人的记录", ""],
      ["read_record_code", "读取所有记录的代码", ""],
      ["read_accepted_code", "题目通过后读取记录的代码", ""],
      ["rejudge", "重测题目", ""],
      ["rejudge_record", "重测记录", ""],
      ["view_anti_cheat", "查看 AI 作弊检测", "答题会话、粘贴与风险分数"],
    ],
  },
  {
    title: "讨论",
    items: [
      ["view_discussion", "查看讨论", ""],
      ["create_discussion", "发表讨论", ""],
      ["modify_discussion", "修改讨论", "任意讨论"],
      ["modify_own_discussion", "修改自己的讨论", ""],
      ["lock_discussion", "锁定讨论", ""],
      ["delete_discussion", "删除讨论", "任意讨论"],
      ["delete_own_discussion", "删除自己的讨论", ""],
      ["reply_discussion", "回复讨论", ""],
      ["delete_discussion_reply", "删除讨论回复", "任意回复"],
      ["delete_own_discussion_reply", "删除自己的讨论回复", ""],
    ],
  },
  {
    title: "比赛",
    items: [
      ["view_contest", "查看比赛", ""],
      ["view_contest_scoreboard", "查看比赛成绩表", ""],
      ["view_contest_hidden", "查看隐藏的比赛递交状态和成绩表", "比赛结束前"],
      ["create_contest", "创建比赛", ""],
      ["join_contest", "参加比赛", ""],
      ["modify_contest", "修改任意的比赛", ""],
      ["modify_own_contest", "修改自己的比赛", ""],
      ["view_all_contest", "查看所有比赛", "含未开始的比赛"],
    ],
  },
  {
    title: "作业",
    items: [
      ["view_homework", "查看作业", ""],
      ["view_homework_scoreboard", "查看作业成绩表", ""],
      ["create_homework", "创建作业", ""],
      ["modify_homework", "修改任意的作业", ""],
      ["modify_own_homework", "修改自己的作业", ""],
    ],
  },
  {
    title: "训练",
    items: [
      ["view_training", "查看训练计划", ""],
      ["create_training", "创建训练计划", ""],
      ["modify_training", "修改训练计划", "任意训练"],
      ["pin_training", "置顶训练计划", ""],
      ["modify_own_training", "修改自己的训练计划", ""],
    ],
  },
  {
    title: "排名",
    items: [["view_ranking", "查看排名", ""]],
  },
  {
    title: "访问控制",
    items: [
      ["debt_notice", "查看欠费提示", ""],
      ["join_application", "加域申请", "查看与审核加入申请"],
      ["manage_role", "管理角色", "新建、删除角色并分配权限"],
      ["manage_user", "管理用户", "把成员分配到角色，踢出成员"],
      ["manage_permission", "管理权限", "修改本页的权限矩阵"],
      ["manage_user_priv", "批量设置用户权限", "为单个成员勾选额外权限"],
    ],
  },
  {
    title: "高级功能",
    items: [
      ["view_tag", "查看用户标签", ""],
      ["manage_tag", "管理用户标签", ""],
      ["import_user", "批量注册账号", ""],
      ["view_import_user", "批量注册账号管理", "查看导入记录"],
      ["review_certification", "审核认证", ""],
      ["manage_countdown", "管理倒计时", ""],
      ["maintenance", "站点维护", "清理会话、重算通过数"],
      ["manage_domain", "创建与删除域", "创建新域仅 root"],
    ],
  },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.items.map(([key]) => key));
const PERMISSION_SET = new Set(PERMISSIONS);

// Mirrors the Hydro defaults shown in the reference matrix: guests may look at
// the domain, problems, records, contests and homeworks, while everything that
// writes or reveals hidden data belongs to root.
const guestOnly = (key) => [
  "view", "view_problem", "view_record_other", "view_contest", "view_contest_scoreboard",
  "view_homework", "view_homework_scoreboard", "view_training", "view_ranking",
  "view_discussion", "view_contest_scoreboard",
].includes(key);
export const GUEST_DEFAULT = Object.fromEntries(PERMISSIONS.map((key) => [key, guestOnly(key)]));
export const ROOT_DEFAULT = Object.fromEntries(PERMISSIONS.map((key) => [key, true]));
export const DEFAULT_DEFAULT = Object.fromEntries(PERMISSIONS.map((key) => [key, ![
  "view_private", "edit_domain", "show_mod_badge", "create_problem", "edit_problem",
  "view_hidden_problem", "read_problem_data", "read_record_code", "read_accepted_code",
  "rejudge", "rejudge_record", "view_anti_cheat", "create_discussion", "modify_discussion",
  "lock_discussion", "delete_discussion", "delete_discussion_reply",
  "view_contest_hidden", "create_contest", "modify_contest", "modify_own_contest",
  "view_all_contest", "create_homework", "modify_homework", "modify_own_homework",
  "create_training", "modify_training", "pin_training", "debt_notice", "manage_role",
  "manage_user", "manage_permission", "manage_user_priv", "view_tag", "manage_tag",
  "import_user", "view_import_user", "review_certification", "manage_countdown",
  "maintenance", "manage_domain",
].includes(key)]));

// What managers receive when they create a role, so delegation is useful out of
// the box; every item can still be ticked per role.
export const MANAGER_DEFAULT = Object.fromEntries(PERMISSIONS.map((key) => [
  key,
  !["edit_domain", "manage_permission", "manage_role", "manage_domain", "manage_user_priv", "import_user", "maintenance", "read_problem_data", "read_record_code"].includes(key),
]));

// Saved columns only carry explicit ticks, so every other key is off.
const storedColumn = (value) => {
  const parsed = (() => { try { return JSON.parse(value); } catch { return null; } })();
  return Boolean(parsed && typeof parsed === "object" && Object.keys(parsed).length);
};
const column = (stored, fallback) => ({ ...Object.fromEntries(Object.keys(fallback).map((key) => [key, false])), ...Object.fromEntries(Object.entries(stored).filter(([key, on]) => on === true)) });
const parseJson = (text, fallback) => {
  try { const value = JSON.parse(text); return value ?? fallback; } catch { return fallback; }
};
const onlyKnown = (value) => Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {}).filter(([key, on]) => PERMISSION_SET.has(key) && on === true));

export function mountDomainPermissions(app, db) {
  db.exec(`CREATE TABLE IF NOT EXISTS domain_permissions(
  domain_id INTEGER PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
  guest TEXT NOT NULL DEFAULT '{}',
  member TEXT NOT NULL DEFAULT '{}',
  root TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS domain_roles(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(domain_id,name)
);
CREATE TABLE IF NOT EXISTS domain_member_overrides(
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(domain_id,user_id)
);`);

  const domainOf = (id) => Number(id) > 0 ? db.prepare("SELECT * FROM domains WHERE id=?").get(Number(id)) : null;
  // Scripts and tests talk to the API without a browser; fall back to the
  // earliest domain so "current domain" is never silently empty there.
  const fallbackDomainId = () => db.prepare("SELECT id FROM domains ORDER BY id LIMIT 1").get()?.id || null;
  const memberOf = (domainId, userId) => db.prepare("SELECT role FROM domain_members WHERE domain_id=? AND user_id=?").get(domainId, userId);
  function matrix(domainId) {
    const row = db.prepare("SELECT * FROM domain_permissions WHERE domain_id=?").get(domainId);
    // A saved column is authoritative in full: a stored `false` must not be
    // resurrected by the built-in default for the same key.
    const pick = (value, fallback) => storedColumn(value) ? column(parseJson(value, {}), fallback) : { ...fallback };
    return {
      guest: pick(row?.guest, GUEST_DEFAULT),
      member: pick(row?.member, DEFAULT_DEFAULT),
      root: pick(row?.root, ROOT_DEFAULT),
      roles: db.prepare("SELECT id,name,permissions FROM domain_roles WHERE domain_id=? ORDER BY id").all(domainId).map((role) => ({ id: role.id, name: role.name, permissions: { ...MANAGER_DEFAULT, ...onlyKnown(parseJson(role.permissions, {})) } })),
    };
  }
  // Root bypasses the matrix, administrators are ordinary members of a domain
  // unless a role or override grants them more, and non-members fall back to
  // the guest column chosen for that domain.
  function permissionsFor(user, domainId) {
    const d = domainOf(domainId);
    if (!d) return { perms: {}, domain: null, role: "guest", isRoot: false };
    if (user?.role === "root") return { perms: { ...ROOT_DEFAULT }, domain: d, role: "root", isRoot: true };
    const m = user ? memberOf(d.id, user.id) : null;
    if (!m) return { perms: { ...matrix(d.id).guest }, domain: d, role: "guest", isRoot: false };
    const table = matrix(d.id);
    let base;
    if (m.role === "owner") base = { ...ROOT_DEFAULT };
    else if (m.role === "manager") base = { ...table.member };
    else {
      const role = table.roles.find((item) => item.name === m.role);
      base = { ...MANAGER_DEFAULT, ...table.member, ...(role?.permissions || {}) };
    }
    const row = db.prepare("SELECT permissions FROM domain_member_overrides WHERE domain_id=? AND user_id=?").get(d.id, user.id);
    return { perms: { ...base, ...onlyKnown(parseJson(row?.permissions, {})) }, domain: d, role: m.role, isRoot: false };
  }
  const activeDomainId = (req) => Number(req.headers["x-domain-id"]) || Number(req.body?.domain_id) || fallbackDomainId();
  function can(req, permission, domainId = activeDomainId(req)) {
    if (!req.user) return false;
    if (req.user.role === "root") return true;
    const d = domainOf(domainId);
    if (!d) return false;
    return Boolean(permissionsFor(req.user, d.id).perms[permission]);
  }
  // Gate a domain-scoped route; the permission check also loads req.permissions
  // so handlers can apply row-level rules (own vs any) without a second lookup.
  function domainPermission(permission, resolveDomain = activeDomainId) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "请先登录" });
      const domainId = resolveDomain(req);
      const d = domainOf(domainId);
      if (!d) return res.status(404).json({ error: "域不存在" });
      const result = permissionsFor(req.user, d.id);
      if (!result.perms[permission]) return res.status(403).json({ error: "当前域没有该权限", permission, domain_id: d.id });
      req.domain = d; req.domainPermissions = result;
      next();
    };
  }
  const publicMatrix = (domainId) => ({ domain_id: domainId, ...matrix(domainId) });

  // Drives navigation and buttons; the server still checks every route.
  app.get("/api/my-permissions", auth, (req, res) => {
    const result = permissionsFor(req.user, activeDomainId(req));
    const domains = db.prepare("SELECT id,name FROM domains ORDER BY id").all()
      .map((d) => ({ id: d.id, name: d.name, role: permissionsFor(req.user, d.id).role }))
      .filter((d) => permissionsFor(req.user, d.id).perms.view);
    res.json({ domain_id: result.domain?.id || null, role: result.role, is_root: result.isRoot, permissions: result.perms, domains });
  });
  app.get("/api/domains/:id/permissions", auth, domainPermission("manage_permission", (req) => req.params.id), (_, res) => res.json(publicMatrix(_.domain.id)));
  app.put("/api/domains/:id/permissions", auth, domainPermission("manage_permission", (req) => req.params.id), (req, res) => {
    const columns = {};
    for (const key of ["guest", "member", "root"]) {
      const value = req.body?.[key];
      if (value === undefined) continue;
      if (typeof value !== "object" || Array.isArray(value)) return res.status(400).json({ error: "权限格式无效" });
      columns[key] = JSON.stringify(onlyKnown(value));
    }
    const current = db.prepare("SELECT * FROM domain_permissions WHERE domain_id=?").get(req.domain.id);
    db.prepare("INSERT INTO domain_permissions(domain_id,guest,member,root) VALUES(?,?,?,?) ON CONFLICT(domain_id) DO UPDATE SET guest=excluded.guest,member=excluded.member,root=excluded.root,updated_at=CURRENT_TIMESTAMP")
      .run(req.domain.id, columns.guest ?? current?.guest ?? "{}", columns.member ?? current?.member ?? "{}", columns.root ?? current?.root ?? "{}");
    res.json(publicMatrix(req.domain.id));
  });
  app.post("/api/domains/:id/roles", auth, domainPermission("manage_role", (req) => req.params.id), (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!/^[\p{L}\p{N}_-]{1,24}$/u.test(name) || ["owner", "manager", "member"].includes(name)) return res.status(400).json({ error: "角色名无效或与内置角色重名" });
    try {
      const permissions = JsonOr(req.body?.permissions);
      db.prepare("INSERT INTO domain_roles(domain_id,name,permissions) VALUES(?,?,?)").run(req.domain.id, name, JSON.stringify(permissions));
    } catch { return res.status(409).json({ error: "角色已存在" }); }
    res.status(201).json(publicMatrix(req.domain.id));
  });
  app.put("/api/domains/:id/roles/:roleId", auth, domainPermission("manage_role", (req) => req.params.id), (req, res) => {
    const role = db.prepare("SELECT * FROM domain_roles WHERE id=? AND domain_id=?").get(req.params.roleId, req.domain.id);
    if (!role) return res.status(404).json({ error: "角色不存在" });
    const name = req.body?.name === undefined ? role.name : String(req.body.name).trim();
    if (!/^[\p{L}\p{N}_-]{1,24}$/u.test(name) || ["owner", "manager", "member"].includes(name)) return res.status(400).json({ error: "角色名无效或与内置角色重名" });
    const permissions = req.body?.permissions === undefined ? role.permissions : JSON.stringify(onlyKnown(req.body.permissions));
    try { db.prepare("UPDATE domain_roles SET name=?,permissions=? WHERE id=?").run(name, permissions, role.id); }
    catch { return res.status(409).json({ error: "角色已存在" }); }
    if (name !== role.name) db.prepare("UPDATE domain_members SET role=? WHERE domain_id=? AND role=?").run(name, req.domain.id, role.name);
    res.json(publicMatrix(req.domain.id));
  });
  app.delete("/api/domains/:id/roles/:roleId", auth, domainPermission("manage_role", (req) => req.params.id), (req, res) => {
    const role = db.prepare("SELECT * FROM domain_roles WHERE id=? AND domain_id=?").get(req.params.roleId, req.domain.id);
    if (!role) return res.status(404).json({ error: "角色不存在" });
    db.prepare("DELETE FROM domain_roles WHERE id=?").run(role.id);
    db.prepare("UPDATE domain_members SET role='member' WHERE domain_id=? AND role=?").run(req.domain.id, role.name);
    res.json(publicMatrix(req.domain.id));
  });
  app.get("/api/domains/:id/member-permissions", auth, domainPermission("manage_user_priv", (req) => req.params.id), (req, res) => {
    const rows = db.prepare(`SELECT m.user_id,u.username,m.role,o.permissions FROM domain_members m JOIN users u ON u.id=m.user_id LEFT JOIN domain_member_overrides o ON o.domain_id=m.domain_id AND o.user_id=m.user_id WHERE m.domain_id=? ORDER BY m.joined_at`).all(req.domain.id);
    res.json(rows.map((row) => ({ user_id: row.user_id, username: row.username, role: row.role, overrides: onlyKnown(parseJson(row.permissions, {})) })));
  });
  app.put("/api/domains/:id/member-permissions/:userId", auth, domainPermission("manage_user_priv", (req) => req.params.id), (req, res) => {
    if (!memberOf(req.domain.id, req.params.userId)) return res.status(404).json({ error: "该用户不在本域" });
    if (Number(req.params.userId) === Number(req.user.id)) return res.status(400).json({ error: "不能修改自己的权限" });
    const overrides = onlyKnown(req.body?.permissions);
    if (Object.keys(overrides).length) db.prepare("INSERT INTO domain_member_overrides(domain_id,user_id,permissions) VALUES(?,?,?) ON CONFLICT(domain_id,user_id) DO UPDATE SET permissions=excluded.permissions").run(req.domain.id, req.params.userId, JSON.stringify(overrides));
    else db.prepare("DELETE FROM domain_member_overrides WHERE domain_id=? AND user_id=?").run(req.domain.id, req.params.userId);
    res.json({ ok: true, overrides });
  });
  return { can, domainPermission, permissionsFor, domainOf, memberOf, PERMISSIONS };
}

const JsonOr = (value) => (value && typeof value === "object" ? onlyKnown(value) : {});
