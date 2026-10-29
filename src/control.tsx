import { useEffect, useState } from "react";
import {
  Activity,
  Database,
  Play,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  KeyRound,
  RefreshCw,
  AlertTriangle,
  Ban,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import { api, Problem, SiteConfig, User } from "./api";
import { AdminPage } from "./admin";
import { SettingsPage } from "./settings";

type View =
  "dashboard" | "scripts" | "import" | "users" | "content" | "settings" | "license" | "reports";
export function ControlPanel({
  user,
  problems,
  reload,
  error,
  changed,
  createProblem,
}: {
  user: User;
  problems: Problem[];
  reload: () => void;
  error: (s: string) => void;
  changed: (v: SiteConfig) => void;
  createProblem?: () => void;
}) {
  const [view, setView] = useState<View>("dashboard"),
    [health, setHealth] = useState<any>(null),
    [users, setUsers] = useState<any[]>([]),
    [importText, setImportText] = useState("");
  const loadHealth = () =>
    api
      .health()
      .then(setHealth)
      .catch((e) => error(e.message));
  const loadUsers = () =>
    api
      .adminUsers()
      .then(setUsers)
      .catch((e) => error(e.message));
  useEffect(() => {
    void loadHealth();
  }, []);
  useEffect(() => {
    if (view === "users") void loadUsers();
  }, [view]);
  const items: Array<[View, string, any]> = [
    ["dashboard", "控制面板", Activity],
    ["scripts", "脚本管理", Play],
    ["import", "导入用户", Upload],
    ...(user.role === "root" ? [["users", "用户权限", Users], ["reports", "危险代码", AlertTriangle], ["settings", "配置管理", Settings2], ["license", "授权管理", KeyRound]] as Array<[View, string, any]> : []),
    ...(user.role === "admin" ? [["reports", "危险代码", AlertTriangle]] as Array<[View, string, any]> : []),
  ];
  return (
    <section className="page control-layout">
      <div className="control-content">
        {view === "dashboard" && (
          <>
            <section className="control-card">
              <h1>消息</h1>
              <div className="notice-line ok">
                Connection opened. API 和数据库已连接。
              </div>
              <div className="notice-line warn">
                评测机：{health?.judge?.backend || "读取中"} · 待处理{" "}
                {health?.queue?.pending ?? "-"}
              </div>
            </section>
            <section className="control-card">
              <h1>系统信息</h1>
              <div className="metric-grid">
                <b>
                  {health?.queue?.total ?? 0}
                  <span>评测记录</span>
                </b>
                <b>
                  {problems.length}
                  <span>题目</span>
                </b>
                <b>
                  {health?.plugins?.length ?? 0}
                  <span>已加载插件</span>
                </b>
                <b>
                  {health?.database || "-"}
                  <span>数据库</span>
                </b>
              </div>
            </section>
            <section className="control-card ai-policy-tool">
              <div>
                <ShieldCheck />
                <div>
                  <h1>AI 使用规则</h1>
                  <p>为当前管理域的全部题目追加公开声明：禁止使用生成式 AI，并说明风险筛查、人工复核和申诉机制。</p>
                </div>
              </div>
              <button className="primary" onClick={async () => {
                if (!confirm("确定为当前管理域的全部题目追加 AI 使用规则吗？已包含该声明的题目不会重复添加。")) return;
                try {
                  const result = await api.appendAiPolicy();
                  alert(result.updated ? `已为 ${result.updated} 道题目追加 AI 使用规则` : "所有题目均已包含 AI 使用规则");
                  reload();
                } catch (e: any) {
                  error(e.message);
                }
              }}><ShieldCheck />一键追加到全部题目</button>
            </section>
          </>
        )}
        {view === "content" && (
          <section className="control-card">
            <h1>内容管理</h1>
            <AdminPage problems={problems} reload={reload} error={error} createProblem={createProblem} />
          </section>
        )}
        {view === "scripts" && (
          <section className="control-card">
            <h1>脚本</h1>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>说明</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["cleanSessions", "清理过期会话"],
                  ["recalculateProblems", "重新计算题目提交和 AC 统计"],
                ].map((x) => (
                  <tr>
                    <td className="mono">{x[0]}</td>
                    <td>{x[1]}</td>
                    <td>
                      <button
                        className="text-btn"
                        onClick={async () => {
                          try {
                            const r = await api.maintenance(x[0]);
                            alert(`已完成，影响 ${r.affected} 条记录`);
                            loadHealth();
                          } catch (e: any) {
                            error(e.message);
                          }
                        }}
                      >
                        <Play />
                        运行
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view === "import" && (
          <section className="control-card">
            <h1>导入用户</h1>
            <p className="muted">
              每行格式：用户名,密码。预览会在正式提交前检查格式。
            </p>
            <textarea
              className="import-area"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="import-actions">
              <button
                className="plain"
                onClick={() =>
                  alert(
                    `检测到 ${importText.split("\n").filter(Boolean).length} 行`,
                  )
                }
              >
                预览
              </button>
              <button
                className="primary"
                onClick={async () => {
                  const rows = importText
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => {
                      const [username, ...rest] = line.split(",");
                      return {
                        username: username.trim(),
                        password: rest.join(",").trim(),
                      };
                    });
                  try {
                    const result = await api.importUsers(rows);
                    alert(
                      `已创建 ${result.created.length} 个用户，失败 ${result.failed.length} 个`,
                    );
                    if (!result.failed.length) setImportText("");
                  } catch (e: any) {
                    error(e.message);
                  }
                }}
              >
                提交导入
              </button>
            </div>
          </section>
        )}
        {view === "users" && (
          <section className="control-card">
            <h1>用户权限</h1>
            <table>
              <thead>
                <tr>
                  <th>UID</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isBanned = u.banned_until > Date.now();
                  return (
                    <tr key={u.id} className={isBanned ? "banned-row" : ""}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>
                        {isBanned ? (
                          <span className="ban-badge" title={u.ban_reason || "已封禁"}>
                            <Ban size={14} />
                            {u.banned_until > 0 && u.banned_until < Infinity
                              ? `封禁至 ${new Date(u.banned_until).toLocaleString()}`
                              : "永久封禁"}
                          </span>
                        ) : (
                          <span className="active-badge">正常</span>
                        )}
                      </td>
                      <td className="user-actions">
                        <select
                          value={u.role}
                          onChange={async (e) => {
                            try {
                              await api.updateUserRole(u.id, e.target.value);
                              loadUsers();
                            } catch (err: any) {
                              error(err.message);
                            }
                          }}
                        >
                          <option value="user">普通用户</option>
                          <option value="admin">管理员</option>
                          <option value="root">Root</option>
                        </select>
                        {isBanned ? (
                          <button
                            className="text-btn unban-btn"
                            onClick={async () => {
                              if (!confirm(`确定解封用户 ${u.username}？`)) return;
                              try {
                                await api.unbanUser(u.id);
                                loadUsers();
                              } catch (err: any) {
                                error(err.message);
                              }
                            }}
                          >
                            <CheckCircle size={14} /> 解封
                          </button>
                        ) : (
                          <button
                            className="text-btn ban-btn"
                            onClick={async () => {
                              const reason = prompt(`封禁用户 ${u.username}，请输入原因：`);
                              if (reason === null) return;
                              const duration = prompt("封禁时长（小时，0 为永久）：", "24");
                              if (duration === null) return;
                              const hours = Number(duration) || 0;
                              try {
                                await api.banUser(u.id, hours * 3600 * 1000, reason);
                                loadUsers();
                              } catch (err: any) {
                                error(err.message);
                              }
                            }}
                          >
                            <Ban size={14} /> 封禁
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
        {view === "reports" && <CodeReportsView error={error} userRole={user.role} />}
        {view === "settings" && (
          <SettingsPage error={error} changed={changed} />
        )}
        {view === "license" && <LicenseSettings error={error} />}
      </div>
      <aside className="control-nav">
        <div className="control-nav-title">
          <ShieldCheck />
          管理
        </div>
        {items.map(([id, label, Icon]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </aside>
    </section>
  );
}

function LicenseSettings({ error }: { error: (message: string) => void }) {
  const [form, setForm] = useState({ serverUrl: "https://key.brightweb.top", key: "" });
  const [status, setStatus] = useState<{ keyConfigured: boolean; keyMasked: string; tier: "community" | "professional" } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { try { const value = await api.licenseSettings(); setForm((current) => ({ ...current, serverUrl: value.serverUrl })); setStatus(value); } catch (cause: any) { error(cause.message); } };
  useEffect(() => { void load(); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await api.updateLicenseSettings({ serverUrl: form.serverUrl, key: form.key || undefined }); setForm((current) => ({ ...current, key: "" })); await load(); error("授权配置已保存"); } catch (cause: any) { error(cause.message); } finally { setBusy(false); } };
  const clear = async () => { if (!confirm("清除本站 Professional 授权？")) return; setBusy(true); try { await api.updateLicenseSettings({ serverUrl: form.serverUrl, clearKey: true }); await load(); error("授权 key 已清除"); } catch (cause: any) { error(cause.message); } finally { setBusy(false); } };
  return <section className="control-card license-settings-card"><div className="license-settings-heading"><div><span className="kicker">LICENSE</span><h1>授权管理</h1><p>配置本站连接的官方授权平台和 License Key。Key 只保存在服务端，不会回显完整内容。</p></div><KeyRound /></div><div className={`license-tier-badge ${status?.tier === "professional" ? "professional" : "community"}`}><span>{status?.tier === "professional" ? "Professional" : "Community"}</span><small>{status?.keyConfigured ? `当前授权：${status.keyMasked}` : "未配置授权 key，使用 Community"}</small></div><form className="license-settings-form" onSubmit={save}><label className="field"><span>授权服务地址</span><input type="url" required value={form.serverUrl} onChange={(event) => setForm({ ...form, serverUrl: event.target.value })} placeholder="https://key.brightweb.top" /><small>官方地址：<code>https://key.brightweb.top</code></small></label><label className="field"><span>{status?.keyConfigured ? "替换 License Key" : "License Key"}</span><input type="password" value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} placeholder={status?.keyConfigured ? "留空以保持当前 key" : "IJ-XXXXX-XXXXX-..."} autoComplete="new-password" /></label><div className="license-actions"><button className="primary" disabled={busy}><KeyRound />{busy ? "保存中..." : "保存并验证"}</button>{status?.keyConfigured && <button type="button" className="plain" disabled={busy} onClick={clear}><RefreshCw />清除授权</button>}</div></form></section>;
}

function CodeReportsView({ error, userRole }: { error: (message: string) => void; userRole: string }) {
  const [status, setStatus] = useState("pending");
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = () =>
    api
      .codeReports(status, 100, 0)
      .then((data) => {
        setReports(data.reports);
        setTotal(data.total);
      })
      .catch((e) => error(e.message));

  useEffect(() => {
    void load();
  }, [status]);

  const handleReview = async (id: number, newStatus: string) => {
    const note = newStatus === "dismissed" ? prompt("备注（可选）：") || "" : "";
    try {
      await api.updateCodeReport(id, newStatus, note);
      load();
    } catch (e: any) {
      error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此报告？")) return;
    try {
      await api.deleteCodeReport(id);
      load();
    } catch (e: any) {
      error(e.message);
    }
  };

  const severityLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };
  const severityClass: Record<string, string> = { high: "severity-high", medium: "severity-medium", low: "severity-low" };

  return (
    <section className="control-card">
      <h1>
        <AlertTriangle size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
        危险代码上报
        <span className="muted" style={{ marginLeft: 12, fontSize: 14 }}>
          共 {total} 条
        </span>
      </h1>
      <div className="report-filters">
        {["pending", "reviewed", "dismissed"].map((s) => (
          <button
            key={s}
            className={status === s ? "active" : ""}
            onClick={() => setStatus(s)}
          >
            {s === "pending" ? "待审核" : s === "reviewed" ? "已审核" : "已忽略"}
          </button>
        ))}
      </div>
      {reports.length === 0 ? (
        <p className="muted" style={{ padding: "20px 0", textAlign: "center" }}>
          暂无{status === "pending" ? "待审核" : status === "reviewed" ? "已审核" : "已忽略"}的危险代码报告
        </p>
      ) : (
        <div className="report-list">
          {reports.map((r) => (
            <div key={r.id} className={`report-item ${r.status}`}>
              <div
                className="report-header"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="report-info">
                  <span className="report-user">{r.username}</span>
                  <span className="report-problem">{r.problem_title || r.problem_id}</span>
                  <span className="report-lang">{r.language}</span>
                  <span className="report-time">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="report-matches-summary">
                  {r.matches.slice(0, 3).map((m: any, i: number) => (
                    <span key={i} className={`severity-tag ${severityClass[m.severity]}`}>
                      {m.label}
                    </span>
                  ))}
                  {r.matches.length > 3 && (
                    <span className="severity-tag">+{r.matches.length - 3}</span>
                  )}
                </div>
                <Eye size={16} className={`report-expand-icon ${expanded === r.id ? "expanded" : ""}`} />
              </div>
              {expanded === r.id && (
                <div className="report-detail">
                  <div className="report-all-matches">
                    <h4>检测到的危险模式：</h4>
                    {r.matches.map((m: any, i: number) => (
                      <div key={i} className="match-item">
                        <span className={`severity-tag ${severityClass[m.severity]}`}>
                          {severityLabel[m.severity]}
                        </span>
                        <span>{m.label}</span>
                      </div>
                    ))}
                  </div>
                  {r.source && (
                    <div className="report-source">
                      <h4>代码片段：</h4>
                      <pre><code>{r.source.slice(0, 2000)}</code></pre>
                    </div>
                  )}
                  {r.review_note && (
                    <div className="report-note">
                      <h4>审核备注：</h4>
                      <p>{r.review_note}</p>
                    </div>
                  )}
                  <div className="report-actions">
                    {r.status === "pending" && (
                      <>
                        <button
                          className="primary"
                          onClick={() => handleReview(r.id, "reviewed")}
                        >
                          <CheckCircle size={14} /> 标记已审核
                        </button>
                        <button
                          className="plain"
                          onClick={() => handleReview(r.id, "dismissed")}
                        >
                          <XCircle size={14} /> 忽略
                        </button>
                      </>
                    )}
                    {r.status !== "pending" && (
                      <button
                        className="plain"
                        onClick={() => handleReview(r.id, "pending")}
                      >
                        <RefreshCw size={14} /> 重新打开
                      </button>
                    )}
                    <button
                      className="text-btn danger"
                      onClick={() => handleDelete(r.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function BanManager({ user, onClose, error }: { user: User; onClose: () => void; error: (message: string) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadUsers = () =>
    api
      .adminUsers()
      .then(setUsers)
      .catch((e) => error(e.message));

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleBan = async (target: any) => {
    const reason = prompt(`封禁用户 ${target.username}，请输入原因：`);
    if (reason === null) return;
    const duration = prompt("封禁时长（小时，0 为永久）：", "24");
    if (duration === null) return;
    const hours = Number(duration) || 0;
    setBusy(true);
    try {
      await api.banUser(target.id, hours * 3600 * 1000, reason);
      loadUsers();
    } catch (e: any) {
      error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnban = async (target: any) => {
    if (!confirm(`确定解封用户 ${target.username}？`)) return;
    setBusy(true);
    try {
      await api.unbanUser(target.id);
      loadUsers();
    } catch (e: any) {
      error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ban-manager-modal">
        <button className="modal-close" onClick={onClose}>
          <XCircle />
        </button>
        <h2>
          <Ban size={20} style={{ verticalAlign: "middle", marginRight: 8 }} />
          封禁管理
        </h2>
        <p className="muted">管理用户封禁状态，封禁后用户所有设备将被强制退出登录。</p>
        <div className="ban-user-list">
          {users.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", padding: "20px 0" }}>
              加载中...
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>UID</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isBanned = u.banned_until > Date.now();
                  const isRoot = u.role === "root";
                  return (
                    <tr key={u.id} className={isBanned ? "banned-row" : ""}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>
                        {isBanned ? (
                          <span className="ban-badge" title={u.ban_reason || "已封禁"}>
                            <Ban size={14} />
                            {u.banned_until > 0
                              ? `封禁至 ${new Date(u.banned_until).toLocaleString()}`
                              : "永久封禁"}
                          </span>
                        ) : (
                          <span className="active-badge">正常</span>
                        )}
                      </td>
                      <td className="user-actions">
                        {isRoot ? (
                          <span className="muted" style={{ fontSize: ".8rem" }}>Root 不可操作</span>
                        ) : isBanned ? (
                          <button
                            className="text-btn unban-btn"
                            disabled={busy}
                            onClick={() => handleUnban(u)}
                          >
                            <CheckCircle size={14} /> 解封
                          </button>
                        ) : (
                          <button
                            className="text-btn ban-btn"
                            disabled={busy}
                            onClick={() => handleBan(u)}
                          >
                            <Ban size={14} /> 封禁
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
