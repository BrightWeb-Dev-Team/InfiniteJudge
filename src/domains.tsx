import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Plus, Save, ShieldCheck, Users, X } from "lucide-react";
import { api, User } from "./api";
type View = "dashboard" | "edit" | "join" | "members" | "applications";
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
    [name, setName] = useState("");
  const load = () =>
    api
      .domains()
      .then(setDomains)
      .catch((e) => error(e.message));
  const open = async (id: number) => {
    try {
      setSelected(await api.domain(id));
      setView("dashboard");
    } catch (e: any) {
      error(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const refresh = () => selected && open(selected.id);
  if (!selected)
    return (
      <section className="page">
        <div className="page-title discussion-title">
          <div>
            <span className="kicker">WORKSPACES</span>
            <h1>域</h1>
            <p>为团队、学校或训练组织独立成员与权限。</p>
          </div>
          {user.role === "admin" && (
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
      await api.updateDomain(selected.id, selected);
      changed?.();
      refresh();
    } catch (e: any) {
      error(e.message);
    }
  };
  const items: Array<[View, string]> = [
    ["dashboard", "管理域"],
    ["edit", "编辑域资料"],
    ["join", "加域设置"],
    ["members", "管理用户"],
    ["applications", "加域申请"],
  ];
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
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selected.announcement || "暂无公告"}
                </ReactMarkdown>
              </div>
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
              />
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
                          onChange={async (e) => {
                            await api.updateDomainMember(
                              selected.id,
                              m.user_id,
                              e.target.value,
                            );
                            refresh();
                          }}
                        >
                          <option value="member">成员</option>
                          <option value="manager">管理员</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
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
