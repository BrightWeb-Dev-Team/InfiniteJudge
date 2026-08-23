import { useEffect, useState } from "react";
import {
  Activity,
  Database,
  Play,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { api, Problem, SiteConfig, User } from "./api";
import { AdminPage } from "./admin";
import { SettingsPage } from "./settings";

type View =
  "dashboard" | "scripts" | "import" | "users" | "content" | "settings";
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
    ...(user.role === "root" ? [["users", "用户权限", Users], ["settings", "配置管理", Settings2]] as Array<[View, string, any]> : []),
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
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view === "settings" && (
          <SettingsPage error={error} changed={changed} />
        )}
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
