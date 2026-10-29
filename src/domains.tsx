import { Fragment, useEffect, useState } from "react";
import { Markdown } from "./markdown";
import { handleEditorTab } from "./editor";
import { Check, Plus, Save, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { api, DomainPermissionMatrix, DomainRole, User } from "./api";
type View = "dashboard" | "edit" | "join" | "members" | "applications" | "permissions" | "roles" | "member-permissions";
export function DomainsPage({
  user,
  error,
  changed,
}: {
  user: User;
  error: (s: string) => void;
  changed?: () => void;
}) {
  const [domains, setDomains] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [view, setView] = useState<View>("dashboard"),
    [creating, setCreating] = useState(false),
    [slug, setSlug] = useState(""),
    [name, setName] = useState(""),
    [carouselText, setCarouselText] = useState(""),
    [permissions, setPermissions] = useState<DomainPermissionMatrix | null>(null),
    [members, setMembers] = useState<Array<{ user_id: number; username: string; role: string; overrides: Record<string, boolean> }>>([]),
    [confirmSlug, setConfirmSlug] = useState(""),
    [deleting, setDeleting] = useState(false);
  const load = () =>
    api
      .domains()
      .then(setDomains)
      .catch((e) => error(e.message));
  const open = async (id: number) => {
    try {
      const domain = await api.domain(id);
      setSelected(domain);
      setConfirmSlug("");
      setCarouselText(Array.isArray(domain.carousel) ? domain.carousel.map((item: any) => [item.image, item.title || "", item.link || ""].join("|")).join("\n") : "");
      setView("dashboard");
      setPermissions(null);
      const perms = domain.my_permissions || {};
      if (user.role === "root" || perms.manage_permission || perms.manage_role) api.domainPermissions(id).then(setPermissions).catch(() => {});
      if (user.role === "root" || perms.manage_user_priv) api.domainMemberPermissions(id).then(setMembers).catch(() => {});
    } catch (e: any) {
      error(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const refresh = () => selected && open(selected.id);
  const remove = async () => {
    if (!selected || confirmSlug !== selected.slug || deleting) return;
    if (!confirm(`确定删除域「${selected.name}」吗？该域的全部题目、比赛引用和成员关系都会一并删除，此操作无法撤销。`)) return;
    setDeleting(true);
    try {
      await api.deleteDomain(selected.id);
      if (localStorage.getItem("ij-domain-id") === String(selected.id)) localStorage.removeItem("ij-domain-id");
      setSelected(null);
      await load();
      changed?.();
    } catch (e: any) {
      error(e.message);
    } finally {
      setDeleting(false);
    }
  };
  if (!selected)
    return (
      <section className="page">
        <div className="page-title discussion-title">
          <div>
            <span className="kicker">WORKSPACES</span>
            <h1>域</h1>
            <p>为团队、学校或训练组织独立成员与权限。</p>
          </div>
          {user.role === "root" && (
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus />
              创建域
            </button>
          )}
        </div>
        <div className="domain-grid">
          {domains.map((d) => (
            <button key={d.id} onClick={() => open(d.id)}>
              <span className="domain-avatar">{d.name[0]}</span>
              <div>
                <b>{d.name}</b>
                <small>
                  {d.slug} · {d.members} 位成员
                </small>
              </div>
            </button>
          ))}
        </div>
        {!domains.length && (
          <div className="large-empty">
            <Users />
            <p>还没有域。</p>
          </div>
        )}
        {creating && (
          <div className="modal-bg">
            <form
              className="auth-modal"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const d = await api.createDomain({ slug, name });
                  setCreating(false);
                  load();
                  open(d.id);
                } catch (e: any) {
                  error(e.message);
                }
              }}
            >
              <button
                type="button"
                className="modal-close"
                onClick={() => setCreating(false)}
              >
                <X />
              </button>
              <h2>创建域</h2>
              <label>
                域标识
                <input
                  required
                  pattern="[a-z0-9-]{2,32}"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
              </label>
              <label>
                名称
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="primary">创建</button>
            </form>
          </div>
        )}
      </section>
    );
  const save = async (e: any) => {
    e.preventDefault();
    try {
      const carousel = carouselText.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 10).map((line) => { const [image, title = "", link = ""] = line.split("|"); return { image: image.trim(), title: title.trim(), link: link.trim() }; }).filter((item) => item.image);
      await api.updateDomain(selected.id, { ...selected, carousel });
      changed?.();
      refresh();
    } catch (e: any) {
      error(e.message);
    }
  };
  // Entries mirror the permissions the server enforces for this domain.
  const mine: Record<string, boolean> = selected?.my_permissions || {};
  const allowed = (permission: string) => user.role === "root" || Boolean(mine[permission]);
  const items = ([
    ["dashboard", "管理域"],
    allowed("edit_domain") && ["edit", "编辑域资料"],
    allowed("edit_domain") && ["join", "加域设置"],
    allowed("manage_user") && ["members", "管理用户"],
    allowed("join_application") && ["applications", "加域申请"],
    allowed("manage_permission") && ["permissions", "管理权限"],
    allowed("manage_role") && ["roles", "管理角色"],
    allowed("manage_user_priv") && ["member-permissions", "批量设置用户权限"],
  ] as Array<[View, string] | false>).filter(Boolean) as Array<[View, string]>;
  return (
    <section className="page control-layout">
      <div className="control-content">
        {view === "dashboard" && (
          <>
            <section className="control-card">
              <button className="back" onClick={() => setSelected(null)}>
                返回域列表
              </button>
              <h1>{selected.name}</h1>
              <Markdown>{selected.announcement || "暂无公告"}</Markdown>
            </section>
            <section className="control-card">
              <h1>信息</h1>
              <div className="domain-info">
                <span>名称</span>
                <b>{selected.name}</b>
                <span>标识</span>
                <b>{selected.slug}</b>
                <span>所有者</span>
                <b>{selected.owner}</b>
              </div>
            </section>
            {domains.length > 1 && (
              <section className="control-card domain-danger">
                <h1>删除域</h1>
                <p>删除后该域及其题目、提交、成员与加域申请都会被永久移除，无法恢复。</p>
                <label className="field">
                  <span>输入域标识 <code>{selected.slug}</code> 以确认</span>
                  <input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value.trim())} placeholder={selected.slug} />
                </label>
                <button type="button" className="danger" disabled={confirmSlug !== selected.slug || deleting} onClick={remove}>
                  <Trash2 />
                  {deleting ? "删除中..." : "删除此域"}
                </button>
              </section>
            )}
          </>
        )}
        {view === "edit" && (
          <form className="control-card content-form" onSubmit={save}>
            <h1>域设置</h1>
            <label className="field">
              <span>名称</span>
              <input
                value={selected.name}
                onChange={(e) =>
                  setSelected({ ...selected, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Avatar URL</span>
              <input
                value={selected.avatar}
                onChange={(e) =>
                  setSelected({ ...selected, avatar: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span>公告（Markdown）</span>
          <textarea
            rows={15}
            value={selected.announcement}
            onChange={(e) =>
              setSelected({ ...selected, announcement: e.target.value })
            }
            onKeyDown={(e) =>
              handleEditorTab(e, selected.announcement, (next) =>
                setSelected({ ...selected, announcement: next })
              )
            }
          />
            </label>
            <label className="field">
              <span>轮播图（每行：图片地址 | 标题 | 跳转地址）</span>
          <textarea rows={7} value={carouselText} onChange={(e) => setCarouselText(e.target.value)} onKeyDown={(e) => handleEditorTab(e, carouselText, setCarouselText)} placeholder="https://example.com/banner.jpg | 标题 | https://example.com" />
              <small>最多 10 张，标题和跳转地址可留空。</small>
            </label>
            <label className="field">
              <span>轮播切换间隔（秒）</span>
              <input type="number" min={1} max={60} step={1} value={selected.carousel_interval ?? 5} onChange={(e) => setSelected({ ...selected, carousel_interval: e.target.value })} />
              <small>可设置 1–60 秒，默认 5 秒。</small>
            </label>
            <button className="primary">
              <Save />
              保存资料
            </button>
          </form>
        )}
        {view === "join" && (
          <form className="control-card content-form" onSubmit={save}>
            <h1>加域设置</h1>
            <label className="field">
              <span>加入方式</span>
              <select
                value={selected.join_method}
                onChange={(e) =>
                  setSelected({ ...selected, join_method: e.target.value })
                }
              >
                <option value="closed">关闭加入</option>
                <option value="application">申请审批</option>
                <option value="open">开放加入</option>
                <option value="invite">邀请码</option>
              </select>
            </label>
            {selected.join_method === "invite" && (
              <label className="field">
                <span>邀请码</span>
                <input
                  value={selected.invite_code}
                  onChange={(e) =>
                    setSelected({ ...selected, invite_code: e.target.value })
                  }
                />
              </label>
            )}
            <button className="primary">
              <Save />
              更新设置
            </button>
          </form>
        )}
        {view === "members" && (
          <section className="control-card">
            <h1>域成员</h1>
            <table>
              <thead>
                <tr>
                  <th>UID</th>
                  <th>用户</th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                {selected.members.map((m: any) => (
                  <tr key={m.user_id}>
                    <td>{m.user_id}</td>
                    <td>{m.username}</td>
                    <td>
                      {m.role === "owner" ? (
                        "所有者"
                      ) : (
                        <select
                          value={m.role}
                          disabled={m.user_id === user.id}
                          onChange={async (e) => {
                            try {
                              await api.updateDomainMember(selected.id, m.user_id, e.target.value);
                              refresh();
                            } catch (cause: any) { error(cause.message); }
                          }}
                        >
                          <option value="member">成员</option>
                          <option value="manager">管理员</option>
                          {(permissions?.roles || []).map((role) => <option key={role.id} value={role.name}>{role.name}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view === "permissions" && permissions && (
          <PermissionMatrix domain={selected} matrix={permissions} error={error} saved={(next) => { setPermissions(next); refresh(); }} />
        )}
        {view === "roles" && permissions && (
          <RoleManager domain={selected} matrix={permissions} error={error} saved={(next) => { setPermissions(next); refresh(); }} />
        )}
        {view === "member-permissions" && (
          <MemberPermissions domain={selected} members={members} matrix={permissions} error={error} reload={() => { api.domainMemberPermissions(selected.id).then(setMembers).catch(() => {}); refresh(); }} />
        )}
        {view === "applications" && (
          <section className="control-card">
            <h1>加域申请</h1>
            {selected.applications.map((a: any) => (
              <article className="application-row" key={a.id}>
                <div>
                  <b>{a.username}</b>
                  <p>{a.message || "无留言"}</p>
                </div>
                <span>{a.status}</span>
                {a.status === "pending" && (
                  <>
                    <button
                      className="primary"
                      onClick={async () => {
                        await api.decideDomainApplication(
                          selected.id,
                          a.id,
                          "approved",
                        );
                        refresh();
                      }}
                    >
                      <Check />
                      通过
                    </button>
                    <button
                      className="plain"
                      onClick={async () => {
                        await api.decideDomainApplication(
                          selected.id,
                          a.id,
                          "rejected",
                        );
                        refresh();
                      }}
                    >
                      拒绝
                    </button>
                  </>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
      <aside className="control-nav">
        <div className="control-nav-title">
          <ShieldCheck />
          域属性
        </div>
        {items.map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </aside>
    </section>
  );
}

// Permission keys are declared here again so the page can render without a
// round trip; the server validates every key it receives.
const PERMISSION_GROUPS: Array<{ title: string; items: Array<[string, string, string?]> }> = [
  { title: "一般", items: [["view", "查看此域"], ["view_private", "显示域中用户的私有信息"], ["edit_domain", "编辑域设置"], ["show_mod_badge", "展示 MOD 徽章"]] },
  { title: "题库", items: [["create_problem", "创建题目"], ["edit_problem", "修改题目"], ["edit_own_problem", "修改自己的题目"], ["view_problem", "查看题目"], ["view_hidden_problem", "查看隐藏的题目"], ["submit_problem", "递交题目"], ["read_problem_data", "读取题目数据"]] },
  { title: "记录", items: [["view_record_other", "查看他人的记录"], ["read_record_code", "读取所有记录的代码"], ["read_accepted_code", "题目通过后读取记录的代码"], ["rejudge", "重测题目"], ["rejudge_record", "重测记录"], ["view_anti_cheat", "查看 AI 作弊检测"]] },
  { title: "讨论", items: [["view_discussion", "查看讨论"], ["create_discussion", "发表讨论"], ["modify_discussion", "修改讨论"], ["modify_own_discussion", "修改自己的讨论"], ["lock_discussion", "锁定讨论"], ["delete_discussion", "删除讨论"], ["delete_own_discussion", "删除自己的讨论"], ["reply_discussion", "回复讨论"], ["delete_discussion_reply", "删除讨论回复"], ["delete_own_discussion_reply", "删除自己的讨论回复"]] },
  { title: "比赛", items: [["view_contest", "查看比赛"], ["view_contest_scoreboard", "查看比赛成绩表"], ["view_contest_hidden", "查看隐藏的比赛递交状态和成绩表"], ["create_contest", "创建比赛"], ["join_contest", "参加比赛"], ["modify_contest", "修改任意的比赛"], ["modify_own_contest", "修改自己的比赛"], ["view_all_contest", "查看所有比赛"]] },
  { title: "作业", items: [["view_homework", "查看作业"], ["view_homework_scoreboard", "查看作业成绩表"], ["create_homework", "创建作业"], ["modify_homework", "修改任意的作业"], ["modify_own_homework", "修改自己的作业"]] },
  { title: "训练", items: [["view_training", "查看训练计划"], ["create_training", "创建训练计划"], ["modify_training", "修改训练计划"], ["pin_training", "置顶训练计划"], ["modify_own_training", "修改自己的训练计划"]] },
  { title: "排名", items: [["view_ranking", "查看排名"]] },
  { title: "访问控制", items: [["debt_notice", "查看欠费提示"], ["join_application", "加域申请"], ["manage_role", "管理角色"], ["manage_user", "管理用户"], ["manage_permission", "管理权限"], ["manage_user_priv", "批量设置用户权限"]] },
  { title: "高级功能", items: [["view_tag", "查看用户标签"], ["manage_tag", "管理用户标签"], ["import_user", "批量注册账号"], ["view_import_user", "批量注册账号管理"], ["review_certification", "审核认证"], ["manage_countdown", "管理倒计时"], ["maintenance", "站点维护"], ["manage_domain", "创建与删除域"]] },
];
type Columns = "guest" | "member" | "root";

function PermissionMatrix({ domain, matrix, error, saved }: { domain: any; matrix: DomainPermissionMatrix; error: (s: string) => void; saved: (m: DomainPermissionMatrix) => void }) {
  // Only the three Hydro columns are editable here; extra roles are managed on
  // the 管理角色 page. Unsaved ticks stay local until 更新权限 is pressed.
  const [draft, setDraft] = useState<Record<Columns, Record<string, boolean>>>({ guest: { ...matrix.guest }, member: { ...matrix.member }, root: { ...matrix.root } });
  const [saving, setSaving] = useState(false);
  const toggle = (column: Columns, key: string) => setDraft((current) => ({ ...current, [column]: { ...current[column], [key]: !current[column][key] } }));
  const dirty = JSON.stringify(draft) !== JSON.stringify({ guest: matrix.guest, member: matrix.member, root: matrix.root });
  const columns: Array<[Columns, string]> = [["guest", "guest"], ["member", "default"], ["root", "root"]];
  async function submit() {
    setSaving(true);
    try {
      const next = await api.updateDomainPermissions(domain.id, draft);
      // Keep the drafts in sync with what the server accepted.
      setDraft({ guest: { ...next.guest }, member: { ...next.member }, root: { ...next.root } });
      saved(next);
      error("权限已更新");
    } catch (cause: any) { error(cause.message); } finally { setSaving(false); }
  }
  return <section className="control-card permission-card">
    <h1>{domain.name}: 权限</h1>
    <table className="permission-table">
      <thead><tr><th>权限</th>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
      <tbody>
        {PERMISSION_GROUPS.map((group) => (
          <Fragment key={group.title}>
            <tr className="permission-group"><td colSpan={4}>{group.title}</td></tr>
            {group.items.map(([key, label, hint]) => (
              <tr key={key}>
                <td title={hint}>{label}{hint && <small> · {hint}</small>}</td>
                {columns.map(([column]) => <td key={column}><input type="checkbox" aria-label={`${label} ${column}`} checked={Boolean(draft[column][key])} onChange={() => toggle(column, key)} /></td>)}
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
    <div className="permission-actions">
      <button className="primary" disabled={saving || !dirty} onClick={submit}>{saving ? "更新中..." : "更新权限"}</button>
      <button className="plain" disabled={saving || !dirty} onClick={() => setDraft({ guest: { ...matrix.guest }, member: { ...matrix.member }, root: { ...matrix.root } })}>取消</button>
    </div>
  </section>;
}

function RoleManager({ domain, matrix, error, saved }: { domain: any; matrix: DomainPermissionMatrix; error: (s: string) => void; saved: (m: DomainPermissionMatrix) => void }) {
  const [name, setName] = useState(""), [editing, setEditing] = useState<Record<number, Record<string, boolean>>>({}), [busy, setBusy] = useState(false);
  const roles = matrix.roles;
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try { saved(await api.createDomainRole(domain.id, { name, permissions: {} })); setName(""); error("角色已创建，可在下方勾选权限"); }
    catch (cause: any) { error(cause.message); } finally { setBusy(false); }
  }
  async function saveRole(role: DomainRole) {
    setBusy(true);
    try { saved(await api.updateDomainRole(domain.id, role.id, { name: role.name, permissions: editing[role.id] || role.permissions })); setEditing((current) => { const next = { ...current }; delete next[role.id]; return next; }); }
    catch (cause: any) { error(cause.message); } finally { setBusy(false); }
  }
  async function remove(role: DomainRole) {
    if (!confirm(`删除角色「${role.name}」？其成员会回到「成员」。`)) return;
    setBusy(true);
    try { saved(await api.deleteDomainRole(domain.id, role.id)); } catch (cause: any) { error(cause.message); } finally { setBusy(false); }
  }
  const renameRole = async (role: DomainRole, next: string) => {
    setBusy(true);
    try { saved(await api.updateDomainRole(domain.id, role.id, { name: next })); } catch (cause: any) { error(cause.message); } finally { setBusy(false); }
  };
  return <section className="control-card permission-card">
    <h1>管理角色</h1>
    <p className="create-side-hint">内置「成员」「管理员」在权限矩阵的 default 列统一设置；这里创建的角色继承 default 列，再叠加下方勾选的权限。</p>
    <form className="tag-create" onSubmit={create}><input required maxLength={24} placeholder="新角色名称" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary" disabled={busy}><Plus />新建角色</button></form>
    {roles.map((role) => {
      const draft = editing[role.id] || role.permissions;
      const dirty = Boolean(editing[role.id]) && JSON.stringify(editing[role.id]) !== JSON.stringify(role.permissions);
      return <article className="role-block" key={role.id}>
        <header><b>{role.name}</b><button className="plain" disabled={busy} onClick={() => { const next = prompt("新的角色名称", role.name); if (next && next.trim() && next.trim() !== role.name) void renameRole(role, next.trim()); }}>改名</button><button className="plain danger" disabled={busy} onClick={() => remove(role)}><Trash2 />删除</button></header>
        <div className="permission-grid">
          {PERMISSION_GROUPS.flatMap((group) => group.items).map(([key, label]) => <label key={key} className="check-row"><input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setEditing((current) => ({ ...current, [role.id]: { ...draft, [key]: event.target.checked } }))} />{label}</label>)}
        </div>
        <div className="permission-actions"><button className="primary" disabled={busy || !dirty} onClick={() => void saveRole(role)}>保存角色权限</button><button className="plain" disabled={busy || !dirty} onClick={() => setEditing((current) => { const next = { ...current }; delete next[role.id]; return next; })}>取消</button></div>
      </article>;
    })}
    {!roles.length && <div className="empty">还没有自定义角色。</div>}
  </section>;
}

function MemberPermissions({ domain, members, matrix, error, reload }: { domain: any; members: Array<{ user_id: number; username: string; role: string; overrides: Record<string, boolean> }>; matrix: DomainPermissionMatrix | null; error: (s: string) => void; reload: () => void }) {
  const [open, setOpen] = useState<number | null>(null), [draft, setDraft] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState(false);
  const expand = (member: { user_id: number; overrides: Record<string, boolean> }) => {
    if (open === member.user_id) { setOpen(null); return; }
    setOpen(member.user_id); setDraft({ ...member.overrides });
  };
  async function save(userId: number) {
    setBusy(true);
    try { await api.updateDomainMemberPermissions(domain.id, userId, draft); setOpen(null); reload(); error("已保存个人权限覆盖"); }
    catch (cause: any) { error(cause.message); } finally { setBusy(false); }
  }
  return <section className="control-card permission-card">
    <h1>批量设置用户权限</h1>
    <p className="create-side-hint">勾选的权限只对该成员生效，会覆盖其角色；取消全部勾选即恢复角色权限。{matrix ? "" : " 当前账号没有读取角色信息的权限，仍可设置个人覆盖。"}</p>
    <table className="permission-table">
      <thead><tr><th>UID</th><th>用户</th><th>角色</th><th>个人覆盖</th><th /></tr></thead>
      <tbody>
        {members.map((member) => (
          <Fragment key={member.user_id}>
            <tr>
              <td>{member.user_id}</td><td>{member.username}</td><td>{member.role}</td>
              <td>{Object.entries(member.overrides).filter(([, on]) => on).length} 项</td>
              <td><button className="plain" onClick={() => expand(member)}>{open === member.user_id ? "收起" : "设置"}</button></td>
            </tr>
            {open === member.user_id && (
              <tr><td colSpan={5}>
                <div className="permission-grid">
                  {PERMISSION_GROUPS.flatMap((group) => group.items).map(([key, label]) => <label key={key} className="check-row"><input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
                </div>
                <div className="permission-actions"><button className="primary" disabled={busy} onClick={() => void save(member.user_id)}>保存</button><button className="plain" disabled={busy} onClick={() => setOpen(null)}>取消</button></div>
              </td></tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
    {!members.length && <div className="empty">本域还没有成员。</div>}
  </section>;
}
