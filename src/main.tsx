import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Code2,
  Database,
  Command,
  Flame,
  Home,
  Menu,
  Moon,
  Search,
  Send,
  Sun,
  Trophy,
  Users,
  X,
  MessageSquare,
  LogIn,
  Filter,
  ArrowLeft,
  LogOut,
  Settings2,
  ShieldCheck,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserCircle,
  Mail,
  Wrench,
  NotebookText,
  FolderOpen,
} from "lucide-react";
import {
  api,
  CountdownConfig,
  Problem,
  SiteConfig,
  Submission,
  User,
} from "./api";
import { AdminPage, emptyProblem } from "./admin";
import { ControlPanel } from "./control";
import { DomainsPage } from "./domains";
import { AccountPage, BlogPage, FilesPage, MessagesPage, ProfilePage } from "./account";
import "./style.css";
type Page =
  | "home"
  | "problems"
  | "contests"
  | "training"
  | "homework"
  | "ranking"
  | "records"
  | "discuss"
  | "problem"
  | "problem-create"
  | "settings"
  | "queue"
  | "status"
  | "compatibility"
  | "domains"
  | "account"
  | "messages"
  | "blog"
  | "files"
  | "profile";
const pagePaths: Record<Exclude<Page, "problem" | "profile">, string> = {
  home: "/",
  problems: "/problems",
  "problem-create": "/problems/create",
  contests: "/contests",
  training: "/training",
  homework: "/homework",
  ranking: "/ranking",
  records: "/records",
  discuss: "/discussions",
  settings: "/settings",
  queue: "/queue",
  status: "/status",
  compatibility: "/compatibility",
  domains: "/domains",
  account: "/account",
  messages: "/messages",
  blog: "/blog",
  files: "/files",
};
function routeFromPath(): { page: Page; id?: string } {
  const path = location.pathname.replace(/\/$/, "") || "/";
  if (path === "/problems/create") return { page: "problem-create" };
  const match = path.match(/^\/problems\/([^/]+)$/);
  if (match) return { page: "problem", id: decodeURIComponent(match[1]) };
  const profile = path.match(/^\/users\/(\d+)$/);
  if (profile) return { page: "profile", id: profile[1] };
  if (/^\/contests\/\d+$/.test(path)) return { page: "contests" };
  if (/^\/discussions\/\d+$/.test(path)) return { page: "discuss" };
  return {
    page:
      (
        {
          "/": "home",
          "/problems": "problems",
          "/contests": "contests",
          "/training": "training",
          "/homework": "homework",
          "/ranking": "ranking",
          "/records": "records",
          "/discussions": "discuss",
          "/settings": "settings",
          "/queue": "queue",
          "/status": "status",
          "/compatibility": "compatibility",
          "/domains": "domains",
          "/account": "account",
          "/messages": "messages",
          "/blog": "blog",
          "/files": "files",
        } as any
      )[path] || "home",
  };
}
const nav = [
  ["home", "首页", Home],
  ["problems", "题库", BookOpen],
  ["training", "训练", BookOpen],
  ["contests", "比赛", Trophy],
  ["homework", "作业", Code2],
  ["discuss", "讨论", MessageSquare],
  ["records", "评测记录", Activity],
  ["ranking", "排名", Users],
] as const;
const diffClass = (d: string) =>
  "diff " +
  ({ 入门: "mint", 简单: "green", 中等: "amber", 困难: "red" }[d] || "");
const starter = {
  cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // 在这里开始你的解答\n    return 0;\n}",
  python: "# 在这里开始你的解答\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        // 在这里开始你的解答\n    }\n}",
};
function Markdown({ children }: { children?: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
function ProblemCreatePage({
  error,
  cancel,
  done,
}: {
  error: (message: string) => void;
  cancel: () => void;
  done: (problem: Problem) => void;
}) {
  const [form, setForm] = useState<any>({ ...emptyProblem }),
    [saving, setSaving] = useState(false);
  const field = (key: string, value: any) =>
    setForm((current: any) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const problem = await api.createProblem({
        ...form,
        tags: String(form.tags)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        testcases: JSON.parse(form.testcases),
      });
      done(problem);
    } catch (cause: any) {
      error(cause.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="page problem-create-page">
      <div className="page-title create-page-title">
        <div>
          <span className="kicker">PROBLEM AUTHORING</span>
          <h1>创建题目</h1>
          <p>编辑题面、运行限制与测试数据。</p>
        </div>
        <button className="plain" type="button" onClick={cancel}>
          <ArrowLeft /> 返回题库
        </button>
      </div>
      <form className="problem-create-form" onSubmit={submit}>
        <div className="create-section">
          <h2>基本信息</h2>
          <div className="form-grid">
            <CreateField label="题号">
              <input required value={form.id} onChange={(e) => field("id", e.target.value)} placeholder="P1001" />
            </CreateField>
            <CreateField label="标题">
              <input required value={form.title} onChange={(e) => field("title", e.target.value)} placeholder="题目标题" />
            </CreateField>
            <CreateField label="难度">
              <select value={form.difficulty} onChange={(e) => field("difficulty", e.target.value)}>
                {["入门", "简单", "中等", "困难"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </CreateField>
            <CreateField label="标签（逗号分隔）">
              <input value={form.tags} onChange={(e) => field("tags", e.target.value)} placeholder="基础, 数学" />
            </CreateField>
            <CreateField label="时间限制 ms">
              <input required min="1" type="number" value={form.time_limit} onChange={(e) => field("time_limit", Number(e.target.value))} />
            </CreateField>
            <CreateField label="内存限制 MB">
              <input required min="1" type="number" value={form.memory_limit} onChange={(e) => field("memory_limit", Number(e.target.value))} />
            </CreateField>
          </div>
        </div>
        <div className="create-editor-grid">
          <div className="create-section statement-editor">
            <h2>题面内容</h2>
            {[
              ["description", "题目描述（Markdown）", 14],
              ["input_format", "输入格式（Markdown）", 7],
              ["output_format", "输出格式（Markdown）", 7],
              ["sample_input", "样例输入", 5],
              ["sample_output", "样例输出", 5],
            ].map(([key, label, rows]) => (
              <CreateField key={String(key)} label={String(label)}>
                <textarea rows={Number(rows)} value={form[String(key)]} onChange={(e) => field(String(key), e.target.value)} />
              </CreateField>
            ))}
          </div>
          <aside className="create-side">
            <div className="create-section preview-pane">
              <h2>Markdown 预览</h2>
              <Markdown>{form.description || "在左侧输入题目描述后，这里会显示预览。"}</Markdown>
            </div>
            <div className="create-section">
              <h2>测试数据</h2>
              <CreateField label="测试点 JSON">
                <textarea className="testcase-editor" rows={10} value={form.testcases} onChange={(e) => field("testcases", e.target.value)} />
              </CreateField>
            </div>
          </aside>
        </div>
        <div className="create-actions">
          <button type="button" className="plain" onClick={cancel}>取消</button>
          <button className="primary" disabled={saving}>{saving ? "正在创建..." : "创建题目"}</button>
        </div>
      </form>
    </section>
  );
}
function CreateField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function SetupPage({ done }: { done: (result: { token: string; user: User }, site: SiteConfig) => void }) {
  const [form, setForm] = useState<any>({ name: "Infinite Judge", logo: "", serviceUrl: location.origin + "/", username: "admin", password: "", emailVerification: false, smtp: { host: "", port: 465, secure: true, user: "", pass: "", from: "" } }),
    [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const update = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await api.setup(form); done(result, { name: form.name, logo: form.logo, serviceUrl: form.serviceUrl }); }
    catch (cause: any) { setMessage(cause.message); } finally { setBusy(false); }
  }
  return <main className="setup-page">
    <form className="setup-shell" onSubmit={submit}>
      <div className="setup-intro"><span className="brand-mark"><Command /></span><span className="kicker">FIRST RUN</span><h1>初始化 Infinite Judge</h1><p>完成站点品牌与管理员配置。邮件验证可以稍后在系统设置中开启。</p></div>
      <section className="setup-section"><h2>站点品牌</h2><div className="form-grid">
        <CreateField label="品牌名"><input required value={form.name} onChange={(e) => update("name", e.target.value)} /></CreateField>
        <CreateField label="服务地址"><input required type="url" value={form.serviceUrl} onChange={(e) => update("serviceUrl", e.target.value)} /></CreateField>
      </div><CreateField label="Logo URL（可留空）"><input type="url" value={form.logo} onChange={(e) => update("logo", e.target.value)} placeholder="未配置时使用默认图标" /></CreateField></section>
      <section className="setup-section"><h2>管理员账号</h2><div className="form-grid">
        <CreateField label="用户名"><input required value={form.username} onChange={(e) => update("username", e.target.value)} /></CreateField>
        <CreateField label="密码"><input required minLength={8} type="password" value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="至少 8 位" /></CreateField>
      </div></section>
      <section className="setup-section"><label className="setup-toggle"><input type="checkbox" checked={form.emailVerification} onChange={(e) => update("emailVerification", e.target.checked)} /><span><b>启用注册邮件验证</b><small>默认关闭。不配置时直接完成安装并进入系统。</small></span></label>
        {form.emailVerification && <div className="smtp-fields"><div className="form-grid"><CreateField label="SMTP 主机"><input required value={form.smtp.host} onChange={(e) => update("smtp", { ...form.smtp, host: e.target.value })} /></CreateField><CreateField label="端口"><input required type="number" value={form.smtp.port} onChange={(e) => update("smtp", { ...form.smtp, port: Number(e.target.value) })} /></CreateField><CreateField label="用户名"><input value={form.smtp.user} onChange={(e) => update("smtp", { ...form.smtp, user: e.target.value })} /></CreateField><CreateField label="密码"><input type="password" value={form.smtp.pass} onChange={(e) => update("smtp", { ...form.smtp, pass: e.target.value })} /></CreateField></div><CreateField label="发件人"><input required value={form.smtp.from} onChange={(e) => update("smtp", { ...form.smtp, from: e.target.value })} placeholder="Infinite Judge <no-reply@example.com>" /></CreateField></div>}
      </section>
      {message && <div className="form-error">{message}</div>}
      <button className="primary setup-submit" disabled={busy}>{busy ? "正在初始化..." : "完成安装并进入系统"}<ChevronRight /></button>
    </form>
  </main>;
}
function App() {
  const initialRoute = routeFromPath();
  const [setup, setSetup] = useState<boolean | null>(null),
    [page, setPage] = useState<Page>(initialRoute.page),
    [dark, setDark] = useState(localStorage.theme === "dark"),
    [mobile, setMobile] = useState(false),
    [problems, setProblems] = useState<Problem[]>([]),
    [selected, setSelected] = useState<Problem | null>(null),
    [profileId, setProfileId] = useState(Number(initialRoute.id || 0)),
    [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [userMenu, setUserMenu] = useState(false),
    [unread, setUnread] = useState(0),
    [adminVerifyOpen, setAdminVerifyOpen] = useState(false),
    [adminTarget, setAdminTarget] = useState<"settings" | "domains">(
      initialRoute.page === "domains" ? "domains" : "settings",
    ),
    [adminVerified, setAdminVerified] = useState(
      Number(sessionStorage.getItem("ij-admin-verification-expires")) >
        Date.now(),
    ),
    [communityVersion, setCommunityVersion] = useState("..."),
    [error, setError] = useState(""),
    [site, setSite] = useState<SiteConfig>({
      name: "Infinte Judge",
      serviceUrl: location.origin + "/",
      logo: "",
      announcement: "",
    });
  const load = () =>
    api
      .problems()
      .then(setProblems)
      .catch((e) => setError(e.message));
  useEffect(() => {
    api.setupStatus().then((value) => setSetup(!value.installed)).catch(() => setSetup(false));
    api.version().then((value) => setCommunityVersion(value.version)).catch(() => {});
    load();
    api
      .site()
      .then((v) => {
        setSite(v);
        document.title = v.name;
      })
      .catch(() => {});
    if (initialRoute.page === "problem" && initialRoute.id)
      api
        .problem(initialRoute.id)
        .then(setSelected)
        .catch((e) => setError(e.message));
    if (localStorage.getItem("ij-token"))
      api
        .me()
        .then(async (value) => {
          setUser(value);
          if (["settings", "domains"].includes(initialRoute.page) && value.role === "admin") {
            let valid = adminVerified;
            if (valid) {
              try { await api.adminVerification(); }
              catch {
                valid = false;
                sessionStorage.removeItem("ij-admin-verification");
                sessionStorage.removeItem("ij-admin-verification-expires");
                setAdminVerified(false);
              }
            }
            if (!valid) {
            setAdminTarget(
              initialRoute.page === "domains" ? "domains" : "settings",
            );
            setAdminVerifyOpen(true);
            }
          }
        })
        .catch(() => localStorage.removeItem("ij-token"));
  }, []);
  useEffect(() => {
    const handler = () => {
      const route = routeFromPath();
      setPage(route.page);
      if (route.page === "profile" && route.id) setProfileId(Number(route.id));
      if (route.page === "problem" && route.id)
        api
          .problem(route.id)
          .then(setSelected)
          .catch((e) => setError(e.message));
    };
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    if (!user) return setUnread(0);
    api.messages().then((items) => setUnread(items.filter((item) => !item.read_at).length)).catch(() => {});
  }, [user, page]);
  useEffect(() => {
    if (user?.role !== "admin" || !["settings", "domains"].includes(page))
      return;
    const expires = Number(
        sessionStorage.getItem("ij-admin-verification-expires"),
      ),
      delay = expires - Date.now();
    if (!adminVerified || delay <= 0) {
      setAdminVerified(false);
      setAdminTarget(page === "domains" ? "domains" : "settings");
      setAdminVerifyOpen(true);
      return;
    }
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem("ij-admin-verification");
      sessionStorage.removeItem("ij-admin-verification-expires");
      setAdminVerified(false);
      setAdminTarget(page === "domains" ? "domains" : "settings");
      setAdminVerifyOpen(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [page, user, adminVerified]);
  const go = async (p: Exclude<Page, "problem" | "profile">) => {
    if (
      ["settings", "domains"].includes(p) &&
      user?.role === "admin"
    ) {
      let verified = adminVerified;
      if (verified) {
        try {
          await api.adminVerification();
        } catch {
          verified = false;
          sessionStorage.removeItem("ij-admin-verification");
          sessionStorage.removeItem("ij-admin-verification-expires");
          setAdminVerified(false);
        }
      }
      if (!verified) {
        setAdminTarget(p === "domains" ? "domains" : "settings");
        setAdminVerifyOpen(true);
        setMobile(false);
        return;
      }
    }
    history.pushState({}, "", pagePaths[p]);
    setPage(p);
    setMobile(false);
    scrollTo(0, 0);
  };
  const openProfile = (id: number) => {
    history.pushState({}, "", `/users/${id}`);
    setProfileId(id);
    setPage("profile");
    setUserMenu(false);
    setMobile(false);
    scrollTo(0, 0);
  };
  const open = async (p: Problem) => {
    try {
      setSelected(await api.problem(p.id));
      history.pushState({}, "", `/problems/${encodeURIComponent(p.id)}`);
      setPage("problem");
      setMobile(false);
      scrollTo(0, 0);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const logout = () => {
    localStorage.removeItem("ij-token");
    sessionStorage.removeItem("ij-admin-verification");
    sessionStorage.removeItem("ij-admin-verification-expires");
    setAdminVerified(false);
    setUser(null);
    if (page === "settings") go("home");
  };
  if (setup === null)
    return <div className="setup-loading">正在检查系统状态...</div>;
  if (setup)
    return (
      <SetupPage
        done={(result, configuredSite) => {
          localStorage.setItem("ij-token", result.token);
          setUser(result.user);
          setSite(configuredSite);
          setSetup(false);
          load();
        }}
      />
    );
  return (
    <>
      <header>
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">
            {site.logo ? <img src={site.logo} alt="" /> : <Command />}
          </span>
          <span>{site.name}</span>
        </button>
        <nav className={mobile ? "open" : ""}>
          {nav.map(([id, label, Icon]) => (
            <button
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
              key={id}
            >
              <Icon />
              {label}
            </button>
          ))}
          {user?.role === "admin" && (
            <button
              className={page === "domains" ? "active" : ""}
              onClick={() => go("domains")}
            >
              <Users />
              管理域
            </button>
          )}
          {user?.role === "admin" && (
            <button
              className={page === "settings" ? "active" : ""}
              onClick={() => go("settings")}
            >
              <SlidersHorizontal />
              控制面板
            </button>
          )}
        </nav>
        <div className="head-actions">
          <button
            className="icon"
            title="切换主题"
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          {user ? (
            <div className="user-menu-wrap">
              <button className="user-btn" onClick={() => setUserMenu(!userMenu)}>
                <span>{user.avatar ? <img src={user.avatar} /> : user.username[0].toUpperCase()}</span>{user.username}<ChevronRight className={userMenu ? "rotated" : ""} />
              </button>
              {userMenu && <div className="user-dropdown">
                <button onClick={() => openProfile(user.id)}><UserCircle />我的资料</button>
                <button onClick={() => { go("messages"); setUserMenu(false); }}><Mail />站内消息{unread > 0 && <b>{unread}</b>}</button>
                <div className="dropdown-separator" />
                <button onClick={() => { go("domains"); setUserMenu(false); }}><Database />我的域</button>
                <button onClick={() => { go("files"); setUserMenu(false); }}><FolderOpen />我的文件</button>
                <button onClick={() => { go("account"); setUserMenu(false); }}><Wrench />账户设置</button>
                <button onClick={() => { go("blog"); setUserMenu(false); }}><NotebookText />博客</button>
                <div className="dropdown-separator" />
                <button onClick={logout}><LogOut />登出</button>
              </div>}
            </div>
          ) : (
            <button className="login" onClick={() => setAuthOpen(true)}>
              <LogIn />
              登录
            </button>
          )}
          <button className="icon menu" onClick={() => setMobile(!mobile)}>
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {error && (
        <div className="toast" onClick={() => setError("")}>
          {error}
          <X />
        </div>
      )}
      <main>
        {page === "home" && (
          <HomePage
            problems={problems}
            announcement={site.announcement}
            user={user}
            go={go}
            open={open}
            error={setError}
          />
        )}{" "}
        {page === "problems" && (
          <ProblemsPage
            problems={problems}
            open={open}
            user={user}
            reload={load}
            error={setError}
            create={() => go("problem-create")}
          />
        )}{" "}
        {page === "problem-create" && user?.role === "admin" && (
          <ProblemCreatePage
            error={setError}
            cancel={() => go("problems")}
            done={(problem) => {
              load();
              open(problem);
            }}
          />
        )}{" "}
        {page === "contests" && (
          <ContestsPage user={user} problems={problems} error={setError} openProblem={open} />
        )}{" "}
        {page === "training" && (
          <LearningPage kind="training" user={user} problems={problems} openProblem={open} error={setError} />
        )}{" "}
        {page === "homework" && (
          <LearningPage kind="homework" user={user} problems={problems} openProblem={open} error={setError} />
        )}{" "}
        {page === "ranking" && <RankingPage openProfile={openProfile} />}{" "}
        {page === "records" && <RecordsPage />}{" "}
        {page === "discuss" && (
          <DiscussPage
            user={user}
            login={() => setAuthOpen(true)}
            error={setError}
          />
        )}{" "}
        {page === "settings" && user?.role === "admin" && adminVerified && (
          <ControlPanel
            problems={problems}
            reload={load}
            error={setError}
            changed={(v) => {
              setSite(v);
              document.title = v.name;
            }}
          />
        )}{" "}
        {page === "domains" && user && (user.role !== "admin" || adminVerified) && (
          <DomainsPage user={user} error={setError} changed={() => api.site().then(setSite).catch(() => {})} />
        )}{" "}
        {page === "account" && user && <AccountPage user={user} changed={setUser} error={setError} />}{" "}
        {page === "messages" && user && <MessagesPage error={setError} />}{" "}
        {page === "blog" && <BlogPage user={user} error={setError} />}{" "}
        {page === "files" && user && <FilesPage error={setError} />}{" "}
        {page === "profile" && profileId > 0 && <ProfilePage id={profileId} error={setError} />}{" "}
        {["queue", "status", "compatibility"].includes(page) && (
          <OperationsPage kind={page as "queue" | "status" | "compatibility"} />
        )}{" "}
        {page === "problem" && selected && (
          <ProblemPage
            problem={selected}
            user={user}
            login={() => setAuthOpen(true)}
            back={() => go("problems")}
            refresh={load}
          />
        )}
      </main>
      <footer>
        <span className="footer-nav">
          <button onClick={() => go("queue")}>评测队列</button>
          <button onClick={() => go("status")}>服务状态</button>
          <button onClick={() => go("compatibility")}>兼容模式</button>
        </span>
        <span>
          Powered by ©2026{" "}
          <a href="https://github.com/BrightWeb-Dev-Team" target="_blank">
            BrightWeb Dev Team
          </a>
        </span>
        <span>
          <a
            href="https://github.com/BrightWeb-Dev-Team/InfiniteJudge"
            target="_blank"
          >
            InfiniteJudge v{communityVersion} Community
          </a>
        </span>
      </footer>
      {authOpen && (
        <AuthModal
          close={() => setAuthOpen(false)}
          done={(u) => {
            setUser(u);
            setAuthOpen(false);
          }}
        />
      )}
      {adminVerifyOpen && user?.role === "admin" && (
        <AdminVerifyModal
          close={() => {
            setAdminVerifyOpen(false);
            if (["settings", "domains"].includes(page)) go("home");
          }}
          done={(expiresAt) => {
            setAdminVerified(true);
            sessionStorage.setItem(
              "ij-admin-verification-expires",
              String(expiresAt),
            );
            setAdminVerifyOpen(false);
            history.pushState({}, "", pagePaths[adminTarget]);
            setPage(adminTarget);
          }}
        />
      )}
    </>
  );
}
function AdminVerifyModal({
  close,
  done,
}: {
  close: () => void;
  done: (expiresAt: number) => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="modal-bg">
      <form
        className="auth-modal"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api.verifyAdmin(password);
            sessionStorage.setItem("ij-admin-verification", result.token);
            done(result.expiresAt);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="brand-mark">
          <ShieldCheck />
        </span>
        <h2>管理员二次验证</h2>
        <p>为保护控制面板，请再次输入当前管理员密码。验证在 10 分钟后失效。</p>
        <label>
          管理员密码
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary" disabled={busy}>
          <ShieldCheck />
          {busy ? "验证中..." : "验证并进入"}
        </button>
      </form>
    </div>
  );
}
function LearningPage({ kind, user, problems, openProblem, error }: { kind: "training" | "homework"; user: User | null; problems: Problem[]; openProblem: (p: Problem) => void; error: (s: string) => void }) {
  const training = kind === "training", labels = training
    ? { kicker: "TRAINING", title: "训练计划", create: "新训练计划", empty: "目前没有训练计划。" }
    : { kicker: "ASSIGNMENTS", title: "作业", create: "创建作业", empty: "目前还没有作业。" };
  const blank = { title: "", description: "", starts_at: "", ends_at: "", problems: [] as string[] };
  const [items, setItems] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [form, setForm] = useState<any>(null);
  const load = () => api.learning(kind).then(setItems).catch((e) => error(e.message));
  useEffect(() => { void load(); }, [kind]);
  const localTime = (value?: string) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  async function show(id: number) { try { setSelected(await api.learningDetail(kind, id)); } catch (e: any) { error(e.message); } }
  async function edit(id: number) { try { const value = await api.learningDetail(kind, id); setForm({ ...value, starts_at: localTime(value.starts_at), ends_at: localTime(value.ends_at), problems: value.problems.map((p: any) => p.id) }); setSelected(null); } catch (e: any) { error(e.message); } }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = { ...form, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null };
      form.id ? await api.updateLearning(kind, form.id, body) : await api.createLearning(kind, body);
      setForm(null); await load(); error(`${labels.title}已保存`);
    } catch (e: any) { error(e.message); }
  }
  async function remove(id: number) { if (!confirm(`确定删除这个${labels.title}吗？`)) return; try { await api.deleteLearning(kind, id); setForm(null); setSelected(null); await load(); } catch (e: any) { error(e.message); } }
  const status = (item: any) => { const now = Date.now(), start = item.starts_at ? new Date(item.starts_at).getTime() : 0, end = item.ends_at ? new Date(item.ends_at).getTime() : Infinity; return start > now ? "未开始" : end < now ? "已结束" : "进行中"; };
  return <section className="page learning-page">
    <div className="page-title discussion-title"><div><span className="kicker">{labels.kicker}</span><h1>{labels.title}</h1><p>{training ? "按计划组织题目，循序推进算法训练。" : "集中查看题目要求与截止时间，按时完成作业。"}</p></div>{user?.role === "admin" && <button className="primary" onClick={() => { setForm({ ...blank }); setSelected(null); }}><Plus />{labels.create}</button>}</div>
    {form ? <form className="learning-editor" onSubmit={save}><div className="learning-editor-head"><h2>{form.id ? `编辑${labels.title}` : labels.create}</h2><button type="button" className="icon-btn" onClick={() => setForm(null)}><X /></button></div><div className="form-grid"><label>标题<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>{training ? "开始时间（可选）" : "发布时间（可选）"}<input type="datetime-local" value={form.starts_at || ""} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label><label>结束/截止时间（可选）<input type="datetime-local" value={form.ends_at || ""} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label></div><label>说明（Markdown）<textarea rows={7} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><fieldset><legend>选择题目</legend><div className="learning-picker">{problems.map((p) => <label key={p.id}><input type="checkbox" checked={form.problems.includes(p.id)} onChange={(e) => setForm({ ...form, problems: e.target.checked ? [...form.problems, p.id] : form.problems.filter((id: string) => id !== p.id) })} /><span><b>{p.id}</b>{p.title}</span></label>)}</div></fieldset><div className="form-actions"><button className="primary"><Check />保存</button>{form.id && <button type="button" className="danger" onClick={() => remove(form.id)}><Trash2 />删除</button>}</div></form>
    : selected ? <div className="learning-detail"><button className="text-btn" onClick={() => setSelected(null)}><ArrowLeft />返回列表</button><div className="learning-detail-head"><div><span className="tag">{status(selected)}</span><h2>{selected.title}</h2><p>创建者：{selected.creator}</p></div>{user?.role === "admin" && <button className="plain" onClick={() => edit(selected.id)}>编辑</button>}</div>{selected.starts_at && <p className="learning-time"><Clock />开始：{new Date(selected.starts_at).toLocaleString()}</p>}{selected.ends_at && <p className="learning-time"><Clock />{training ? "结束" : "截止"}：{new Date(selected.ends_at).toLocaleString()}</p>}<div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.description || "暂无说明"}</ReactMarkdown></div><h3>题目列表</h3><div className="contest-problems">{selected.problems.length ? selected.problems.map((entry: any, index: number) => { const problem = problems.find((p) => p.id === entry.id); return <button key={entry.id} onClick={() => problem && openProblem(problem)}><b>{index + 1}</b><span>{entry.id} {entry.title}</span><ChevronRight /></button>; }) : <div className="empty">暂未添加题目</div>}</div></div>
    : items.length ? <div className="learning-list">{items.map((item) => <article key={item.id} onClick={() => show(item.id)}><div><span className="tag">{status(item)}</span><h2>{item.title}</h2><p>{item.description || "暂无说明"}</p></div><div className="learning-meta">{item.ends_at && <span><Clock />{training ? "结束" : "截止"} {new Date(item.ends_at).toLocaleString()}</span>}<span>{item.creator}</span><ChevronRight /></div></article>)}</div>
    : <div className="large-empty"><BookOpen /><p>{labels.empty}</p>{user?.role !== "admin" && <small>管理员创建后会显示在这里。</small>}</div>}
  </section>;
}
function RankingPage({ openProfile }: { openProfile: (id: number) => void }) {
  return <section className="page"><div className="page-title"><span className="kicker">RATING</span><h1>RP 排行榜</h1><p>由固定 RP 与刷题浮动 RP 组成；越早通过、该题通过人数越少，获得的浮动 RP 越高。</p></div><RpRanking openProfile={openProfile} /></section>;
}
function RpRanking({ compact = false, openProfile }: { compact?: boolean; openProfile?: (id: number) => void }) {
  const [rows, setRows] = useState<any[]>([]); useEffect(() => { api.ranking().then(setRows).catch(() => {}); }, []);
  return <div className={compact ? "rp-board compact" : "rp-board"}><div className="rp-head"><span>排名</span><span>用户</span><span>通过</span><span>RP</span></div>{rows.slice(0, compact ? 8 : 100).map((row, index) => <button type="button" className="rp-row" key={row.id} onClick={() => openProfile?.(row.id)}><b>{index + 1}</b><span className="rp-user">{row.avatar ? <img src={row.avatar} /> : <i>{row.username[0].toUpperCase()}</i>}{row.username}</span><span>{row.solved}</span><strong>{row.rp}</strong></button>)}</div>;
}
function Hitokoto() {
  const [quote, setQuote] = useState({ text: "正在获取一言...", from: "" });
  useEffect(() => { api.hitokoto().then(setQuote).catch(() => setQuote({ text: "我之所以想变强，是为了活得轻松写意。", from: "Infinite Judge" })); }, []);
  return <section className="hitokoto"><h2>一言</h2><blockquote>{quote.text}</blockquote>{quote.from && <cite>— {quote.from}</cite>}</section>;
}
function OperationsPage({
  kind,
}: {
  kind: "queue" | "status" | "compatibility";
}) {
  const [health, setHealth] = useState<any>(null),
    [rows, setRows] = useState<Submission[]>([]);
  useEffect(() => {
    api.health().then(setHealth);
    if (kind === "queue") api.submissions().then(setRows);
  }, [kind]);
  const titles = {
    queue: "评测队列",
    status: "服务状态",
    compatibility: "兼容模式",
  };
  return (
    <section className="page operations-page">
      <div className="page-title">
        <span className="kicker">SYSTEM</span>
        <h1>{titles[kind]}</h1>
      </div>
      <div className="operations-card">
        {kind === "queue" && (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>题目</th>
                <th>用户</th>
                <th>语言</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td>{r.title}</td>
                  <td>{r.user}</td>
                  <td>{r.language}</td>
                  <td>
                    <span
                      className={
                        "status-text " +
                        r.status.replaceAll(" ", "").toLowerCase()
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>{new Date(r.created_at + "Z").toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {kind === "status" && (
          <div className="service-grid">
            <section>
              <Activity />
              <b>API 服务</b>
              <span>{health?.ok ? "运行中" : "检查中"}</span>
            </section>
            <section>
              <Database />
              <b>数据库</b>
              <span>{health?.database || "检查中"}</span>
            </section>
            <section>
              <ShieldCheck />
              <b>评测沙箱</b>
              <span>{health?.judge?.backend || "检查中"}</span>
            </section>
            <section>
              <Code2 />
              <b>插件</b>
              <span>{health?.plugins?.length ?? 0} 个已加载</span>
            </section>
          </div>
        )}
        {kind === "compatibility" && (
          <div className="compat-list">
            <section>
              <Check />
              <div>
                <b>HydroOJ 插件接口</b>
                <p>支持 apply(ctx)、Route、事件、UI 注入和集合存储适配。</p>
              </div>
            </section>
            <section>
              <Check />
              <div>
                <b>跨平台评测机</b>
                <p>
                  macOS 使用 sandbox-exec，Windows 和 Linux
                  使用对应的本地沙箱抽象，不依赖 Docker。
                </p>
              </div>
            </section>
            <section>
              <Check />
              <div>
                <b>Markdown 题面</b>
                <p>支持 GFM 表格、代码块、列表、链接和图片。</p>
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
function AuthModal({
  close,
  done,
}: {
  close: () => void;
  done: (u: User) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [emailVerification, setEmailVerification] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => { api.authConfig().then((value) => setEmailVerification(value.emailVerification)).catch(() => {}); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = mode === "login" ? await api.login(name, password) : await api.register(name, password, email, code);
      localStorage.setItem("ij-token", r.token);
      done(r.user);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <form className="auth-modal" onSubmit={submit}>
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="brand-mark">
          <Command />
        </span>
        <h2>{mode === "login" ? "欢迎回来" : "创建账户"}</h2>
        <p>
          {mode === "login"
            ? "登录后提交代码并记录进度"
            : "加入 Infinte Judge，开始算法训练"}
        </p>
        <label>
          用户名
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="3-24 位字母、数字或下划线"
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </label>
        {mode === "register" && emailVerification && <>
          <label>邮箱<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>验证码<div className="email-code-row"><input required value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className="plain" onClick={async () => { try { await api.sendEmailCode(email); setError("验证码已发送"); } catch (e: any) { setError(e.message); } }}>发送验证码</button></div></label>
        </>}
        {error && <div className="form-error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? "请稍候..." : mode === "login" ? "登录" : "注册"}
        </button>
        <button
          type="button"
          className="switch-auth"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "没有账户？立即注册" : "已有账户？返回登录"}
        </button>
      </form>
    </div>
  );
}
function HomePage({
  problems,
  announcement,
  user,
  go,
  open,
  error,
}: {
  problems: Problem[];
  announcement?: string;
  user: User | null;
  go: (p: Exclude<Page, "problem" | "profile">) => void;
  open: (p: Problem) => void;
  error: (s: string) => void;
}) {
  return (
    <section className="page hydro-layout home-dashboard">
      <div className="hydro-main">
        <section className="announcement">
          <Markdown>{announcement}</Markdown>
        </section>
        <section className="home-ranking"><div className="section-heading"><div><span className="kicker">RATING</span><h2>RP 排行榜</h2></div><button className="plain" onClick={() => go("ranking")}>查看全部<ChevronRight /></button></div><RpRanking compact /></section>
      </div>
      <aside className="hydro-side">
        <Hitokoto />
        <Countdown admin={user?.role === "admin"} error={error} />
        <section>
          <h2>最新题目</h2>
          {problems.slice(0, 4).map((p) => (
            <button className="side-link" onClick={() => open(p)} key={p.id}>
              <b>{p.id}</b>
              {p.title}
            </button>
          ))}
        </section>
        <section>
          <h2>系统概览</h2>
          <p>
            {problems.length} 道题目 ·{" "}
            {problems.reduce((n, p) => n + p.submissions, 0)} 次提交
          </p>
          <button className="side-action" onClick={() => go("problems")}>
            <Search />
            进入题库
          </button>
        </section>
      </aside>
    </section>
  );
}

function Countdown({
  admin,
  error,
}: {
  admin: boolean;
  error: (s: string) => void;
}) {
  const [configs, setConfigs] = useState<CountdownConfig[]>([]),
    [now, setNow] = useState(Date.now()),
    [editing, setEditing] = useState(false);
  useEffect(() => {
    api
      .countdown()
      .then(setConfigs)
      .catch((e) => error(e.message));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <section className="countdown-compact">
        <div className="countdown-compact-head">
          <h2>倒计时</h2>
          {admin && (
            <button
              className="countdown-settings"
              title="添加倒计时"
              onClick={() => setEditing(true)}
            >
              <Settings2 />
            </button>
          )}
        </div>
        <div className="countdown-compact-list">
          {configs.length ? configs.map((config) => {
            const left = new Date(config.target).getTime() - now;
            const days = Math.max(0, Math.ceil(left / 864e5));
            return <div key={config.id || config.title}>
              <span title={new Date(config.target).toLocaleString()}>{config.title}</span>
              <b>{left <= 0 ? "已结束" : `还有 ${days} 天`}</b>
            </div>;
          }) : <p className="muted">暂无倒计时</p>}
        </div>
      </section>
      {editing && (
        <CountdownModal
          value={{ title: "", target: new Date(Date.now() + 864e5).toISOString() }}
          close={() => setEditing(false)}
          save={async (next) => {
            try {
              const saved = await api.updateCountdown(next);
              setConfigs((current) => [...current, saved].sort((a, b) => +new Date(a.target) - +new Date(b.target)));
              setEditing(false);
            } catch (e: any) {
              error(e.message);
            }
          }}
        />
      )}
    </>
  );
}
function CountdownModal({
  value,
  close,
  save,
}: {
  value: CountdownConfig;
  close: () => void;
  save: (v: CountdownConfig) => void;
}) {
  const [title, setTitle] = useState(value.title),
    [target, setTarget] = useState(() => {
      const d = new Date(value.target);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    });
  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <form
        className="auth-modal countdown-modal"
        onSubmit={(e) => {
          e.preventDefault();
          save({
            title: title.trim() || "自定义倒计时",
            target: new Date(target).toISOString(),
          });
        }}
      >
        <button type="button" className="modal-close" onClick={close}>
          <X />
        </button>
        <span className="brand-mark">
          <Clock />
        </span>
        <h2>设置倒计时</h2>
        <p>自定义首页显示的活动名称和目标时间。</p>
        <label>
          倒计时名称
          <input
            autoFocus
            maxLength={32}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：NOIP 2026"
          />
        </label>
        <label>
          目标时间
          <input
            required
            type="datetime-local"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <button className="primary">保存倒计时</button>
      </form>
    </div>
  );
}
function ProblemsPage({
  problems,
  open,
  user,
  reload,
  error,
  create,
}: {
  problems: Problem[];
  open: (p: Problem) => void;
  user: User | null;
  reload: () => void;
  error: (s: string) => void;
  create: () => void;
}) {
  const [q, setQ] = useState(""),
    [difficulty, setDifficulty] = useState("全部"),
    [managing, setManaging] = useState(false);
  const list = useMemo(
    () =>
      problems.filter(
        (p) =>
          (difficulty === "全部" || p.difficulty === difficulty) &&
          (p.title.toLowerCase().includes(q.toLowerCase()) ||
            p.id.toLowerCase().includes(q.toLowerCase()) ||
            p.tags.some((t) => t.includes(q))),
      ),
    [q, difficulty, problems],
  );
  return (
    <section className="page">
      <div className="page-title discussion-title">
        <div>
          <span className="kicker">PROBLEM SET</span>
          <h1>题库</h1>
          <p>在精选题目中找到你的下一次突破。</p>
        </div>
        {user?.role === "admin" && (
          <button className="plain" onClick={() => setManaging(!managing)}>
            <ShieldCheck />
            {managing ? "返回题库" : "管理题目"}
          </button>
        )}
      </div>
      {managing ? (
        <AdminPage
          mode="problems"
          problems={problems}
          reload={reload}
          error={error}
          createProblem={create}
        />
      ) : (
        <>
          <div className="filters">
            <label>
              <Search />
              <input
                placeholder="搜索题号、标题或标签"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <div className="segments">
              {["全部", "入门", "简单", "中等", "困难"].map((d) => (
                <button
                  className={difficulty === d ? "active" : ""}
                  onClick={() => setDifficulty(d)}
                  key={d}
                >
                  {d}
                </button>
              ))}
            </div>
            <button className="filter-btn">
              <Filter />
              筛选
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>题号</th>
                  <th>题目</th>
                  <th>难度</th>
                  <th>通过率</th>
                  <th>提交</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} onClick={() => open(p)}>
                    <td className="mono">{p.id}</td>
                    <td>
                      <b>{p.title}</b>
                      <small>{p.tags.join(" · ")}</small>
                    </td>
                    <td>
                      <span className={diffClass(p.difficulty)}>
                        {p.difficulty}
                      </span>
                    </td>
                    <td>
                      <div className="progress">
                        <i style={{ width: p.acceptance + "%" }} />
                      </div>
                      {p.acceptance}%
                    </td>
                    <td>{p.submissions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <div className="empty">没有匹配的题目</div>}
          </div>
        </>
      )}
    </section>
  );
}
function ProblemPage({
  problem,
  user,
  login,
  back,
  refresh,
}: {
  problem: Problem;
  user: User | null;
  login: () => void;
  back: () => void;
  refresh: () => void;
}) {
  const [lang, setLang] = useState<"cpp" | "python" | "java">("cpp"),
    [code, setCode] = useState(starter.cpp),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false);
  function language(v: "cpp" | "python" | "java") {
    setLang(v);
    setCode(starter[v]);
  }
  async function submit() {
    if (!user) return login();
    setBusy(true);
    try {
      const s = await api.submit({
        problem_id: problem.id,
        language: lang,
        source: code,
      });
      setResult(s);
      let tries = 0;
      const poll = setInterval(async () => {
        const r = await api.submission(s.id);
        setResult(r);
        if (!["Pending", "Judging"].includes(r.status) || tries++ > 90) {
          clearInterval(poll);
          setBusy(false);
          refresh();
        }
      }, 500);
    } catch (e: any) {
      setResult({ status: "Error", error: e.message });
      setBusy(false);
    }
  }
  return (
    <section className="problem-view">
      <button className="back" onClick={back}>
        <ArrowLeft />
        返回题库
      </button>
      <div className="problem-layout">
        <article className="statement">
          <div className="problem-heading">
            <div>
              <span className="mono">{problem.id}</span>
              <h1>{problem.title}</h1>
            </div>
            <span className={diffClass(problem.difficulty)}>
              {problem.difficulty}
            </span>
          </div>
          <div className="limits">
            <span>
              <Clock />
              {problem.time_limit} ms
            </span>
            <span>内存 {problem.memory_limit} MB</span>
            <span>传统题型</span>
          </div>
          <h2>题目描述</h2>
          <Markdown>{problem.description}</Markdown>
          <h2>输入格式</h2>
          <Markdown>{problem.input_format}</Markdown>
          <h2>输出格式</h2>
          <Markdown>{problem.output_format}</Markdown>
          <div className="sample">
            <div>
              <b>输入</b>
              <pre>{problem.sample_input}</pre>
            </div>
            <div>
              <b>输出</b>
              <pre>{problem.sample_output}</pre>
            </div>
          </div>
        </article>
        <aside className="submit-panel">
          <div className="editor-head">
            <select
              value={lang}
              onChange={(e) => language(e.target.value as any)}
            >
              <option value="cpp">C++ 20</option>
              <option value="python">Python 3.12</option>
              <option value="java">Java 21</option>
            </select>
            <span>
              {lang === "java"
                ? "Main.java"
                : lang === "cpp"
                  ? "Main.cpp"
                  : "main.py"}
            </span>
          </div>
          <textarea
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="editor-foot">
            <span>{code.split("\n").length} 行 · UTF-8</span>
            <button className="primary" disabled={busy} onClick={submit}>
              <Send />
              {busy ? "评测中..." : user ? "提交评测" : "登录后提交"}
            </button>
          </div>
          {result && (
            <div
              className={
                "result " +
                (result.status === "Accepted" ? "accepted" : "judging")
              }
            >
              {["Pending", "Judging"].includes(result.status) ? (
                <>
                  <span className="spinner" />
                  正在沙箱中编译并运行
                </>
              ) : (
                <>
                  <StatusIcon status={result.status} />
                  <div>
                    <b>{result.status}</b>
                    <span>
                      {result.error ||
                        `${result.score || 0} 分 · ${result.time_ms || 0} ms`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
function StatusIcon({ status }: { status: string }) {
  return status === "Accepted" ? <Check /> : <X />;
}
function ContestsMini({ go }: { go: (p: Exclude<Page, "problem">) => void }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api.contests().then(setItems);
  }, []);
  return (
    <div>
      <div className="section-head">
        <div>
          <span className="kicker">UPCOMING</span>
          <h2>近期比赛</h2>
        </div>
      </div>
      {items.map((c) => (
        <div className="contest-row" key={c.id}>
          <i />
          <div>
            <b>{c.title}</b>
            <span>
              {c.type} · {c.duration} 分钟
            </span>
          </div>
          <time>{new Date(c.starts_at).toLocaleString()}</time>
          <ChevronRight />
        </div>
      ))}
    </div>
  );
}
function ContestsPage({
  user,
  problems,
  error,
  openProblem,
}: {
  user: User | null;
  problems: Problem[];
  error: (s: string) => void;
  openProblem: (p: Problem) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const load = () =>
    api
      .contests()
      .then(setItems)
      .catch((e) => error(e.message));
  useEffect(() => {
    void load();
    const match = location.pathname.match(/^\/contests\/(\d+)$/);
    if (match) void api.contest(Number(match[1])).then(setSelected).catch((e) => error(e.message));
  }, []);
  async function showContest(id: number) {
    try {
      setSelected(await api.contest(id));
      history.pushState({}, "", `/contests/${id}`);
    } catch (e: any) { error(e.message); }
  }
  const status = (c: any) => {
    const start = new Date(c.starts_at).getTime(), end = start + c.duration * 60000, now = Date.now();
    return now < start ? "即将开始" : now <= end ? "进行中" : "已结束";
  };
  return (
    <section className="page">
      <div className="page-title discussion-title">
        <div>
          <span className="kicker">COMPETITIONS</span>
          <h1>比赛</h1>
          <p>与同伴同场竞技，在限时挑战中检验算法能力。</p>
        </div>
        {user?.role === "admin" && (
          <button className="plain" onClick={() => setManaging(!managing)}>
            <ShieldCheck />
            {managing ? "返回比赛" : "管理比赛"}
          </button>
        )}
      </div>
      {managing ? (
        <AdminPage
          mode="contests"
          problems={problems}
          reload={load}
          error={error}
        />
      ) : selected ? (
        <div className="contest-detail">
          <button className="text-btn" onClick={() => { setSelected(null); history.pushState({}, "", "/contests"); }}>返回比赛列表</button>
          <div className="contest-detail-head">
            <div><span className="tag">{selected.type} · {status(selected)}</span><h2>{selected.title}</h2></div>
            <div><Clock />{new Date(selected.starts_at).toLocaleString()} · {selected.duration} 分钟</div>
          </div>
          <p>{selected.description || "暂无比赛说明"}</p>
          <h3>比赛题目</h3>
          <div className="contest-problems">
            {selected.problems?.length ? selected.problems.map((cp: any, index: number) => {
              const problem = problems.find((p) => p.id === cp.id);
              return <button key={cp.id} onClick={() => problem && openProblem(problem)}><b>{String.fromCharCode(65 + index)}</b><span>{cp.id} {cp.title}</span></button>;
            }) : <div className="empty">比赛暂未添加题目</div>}
          </div>
        </div>
      ) : (
        <div className="contest-list">
          {items.map((c: any) => (
            <article key={c.id} role="button" tabIndex={0} onClick={() => showContest(c.id)} onKeyDown={(e) => e.key === "Enter" && showContest(c.id)}>
              <div className="date">
                <b>{new Date(c.starts_at).getDate()}</b>
                <span>AUG</span>
              </div>
              <div className="contest-main">
                <div>
                  <span className="tag">{c.type} · {status(c)}</span>
                  <h2>{c.title}</h2>
                  <p>
                    <Clock />
                    {new Date(c.starts_at).toLocaleString()} · {c.duration} 分钟
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function RecordsPage() {
  return (
    <section className="page">
      <div className="page-title">
        <span className="kicker">JUDGE STATUS</span>
        <h1>评测记录</h1>
        <p>查看所有公开提交的实时评测状态。</p>
      </div>
      <Recent />
    </section>
  );
}
function Recent({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<Submission[]>([]);
  useEffect(() => {
    const load = () => api.submissions().then(setRows);
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={"recent " + (compact ? "compact" : "")}>
      <div className="section-head">
        <div>
          <span className="kicker">LIVE STATUS</span>
          <h2>最近提交</h2>
        </div>
      </div>
      <div className="record-list">
        {rows.length ? (
          rows.slice(0, compact ? 4 : 100).map((r) => (
            <div className="record" key={r.id}>
              <span
                className={
                  "status " + r.status.replaceAll(" ", "").toLowerCase()
                }
              >
                <StatusIcon status={r.status} />
              </span>
              <div>
                <b>{r.title}</b>
                <span>
                  {r.user} · {new Date(r.created_at + "Z").toLocaleString()}
                </span>
              </div>
              <span
                className={
                  "status-text " + r.status.replaceAll(" ", "").toLowerCase()
                }
              >
                {r.status}
              </span>
              {!compact && (
                <>
                  <span>{r.time_ms ?? "-"} ms</span>
                  <span>{r.memory_kb ?? "-"} KB</span>
                  <b>{r.score}</b>
                </>
              )}
            </div>
          ))
        ) : (
          <div className="empty">还没有提交记录</div>
        )}
      </div>
    </div>
  );
}
function DiscussPage({
  user,
  login,
  error,
}: {
  user: User | null;
  login: () => void;
  error: (s: string) => void;
}) {
  const [posts, setPosts] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [reply, setReply] = useState("");
  const load = () =>
    api
      .discussions()
      .then(setPosts)
      .catch((e) => error(e.message));
  useEffect(() => {
    void load();
    const match = location.pathname.match(/^\/discussions\/(\d+)$/);
    if (match) void open(Number(match[1]), false);
  }, []);
  async function open(id: number, navigate = true) {
    try {
      setSelected(await api.discussion(id));
      if (navigate) history.pushState({}, "", `/discussions/${id}`);
    } catch (e: any) {
      error(e.message);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await api.createDiscussion({ title, content });
      setCreating(false);
      setTitle("");
      setContent("");
      load();
      open(p.id);
    } catch (e: any) {
      error(e.message);
    }
  }
  async function remove() {
    if (!selected || !confirm("确定删除这条讨论及全部回复吗？")) return;
    try {
      await api.deleteDiscussion(selected.id);
      setSelected(null);
      history.pushState({}, "", "/discussions");
      void load();
    } catch (e: any) {
      error(e.message);
    }
  }
  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.reply(selected.id, reply);
      setReply("");
      open(selected.id);
      load();
    } catch (e: any) {
      error(e.message);
    }
  }
  return (
    <section className="page">
      <div className="page-title discussion-title">
        <div>
          <span className="kicker">COMMUNITY</span>
          <h1>讨论</h1>
          <p>交流解题思路、赛事体验与算法学习方法。</p>
        </div>
        <button
          className="primary"
          onClick={() => (user ? setCreating(true) : login())}
        >
          <Plus />
          发起讨论
        </button>
      </div>
      {selected ? (
        <div className="thread">
          <button
            className="back"
            onClick={() => {
              setSelected(null);
              history.pushState({}, "", "/discussions");
            }}
          >
            <ArrowLeft />
            返回讨论
          </button>
          <article className="thread-main">
            {(user?.role === "admin" || user?.id === selected.user_id) && (
              <button
                className="thread-delete"
                title="删除讨论"
                onClick={remove}
              >
                <Trash2 />
              </button>
            )}
            <span>
              {selected.username} ·{" "}
              {new Date(selected.created_at + "Z").toLocaleString()}
            </span>
            <h2>{selected.title}</h2>
            <p>{selected.content}</p>
          </article>
          <h3>回复</h3>
          {selected.replies.map((r: any) => (
            <article className="reply" key={r.id}>
              <b>{r.username}</b>
              <span>{new Date(r.created_at + "Z").toLocaleString()}</span>
              <p>{r.content}</p>
            </article>
          ))}
          {user ? (
            <form className="reply-form" onSubmit={sendReply}>
              <textarea
                required
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="写下你的回复"
              />
              <button className="primary">回复</button>
            </form>
          ) : (
            <button className="plain" onClick={login}>
              登录后回复
            </button>
          )}
        </div>
      ) : (
        <div className="discussion">
          {posts.length ? (
            posts.map((p) => (
              <article key={p.id} onClick={() => open(p.id)}>
                <div className="avatar">{p.username[0].toUpperCase()}</div>
                <div>
                  <span>算法讨论</span>
                  <h2>{p.title}</h2>
                  <p>
                    {p.username} ·{" "}
                    {new Date(p.updated_at + "Z").toLocaleString()}
                  </p>
                </div>
                <b>
                  <MessageSquare />
                  {p.replies} 条回复
                </b>
              </article>
            ))
          ) : (
            <div className="empty">还没有讨论</div>
          )}
        </div>
      )}
      {creating && (
        <div className="modal-bg">
          <form className="manage-modal content-form" onSubmit={create}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setCreating(false)}
            >
              <X />
            </button>
            <h2>发起讨论</h2>
            <label className="field">
              <span>标题</span>
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              <span>内容</span>
              <textarea
                required
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            <button className="primary">发布讨论</button>
          </form>
        </div>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
