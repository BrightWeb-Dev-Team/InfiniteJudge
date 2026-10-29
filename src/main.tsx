import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  Clock,
  Code2,
  EyeOff,
  Database,
  Command,
  Flame,
  Home,
  Menu,
  Moon,
  Music2,
  Sparkles,
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
  BadgeCheck,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserCircle,
  UserRoundCog,
  Mail,
  Wrench,
  NotebookText,
  FolderOpen,
  Upload,
  KeyRound,
  Edit3,
  Save,
  Heart,
  Video,
  Ban,
} from "lucide-react";
import {
  api,
  CountdownConfig,
  IntegrityRun,
  IntegritySession,
  MyPermissions,
  Problem,
  SiteConfig,
  Submission,
  User,
} from "./api";
import { AdminPage, emptyProblem } from "./admin";
import { ObjectiveItemsEditor } from "./objective-editor";
import { ControlPanel, BanManager } from "./control";
import { DomainsPage } from "./domains";
import { AccountPage, BlogPage, FilesPage, MessagesPage, ProfilePage } from "./account";
import { MomentsPage } from "./moments";
import { Mascot } from "./mascot";
import { Markdown as RichMarkdown } from "./markdown";
import { handleEditorTab } from "./editor";
import { VideoCall, CALL_ENDED, startCall } from "./video-call";
import { startAuthentication } from "@simplewebauthn/browser";
import { WheelDateTime } from "./datetime";
import { useUserLookup, UserLookupPreview } from "./user-lookup";
import "./liquid-glass.css";
import { LiquidGlassEffects } from "./liquid-glass";
import { AiAssistantPage } from "./ai-assistant";
import { startChatApp } from "./chat";

const oauthHash = new URLSearchParams(location.hash.replace(/^#/, ""));
const oauthCode = oauthHash.get("oauth_code");
let oauthError = oauthHash.get("oauth_error");
if (oauthHash.has("oauth_code") || oauthHash.has("oauth_token") || oauthHash.has("oauth_error")) {
  history.replaceState(null, "", location.pathname + location.search);
}
type Page =
  | "home"
  | "problems"
  | "contests"
  | "contest-create"
  | "training"
  | "homework"
  | "ranking"
  | "records"
  | "discuss"
  | "problem"
  | "problem-create"
  | "problem-tests"
  | "settings"
  | "queue"
  | "status"
  | "compatibility"
  | "about"
  | "license"
  | "domains"
  | "account"
  | "messages"
  | "blog"
  | "moments"
  | "files"
  | "profile"
  | "video-call"
  | "certifications"
  | "certification-create"
  | "certification-guide"
  | "customize"
  | "ai-assistant";

type Theme = "light" | "dark" | "meteor" | "miku";

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem("theme");
  return saved === "dark" || saved === "meteor" || saved === "miku" ? saved : "light";
};
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const pagePaths: Record<Exclude<Page, "problem" | "profile">, string> = {
  home: "/",
  problems: "/problems",
  "problem-create": "/problems/create",
  "problem-tests": "/problems",
  contests: "/contests",
  "contest-create": "/contest/create",
  training: "/training",
  homework: "/homework",
  ranking: "/ranking",
  records: "/records",
  discuss: "/discussions",
  certifications: "/certifications",
  "certification-create": "/certifications/create",
  "certification-guide": "/certifications/guide",
  settings: "/settings",
  queue: "/queue",
  status: "/status",
  compatibility: "/compatibility",
  about: "/about",
  license: "/about/license",
  domains: "/domains",
  account: "/account",
  messages: "/messages",
  blog: "/blog",
  moments: "/moments",
  files: "/files",
  "video-call": "/video-call",
  customize: "/customize",
  "ai-assistant": "/ai-assistant",
};
function routeFromPath(): { page: Page; id?: string } {
  const path = location.pathname.replace(/\/$/, "") || "/";
  if (path === "/assistant") return { page: "ai-assistant" };
  if (["/license", "/about/license"].includes(path.toLowerCase())) return { page: "license" };
  if (path === "/problems/create") return { page: "problem-create" };
  if (path === "/contest/create") return { page: "contest-create" };
  const record = path.match(/^\/records\/(\d+)$/);
  if (record) return { page: "records", id: record[1] };
  const testPage = path.match(/^\/problems\/([^/]+)\/tests$/);
  if (testPage) return { page: "problem-tests", id: decodeURIComponent(testPage[1]) };
  const match = path.match(/^\/problems\/([^/]+)$/);
  if (match) return { page: "problem", id: decodeURIComponent(match[1]) };
  const profile = path.match(/^\/users\/(\d+)$/);
  if (profile) return { page: "profile", id: profile[1] };
  const videoCall = path.match(/^\/video-call\/(\d+)$/);
  if (videoCall) return { page: "video-call", id: videoCall[1] };
  if (/^\/contests\/\d+$/.test(path)) return { page: "contests" };
  if (/^\/discussions\/\d+$/.test(path)) return { page: "discuss" };
  // Canonical blog URL is /blog/<uid>/<post id>; the bare /blog/<id> form
  // stays routable so older shared links still land on the post.
  if (/^\/blog(?:\/create|\/\d+(?:\/\d+|\/edit)?)$/.test(path)) return { page: "blog" };
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
          "/certifications": "certifications",
          "/certifications/create": "certification-create",
          "/certifications/guide": "certification-guide",
          "/settings": "settings",
          "/queue": "queue",
          "/status": "status",
          "/compatibility": "compatibility",
          "/about": "about",
          "/domains": "domains",
          "/account": "account",
          "/messages": "messages",
          "/blog": "blog",
          "/moments": "moments",
          "/files": "files",
          "/video-call": "video-call",
          "/customize": "customize",
          "/ai-assistant": "ai-assistant",
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
  return <RichMarkdown>{children}</RichMarkdown>;
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
          <p>编辑题面、运行限制与答案。</p>
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
            <label className="check-row"><input type="checkbox" checked={!!form.hidden} onChange={(e) => field("hidden", e.target.checked ? 1 : 0)} />隐藏题目（仅管理员和 Root 可见）</label>
            <CreateField label="题型"><select value={form.question_type||"programming"} onChange={(e)=>setForm({...form,question_type:e.target.value,objective_items:e.target.value==="objective"&&!(form.objective_items||[]).length?[{type:"single",options:["选项 A","选项 B"],answer:[]}]:form.objective_items})}><option value="programming">编程题</option><option value="objective">客观题（可混合）</option></select></CreateField>
            <label className="check-row"><input type="checkbox" checked={!!form.integrity_enabled} disabled={form.question_type === "objective"} onChange={(e) => field("integrity_enabled", e.target.checked ? 1 : 0)} />AI 作弊检测（代码输出、粘贴监控、水印、Computer Use 防护）</label>
          </div>
        </div>
        <div className="create-editor-grid">
          <div className="create-section statement-editor"><h2>完整题面</h2><CreateField label="Markdown（在正文中编写题目描述、输入格式、输出格式和样例）"><textarea rows={34} value={form.description} placeholder={"## 题目描述\n\n在这里编写题目内容。\n\n## 输入格式\n\n在这里编写输入格式。\n\n## 输出格式\n\n在这里编写输出格式。\n\n## 样例\n\n```text\n输入与输出示例\n```"} onChange={(e) => field("description", e.target.value)} onKeyDown={(e) => handleEditorTab(e, form.description, (next) => field("description", next))} /></CreateField></div>
          <aside className="create-side">
            <div className="create-section preview-pane">
              <h2>Markdown 预览</h2>
              <Markdown>{form.description || "在左侧输入完整题面后，这里会显示实时预览。"}</Markdown>
            </div>
            <div className="create-section">
              <h2>{form.question_type === "programming" ? "测试点设置" : "客观题答案"}</h2>
              {form.question_type === "programming" ? (
                <p className="create-side-hint">题目创建后，将在独立页面配置测试点与 Special Judge。</p>
              ) : (
                <ObjectiveItemsEditor items={form.objective_items || []} onChange={(items) => field("objective_items", items)} />
              )}
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
function ProblemTestsPage({ id, error, cancel, done }: { id: string; error: (message: string) => void; cancel: () => void; done: (problem: Problem) => void }) {
  const [form, setForm] = useState<{ testcases: string[][]; spj_enabled: number; spj_source: string } | null>(null), [title, setTitle] = useState(""), [saving, setSaving] = useState(false), [importing, setImporting] = useState(false);
  useEffect(() => { api.adminProblem(id).then((problem) => { if (problem.question_type !== "programming") throw new Error("客观题不需要配置测试点"); setTitle(problem.title); setForm({ testcases: problem.testcases?.length ? problem.testcases : [["", ""]], spj_enabled: problem.spj_enabled || 0, spj_source: problem.spj_source || "" }); }).catch((cause) => error(cause.message)); }, [id]);
  const updateTest = (index: number, field: 0 | 1, value: string) => setForm((current) => current ? { ...current, testcases: current.testcases.map((test, i) => i === index ? test.map((part, j) => j === field ? value : part) : test) } : current);
  async function importTestcases(file?: File) { if (!file) return; setImporting(true); try { const result = await api.importProblemTestcases(id, file); setForm((current) => current ? { ...current, testcases: result.testcases } : current); alert(`已从文件包读取 ${result.testcases.length} 组测试点，请检查后点击“保存测试点”`); } catch (cause: any) { error(cause.message); } finally { setImporting(false); } }
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!form) return; setSaving(true); try { await api.updateProblemTestcases(id, form); done(await api.problem(id)); } catch (cause: any) { error(cause.message); } finally { setSaving(false); } }
  if (!form) return <section className="page"><div className="empty">正在加载测试点设置...</div></section>;
  return <section className="page problem-create-page"><div className="page-title create-page-title"><div><span className="kicker">TEST DATA</span><h1>测试点设置</h1><p>{id} · {title}</p></div><button className="plain" type="button" onClick={cancel}><ArrowLeft /> 返回题库</button></div><form className="problem-create-form" onSubmit={submit}><div className="create-section"><div className="testcase-section-head"><h2>测试数据</h2><label className="secondary testcase-import-btn"><Upload />{importing ? "正在读取..." : "上传测试点 ZIP"}<input type="file" accept=".zip,application/zip" hidden disabled={importing} onChange={(event) => { importTestcases(event.target.files?.[0]); event.target.value = ""; }} /></label></div><div className="testcase-list">{form.testcases.map((test, index) => <section key={index}><div className="testcase-header"><strong>测试点 {index + 1}</strong><button type="button" disabled={form.testcases.length === 1} onClick={() => setForm({ ...form, testcases: form.testcases.filter((_, item) => item !== index) })}>删除</button></div><label>输入<textarea value={test[0]} onChange={(event) => updateTest(index, 0, event.target.value)} /></label><label>输出<textarea value={test[1]} onChange={(event) => updateTest(index, 1, event.target.value)} /></label></section>)}<button type="button" className="plain" onClick={() => setForm({ ...form, testcases: [...form.testcases, ["", ""]] })}>添加测试点 +</button></div></div><div className="create-section"><h2>Special Judge</h2><label className="check-row"><input type="checkbox" checked={!!form.spj_enabled} onChange={(event) => setForm({ ...form, spj_enabled: event.target.checked ? 1 : 0 })} />启用 Special Judge</label>{!!form.spj_enabled && <CreateField label="特判程序（C++20；argv[1] 输入、argv[2] 用户输出、argv[3] 标准输出）"><textarea className="testcase-editor" rows={18} value={form.spj_source} onChange={(event) => setForm({ ...form, spj_source: event.target.value })} onKeyDown={(event) => handleEditorTab(event, form.spj_source, (next) => setForm({ ...form, spj_source: next }))} /></CreateField>}</div><div className="create-actions"><button type="button" className="plain" onClick={cancel}>取消</button><button className="primary" disabled={saving || importing}>{saving ? "正在保存..." : "保存测试点"}</button></div></form></section>;
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
function MeteorShower() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    type Star = { x: number; y: number; radius: number; alpha: number; phase: number };
    type Meteor = { x: number; y: number; length: number; speed: number; alpha: number; width: number };
    let width = 0, height = 0, frame = 0, animationFrame = 0;
    let stars: Star[] = [], meteors: Meteor[] = [];

    const spawnMeteor = () => meteors.push({
      x: width * 0.25 + Math.random() * width * 0.9,
      y: -80 - Math.random() * height * 0.4,
      length: 90 + Math.random() * 160,
      speed: 8 + Math.random() * 9,
      alpha: 0.5 + Math.random() * 0.4,
      width: 0.8 + Math.random() * 1.5,
    });

    const draw = (animate = true) => {
      context.clearRect(0, 0, width, height);
      frame += 1;
      stars.forEach((star) => {
        const twinkle = animate ? 0.65 + 0.35 * Math.sin(frame * 0.018 + star.phase) : 0.8;
        context.fillStyle = `rgba(190, 225, 255, ${star.alpha * twinkle})`;
        context.beginPath();
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fill();
      });
      if (animate && Math.random() < 0.035 && meteors.length < 7) spawnMeteor();
      meteors.forEach((meteor) => {
        meteor.x -= meteor.speed * 0.55;
        meteor.y += meteor.speed;
        const glow = context.createLinearGradient(
          meteor.x + meteor.length * 0.55, meteor.y - meteor.length, meteor.x, meteor.y,
        );
        glow.addColorStop(0, "rgba(130, 205, 255, 0)");
        glow.addColorStop(0.72, `rgba(135, 214, 255, ${meteor.alpha * 0.55})`);
        glow.addColorStop(1, `rgba(245, 252, 255, ${meteor.alpha})`);
        context.strokeStyle = glow;
        context.lineWidth = meteor.width;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(meteor.x + meteor.length * 0.55, meteor.y - meteor.length);
        context.lineTo(meteor.x, meteor.y);
        context.stroke();
      });
      meteors = meteors.filter((meteor) => meteor.y < height + meteor.length && meteor.x > -meteor.length);
      if (animate) animationFrame = requestAnimationFrame(() => draw(true));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      stars = Array.from({ length: Math.max(70, Math.floor((width * height) / 14000)) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.35 + Math.random() * 1.2,
        alpha: 0.25 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const restart = () => {
      cancelAnimationFrame(animationFrame);
      meteors = [];
      if (!reducedMotion.matches) {
        for (let i = 0; i < 3; i += 1) spawnMeteor();
      }
      draw(!reducedMotion.matches);
    };
    const handleResize = () => { resize(); restart(); };
    resize();
    restart();
    window.addEventListener("resize", handleResize);
    reducedMotion.addEventListener?.("change", restart);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
      reducedMotion.removeEventListener?.("change", restart);
    };
  }, []);

  return <canvas ref={canvasRef} className="meteor-canvas" aria-hidden="true" />;
}

function App() {
  const initialRoute = routeFromPath();
  const [setup, setSetup] = useState<boolean | null>(null),
    [page, setPage] = useState<Page>(initialRoute.page),
    [theme, setTheme] = useState<Theme>(getInitialTheme),
    [liquidGlass, setLiquidGlass] = useState(() => {
      try { return localStorage.getItem("ij-liquid-glass") === "1"; }
      catch { return false; }
    }),
    [glassTransparency, setGlassTransparency] = useState(() => {
      try {
        const saved = localStorage.getItem("ij-glass-transparency");
        const value = saved === null ? 84 : Number(saved);
        return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 84;
      } catch { return 84; }
    }),
    [glassRefraction, setGlassRefraction] = useState(() => {
      try {
        const saved = localStorage.getItem("ij-glass-refraction");
        const value = saved === null ? 70 : Number(saved);
        return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 70;
      } catch { return 70; }
    }),
    [mobile, setMobile] = useState(false),
    [mascot, setMascot] = useState(() => {
      try { return localStorage.getItem("ij-mascot") === "1"; }
      catch { return false; }
    }),
    [compatibility, setCompatibility] = useState(() => localStorage.getItem("ij-compatibility-mode") === "1"),
    [problems, setProblems] = useState<Problem[]>([]),
    [selected, setSelected] = useState<Problem | null>(null),
    [selectedContestId, setSelectedContestId] = useState<number | undefined>(),
    [profileId, setProfileId] = useState(Number(initialRoute.id || 0)),
    [recordId, setRecordId] = useState<number | null>(initialRoute.page === "records" && initialRoute.id ? Number(initialRoute.id) : null),
    [testProblemId, setTestProblemId] = useState(initialRoute.page === "problem-tests" ? initialRoute.id || "" : ""),
    [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [userMenu, setUserMenu] = useState(false),
    [switchUserOpen, setSwitchUserOpen] = useState(false),
    [tagManagerOpen, setTagManagerOpen] = useState(false),
    [banManagerOpen, setBanManagerOpen] = useState(false),
    [unread, setUnread] = useState(0),
    [friendRequests, setFriendRequests] = useState(0),
    [domains, setDomains] = useState<any[]>([]),
    [domainId, setDomainId] = useState(() => localStorage.getItem("ij-domain-id") || ""),
    [perms, setPerms] = useState<MyPermissions | null>(null),
    [adminVerifyOpen, setAdminVerifyOpen] = useState(false),
    [adminTarget, setAdminTarget] = useState<"settings" | "domains">(
      initialRoute.page === "domains" ? "domains" : "settings",
    ),
    [adminVerified, setAdminVerified] = useState(
      Number(sessionStorage.getItem("ij-admin-verification-expires")) >
        Date.now(),
    ),
    [communityVersion] = useState("5.0.0"),
    [error, setError] = useState(oauthError ? `Auth0 统一登录失败：${oauthError}` : ""),
    [announcementOpen, setAnnouncementOpen] = useState(false),
    [announcementDismiss, setAnnouncementDismiss] = useState(false),
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
  const isAdmin = (user?.role === "admin" || user?.role === "root") || user?.role === "root";
  const toggleCompatibility = () => { const next = !compatibility; setCompatibility(next); localStorage.setItem("ij-compatibility-mode", next ? "1" : "0"); document.documentElement.toggleAttribute("data-compatibility", next); window.dispatchEvent(new CustomEvent("ij-compatibility-change", { detail: next })); };
  useEffect(() => { document.documentElement.toggleAttribute("data-compatibility", compatibility); const change = (event: Event) => setCompatibility(Boolean((event as CustomEvent).detail)); window.addEventListener("ij-compatibility-change", change); return () => window.removeEventListener("ij-compatibility-change", change); }, [compatibility]);
  useEffect(() => {
    api.setupStatus().then((value) => setSetup(!value.installed)).catch(() => setSetup(false));
    load();
    api
      .site()
      .then((v) => {
        setSite(v);
        document.title = v.name;
        const now = Date.now(), start = v.announcementStartsAt ? new Date(v.announcementStartsAt).getTime() : -Infinity, end = v.announcementEndsAt ? new Date(v.announcementEndsAt).getTime() : Infinity;
        const domainAnnouncement = v.domainAnnouncement || "";
        const noticeId = `${v.announcementStartsAt || ""}|${v.announcementEndsAt || ""}|${domainAnnouncement}`;
        if (v.announcementPopup && domainAnnouncement && now >= start && now <= end && localStorage.getItem("ij-dismissed-announcement") !== noticeId) setAnnouncementOpen(true);
      })
      .catch(() => {});
    if (initialRoute.page === "problem" && initialRoute.id) {
      const contestId = Number(new URLSearchParams(location.search).get("contest") || 0) || undefined;
      setSelectedContestId(contestId);
      (contestId ? api.contestProblem(contestId, initialRoute.id) : api.problem(initialRoute.id))
        .then(setSelected)
        .catch((e) => setError(e.message));
    }
    if (localStorage.getItem("ij-token"))
      api
        .me()
        .then(async (value) => {
          setUser(value);
          if (initialRoute.page === "settings" && value.role === "root") {
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
            setAdminTarget("settings");
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
      setUserMenu(false);
      if (route.page === "problem-tests") setTestProblemId(route.id || "");
      if (route.page === "settings" && !(Number(sessionStorage.getItem("ij-admin-verification-expires")) > Date.now())) { setAdminTarget("settings"); setAdminVerifyOpen(true); }
      if ((route.page === "profile" || route.page === "video-call") && route.id) setProfileId(Number(route.id));
      if (route.page === "records") setRecordId(route.id ? Number(route.id) : null);
      if (route.page === "problem" && route.id) {
        const contestId = Number(new URLSearchParams(location.search).get("contest") || 0) || undefined;
        setSelectedContestId(contestId);
        (contestId ? api.contestProblem(contestId, route.id) : api.problem(route.id))
          .then(setSelected)
          .catch((e) => setError(e.message));
      } else setSelectedContestId(undefined);
    };
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  }, []);
  // Keep route changes and browser history restores from leaving the page scrolled
  // beneath the fixed navigation bar.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-liquid-glass", liquidGlass);
    try { localStorage.setItem("ij-liquid-glass", liquidGlass ? "1" : "0"); }
    catch { /* Keep the preference usable when browser storage is unavailable. */ }
  }, [liquidGlass]);
  useEffect(() => {
    document.documentElement.style.setProperty("--glass-opacity", String((100 - glassTransparency) / 100));
    try { localStorage.setItem("ij-glass-transparency", String(glassTransparency)); }
    catch { /* The current session can still adjust the material. */ }
  }, [glassTransparency]);
  useEffect(() => {
    try { localStorage.setItem("ij-glass-refraction", String(glassRefraction)); }
    catch { /* The current session can still adjust refraction. */ }
  }, [glassRefraction]);
  useEffect(() => {
    try { localStorage.setItem("ij-mascot", mascot ? "1" : "0"); }
    catch { /* The preference falls back to off when storage is unavailable. */ }
  }, [mascot]);
  // custom_head / custom_script would run in this origin and could read ij-token from
  // localStorage, so they are only rendered inside the sandboxed CustomHtml frame.

  useEffect(() => {
    if (!user) return setUnread(0);
    api.messages()
      .then((items) => setUnread(items.filter((item) => item.recipient_id === user.id && !item.read_at).length))
      .catch(() => {});
  }, [user, page]);
  useEffect(() => {
    if (!user) return setFriendRequests(0);
    api.friends().then((data) => setFriendRequests(data.incoming.length)).catch(() => {});
  }, [user, page]);
  // Domain permissions drive every navigation entry; the server enforces the same keys.
  useEffect(() => {
    if (!user) { setPerms(null); return; }
    let alive = true;
    api.myPermissions().then((value) => { if (alive) setPerms(value); }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id, domainId, page]);
  const can = (permission: string) => Boolean(perms?.is_root || perms?.permissions?.[permission]);
  useEffect(()=>{if(!user)return setDomains([]);api.domains().then((items)=>{setDomains(items);if(!domainId&&items[0]){localStorage.setItem("ij-domain-id",String(items[0].id));setDomainId(String(items[0].id));}}).catch(()=>{});},[user]);
  useEffect(()=>{if(domainId)load();},[domainId]);
  useEffect(() => {
    if (user?.role !== "root" || page !== "settings")
      return;
    const expires = Number(
        sessionStorage.getItem("ij-admin-verification-expires"),
      ),
      delay = expires - Date.now();
    if (!adminVerified || delay <= 0) {
      setAdminVerified(false);
      setAdminTarget("settings");
      setAdminVerifyOpen(true);
      // The route URL is still /settings; without this the in-app history would point at a
      // page the app refuses to render once the modal is dismissed.
      if (page !== "settings") return;
      history.replaceState({}, "", pagePaths.home);
      setPage("home");
      return;
    }
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem("ij-admin-verification");
      sessionStorage.removeItem("ij-admin-verification-expires");
      setAdminVerified(false);
      setAdminTarget("settings");
      setAdminVerifyOpen(true);
      history.replaceState({}, "", pagePaths.home);
      setPage("home");
    }, delay);
    return () => clearTimeout(timer);
  }, [page, user, adminVerified]);
  // Any elevated request rejected with ADMIN_REVERIFY (server restart, expiry) surfaces here.
  useEffect(() => {
    const handler = () => {
      setAdminVerified(false);
      setAdminTarget("settings");
      setAdminVerifyOpen(true);
    };
    addEventListener("ij-admin-reverify", handler);
    return () => removeEventListener("ij-admin-reverify", handler);
  }, []);
  const go = async (p: Exclude<Page, "problem" | "profile">) => {
    if (p === "problem-tests") return;
    if (p === "settings" && user?.role !== "root") { setError("普通管理员无权访问控制面板"); return; }
    if (
      p === "settings" &&
      user?.role === "root"
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
        setAdminTarget("settings");
        setAdminVerifyOpen(true);
        setMobile(false);
        return;
      }
    }
    history.pushState({}, "", pagePaths[p]);
    if (p === "records") setRecordId(null);
    setPage(p);
    setUserMenu(false);
    setMobile(false);
    scrollTo({ top: 0, left: 0, behavior: "auto" });
  };
  const openProfile = (id: number) => {
    history.pushState({}, "", `/users/${id}`);
    setProfileId(id);
    setPage("profile");
    setUserMenu(false);
    setMobile(false);
    scrollTo({ top: 0, left: 0, behavior: "auto" });
  };
  const open = async (p: Problem, contestId?: number) => {
    try {
      setSelected(contestId ? await api.contestProblem(contestId, p.id) : await api.problem(p.id));
      setSelectedContestId(contestId);
      history.pushState({}, "", `/problems/${encodeURIComponent(p.id)}${contestId ? `?contest=${contestId}` : ""}`);
      setPage("problem");
      setMobile(false);
      scrollTo({ top: 0, left: 0, behavior: "auto" });
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
      {theme === "meteor" && !compatibility && !isSafari && <MeteorShower />}
      <LiquidGlassEffects enabled={liquidGlass && !compatibility} theme={theme} strength={glassRefraction} />
      <Mascot enabled={mascot} />
      <header className="site-header">
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
          {(isAdmin || can("edit_domain") || can("manage_permission") || can("join_application")) && (
            <button
              className={page === "domains" ? "active" : ""}
              onClick={() => go("domains")}
            >
              <Users />
              域管理
            </button>
          )}
          {user?.role === "root" && (
            <button
              className={page === "settings" ? "active" : ""}
              onClick={() => go("settings")}
            >
              <SlidersHorizontal />
              控制面板
            </button>
          )}
          {!user && (
            <button className="nav-login" onClick={() => { setAuthOpen(true); setMobile(false); }}>
              <LogIn />
              登录
            </button>
          )}
        </nav>
        <div className="head-actions">
          {user&&domains.length>0&&<select className="domain-switcher" aria-label="当前域" value={domainId} onChange={(e)=>{localStorage.setItem("ij-domain-id",e.target.value);setDomainId(e.target.value);setSelected(null);}}>{domains.map((domain)=><option key={domain.id} value={domain.id}>{domain.name}</option>)}</select>}
          <div className="theme-switcher" aria-label="主题模式">
            <button className={theme === "light" ? "active" : ""} title="亮色模式" onClick={() => setTheme("light")}><Sun /></button>
            <button className={theme === "dark" ? "active" : ""} title="暗色模式" onClick={() => setTheme("dark")}><Moon /></button>
            <button className={theme === "meteor" ? "active" : ""} title="流星雨模式" onClick={() => setTheme("meteor")}><Sparkles /></button>
            <button className={theme === "miku" ? "active" : ""} title="初音未来主题" aria-label="初音未来主题" onClick={() => setTheme("miku")}><Music2 /></button>
          </div>
          {user ? (
            <div className="user-menu-wrap">
              <button className="user-btn" onClick={() => setUserMenu(!userMenu)}>
                <span>{user.avatar ? <img src={user.avatar} /> : user.username[0].toUpperCase()}</span>{user.username}<ChevronRight className={userMenu ? "rotated" : ""} />
              </button>
              {userMenu && <div className="user-dropdown">
                <button onClick={() => openProfile(user.id)}><UserCircle />我的资料</button>
                <button onClick={() => { go("messages"); setUserMenu(false); }}><Mail />站内消息{unread > 0 && <b>{unread}</b>}</button>
                <button onClick={() => { go("moments"); setUserMenu(false); }}><Heart />朋友圈{friendRequests > 0 && <b>{friendRequests}</b>}</button>
                <div className="dropdown-separator" />
                <button onClick={() => { go("domains"); setUserMenu(false); }}><Database />我的域</button>
                <button onClick={() => { go("files"); setUserMenu(false); }}><FolderOpen />我的文件</button>
                <button onClick={() => { go("account"); setUserMenu(false); }}><Wrench />账户设置</button>
                <button onClick={() => { go("ai-assistant"); setUserMenu(false); }}><Sparkles />AI 助手</button>
                <button onClick={() => { go("customize"); setUserMenu(false); }}><Edit3 />自定义页面</button>
                <button onClick={() => { go("blog"); setUserMenu(false); }}><NotebookText />博客</button>
                {can("view_tag") && <button onClick={() => { setTagManagerOpen(true); setUserMenu(false); }}><SlidersHorizontal />Tag 管理</button>}
                <button onClick={() => { go("certifications"); setUserMenu(false); }}><ShieldCheck />认证中心</button>
                {user.role === "root" && <button onClick={() => { setBanManagerOpen(true); setUserMenu(false); }}><Ban />封禁管理</button>}
                {user.role === "root" && <button onClick={() => { setSwitchUserOpen(true); setUserMenu(false); }}><UserRoundCog />切换用户</button>}
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
            announcement={site.homeAnnouncement || site.announcement}
            carousel={site.carousel}
            carouselInterval={site.carouselInterval}
            user={user}
            go={go}
            open={open}
            openProfile={openProfile}
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
            pageSize={site.pagination?.problems || 100}
          />
        )}{" "}
        {page === "problem-create" && isAdmin && (
          <ProblemCreatePage
            error={setError}
            cancel={() => go("problems")}
            done={(problem) => {
              load();
              if (problem.question_type === "programming") {
                history.pushState({}, "", `/problems/${encodeURIComponent(problem.id)}/tests`);
                setTestProblemId(problem.id);
                setPage("problem-tests");
                scrollTo({ top: 0, left: 0, behavior: "auto" });
              } else {
                open(problem);
              }
            }}
          />
        )}{" "}
        {page === "problem-tests" && isAdmin && testProblemId && (
          <ProblemTestsPage
            id={testProblemId}
            error={setError}
            cancel={() => go("problems")}
            done={(problem) => {
              load();
              open(problem);
            }}
          />
        )}{" "}
        {page === "contests" && (
          <ContestsPage user={user} problems={problems} error={setError} openProblem={open} createContest={() => go("contest-create")} />
        )}{" "}
        {page === "contest-create" && isAdmin && (
          <section className="page contest-create-page">
            <div className="page-title contest-create-title">
              <span className="kicker">CONTEST ADMINISTRATION</span>
              <h1>创建比赛</h1>
              <p>配置比赛基础信息、赛制阶段与题目分类。</p>
            </div>
            <AdminPage mode="contests" standaloneContest problems={problems} reload={load} error={setError} onContestSaved={() => go("contests")} />
          </section>
        )}{" "}
        {page === "training" && (
          <LearningPage kind="training" user={user} problems={problems} openProblem={open} error={setError} />
        )}{" "}
        {page === "homework" && (
          <LearningPage kind="homework" user={user} problems={problems} openProblem={open} error={setError} />
        )}{" "}
        {page === "ranking" && <RankingPage openProfile={openProfile} />}{" "}
        {page === "certifications" && user && <CertificationPage user={user} error={setError} go={go} />}{" "}
        {page === "certification-create" && (user && isAdmin
          ? <CertificationPage key="issue-certification" user={user} error={setError} go={go} issuing />
          : <section className="page"><h1>发起认证</h1><p>{user ? "需要管理员权限" : "请先登录"}</p><button className="plain" onClick={() => user ? go("home") : setAuthOpen(true)}>{user ? "返回首页" : "登录"}</button></section>)}{" "}
        {page === "certification-guide" && <CertificationGuidePage start={() => user ? go("certifications") : setAuthOpen(true)} />}{" "}
        {page === "records" && (recordId ? <SubmissionPage id={recordId} back={() => go("records")} /> : <RecordsPage />)}{" "}
        {page === "discuss" && (
          <DiscussPage
            user={user}
            login={() => setAuthOpen(true)}
            error={setError}
          />
        )}{" "}
        {page === "settings" && user?.role === "root" && adminVerified && (
          <ControlPanel
            user={user}
            problems={problems}
            reload={load}
            error={setError}
            createProblem={() => go("problem-create")}
            changed={(v) => {
              setSite(v);
              document.title = v.name;
            }}
          />
        )}{" "}
        {/* The domain page itself decides what to show from the domain permissions. */}
        {page === "domains" && user && (
          <DomainsPage user={user} error={setError} changed={() => api.site().then(setSite).catch(() => {})} />
        )}{" "}
        {page === "account" && user && <AccountPage user={user} changed={setUser} error={setError} liquidGlass={liquidGlass} setLiquidGlass={setLiquidGlass} compatibility={compatibility} glassTransparency={glassTransparency} setGlassTransparency={setGlassTransparency} glassRefraction={glassRefraction} setGlassRefraction={setGlassRefraction} mascot={mascot} setMascot={setMascot} />}{" "}
        {page === "customize" && user && <CustomizePage user={user} changed={setUser} error={setError} />}{" "}
        {page === "ai-assistant" && (user ? <AiAssistantPage user={user} error={setError} /> : <section className="page"><div className="settings-panel ai-login-prompt"><Sparkles /><h1>AI 助手</h1><p>登录后即可使用 AI 助手。</p><button className="primary" onClick={() => setAuthOpen(true)}><LogIn />登录</button></div></section>)}{" "}
        {page === "messages" && user && <MessagesPage error={setError} unreadChanged={setUnread} />}{" "}
        {page === "blog" && <BlogPage key={location.pathname} user={user} error={setError} />}{" "}
        {page === "moments" && <MomentsPage user={user} error={setError} onRequestsChange={setFriendRequests} />}{" "}
        {page === "files" && user && <FilesPage error={setError} />}{" "}
        {page === "profile" && profileId > 0 && <ProfilePage id={profileId} error={setError} />}{" "}

        {page === "about" && <AboutPage error={setError} />}{" "}
        {page === "license" && <LicensePage error={setError} />}{" "}

        {["queue", "status", "compatibility"].includes(page) && (
          <OperationsPage kind={page as "queue" | "status" | "compatibility"} />
        )}{" "}
        {/* Exactly one call component per page: ringing is owned here so the chat header can never
            send a second offer while another one is still pending. */}
        {user && page !== "video-call" && <VideoCall me={user} peer={null} report={setError} />}
        {page === "video-call" && user && <VideoCallPage me={user} peerId={profileId} report={setError} />}
        {page === "problem" && selected && (
          <ProblemPage
            problem={selected}
            contestId={selectedContestId}
            user={user}
            login={() => setAuthOpen(true)}
            back={() => selectedContestId ? (() => { history.pushState({}, "", `/contests/${selectedContestId}`); setPage("contests"); setSelectedContestId(undefined); scrollTo({ top: 0, left: 0, behavior: "auto" }); })() : go("problems")}
            refresh={load}
          />
        )}
      </main>
      {user?.custom_css && <style data-user-custom-css dangerouslySetInnerHTML={{ __html: user.custom_css }} />}
      {(user?.custom_html || user?.custom_head || user?.custom_script) && <CustomHtml html={`${user?.custom_head || ""}${user?.custom_html || ""}${user?.custom_script ? `<script>${user.custom_script}</script>` : ""}`} />}
      <footer>
        <span className="footer-nav">
          <button onClick={() => go("queue")}>评测队列</button>
          <button onClick={() => go("status")}>服务状态</button>
          <button type="button" className={`footer-compat-switch ${compatibility ? "active" : ""}`} role="switch" aria-checked={compatibility} onClick={toggleCompatibility}><i aria-hidden="true" />兼容模式</button>
          <button onClick={() => go("compatibility")}>兼容说明</button>
          <button onClick={() => go("about")}>关于</button>
          <button onClick={() => go("license")}>许可证</button>
        </span>
        <span>
          Powered by ©2025-2026{" "}
          <a href="https://github.com/BrightWeb-Dev-Team" target="_blank">
            BrightWeb Dev Team
          </a>
        </span>
        <span>
          <a
            href="https://github.com/BrightWeb-Dev-Team/InfiniteJudge"
            target="_blank"
          >
            InfiniteJudge v{communityVersion.replace(/^v/i, "")} Professional
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
      {announcementOpen && <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setAnnouncementOpen(false)}><section className="announcement-modal"><button className="modal-close" onClick={() => setAnnouncementOpen(false)}><X /></button><span className="kicker">SITE ANNOUNCEMENT</span><h2>关于本站</h2><div className="announcement-modal-body"><Markdown>{site.domainAnnouncement}</Markdown></div><label className="toggle-line"><input type="checkbox" checked={announcementDismiss} onChange={(e) => setAnnouncementDismiss(e.target.checked)} />下次不再弹出</label><button className="primary" onClick={() => { localStorage.setItem("ij-dismissed-announcement", `${site.announcementStartsAt || ""}|${site.announcementEndsAt || ""}|${site.domainAnnouncement || ""}`); setAnnouncementOpen(false); }}>关闭且不再弹出</button></section></div>}
      {tagManagerOpen && <TagManager close={() => setTagManagerOpen(false)} error={setError} />}
      {banManagerOpen && user?.role === "root" && <BanManager user={user} onClose={() => setBanManagerOpen(false)} error={setError} />}
      {switchUserOpen && user?.role === "root" && <SwitchUserModal user={user} close={() => setSwitchUserOpen(false)} />}
      {adminVerifyOpen && user?.role === "root" && (
        <AdminVerifyModal
          close={() => {
            setAdminVerifyOpen(false);
            if (page === "settings") go("home");
          }}
          done={(expiresAt, token) => {
            setAdminVerified(true);
            if (token) sessionStorage.setItem("ij-admin-verification", token);
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
function SwitchUserModal({ user, close }: { user: User; close: () => void }) {
  const [users, setUsers] = useState<User[]>([]),
    [targetUid, setTargetUid] = useState(""),
    [verified, setVerified] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const target = useUserLookup(targetUid);
  useEffect(() => {
    api.adminVerification().then(() => setVerified(true)).catch(() => setVerified(false));
    api.adminUsers().then(setUsers).catch((err) => setError(err.message));
  }, []);
  // The secondary verification only lives in the server's memory, so a restart (or the
  // 4-hour expiry) turns it stale; remember the requested switch and finish it once the
  // admin has confirmed their identity again.
  const pendingUid = useRef<number | null>(null);
  const suspendVerification = (uid: number) => {
    sessionStorage.removeItem("ij-admin-verification");
    sessionStorage.removeItem("ij-admin-verification-expires");
    pendingUid.current = uid;
    setVerified(false);
  };
  const performSwitch = async (uid: number) => {
    setBusy(true);
    setError("");
    try {
      try { await api.adminVerification(); }
      catch { setBusy(false); suspendVerification(uid); return; }
      const result = await api.switchUser(uid);
      localStorage.setItem("ij-token", result.token);
      localStorage.removeItem("ij-domain-id");
      sessionStorage.removeItem("ij-admin-verification");
      sessionStorage.removeItem("ij-admin-verification-expires");
      window.location.replace("/");
    } catch (err: any) {
      if (err?.code === "ADMIN_REVERIFY") { setBusy(false); suspendVerification(uid); return; }
      setError(err.message);
      setBusy(false);
    }
  };
  const resumeSwitch = () => {
    const uid = pendingUid.current;
    if (uid === null) return;
    pendingUid.current = null;
    void performSwitch(uid);
  };
  if (verified === false) return <AdminVerifyModal close={close} done={(expiresAt, token) => {
    if (token) sessionStorage.setItem("ij-admin-verification", token);
    sessionStorage.setItem("ij-admin-verification-expires", String(expiresAt));
    setVerified(true);
    resumeSwitch();
  }} />;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !verified || !target.user) return;
    const uid = Number(targetUid);
    if (!Number.isSafeInteger(uid) || uid < 1) return setError("请输入有效的用户 UID");
    if (uid === user.id) return setError("已经是当前用户");
    void performSwitch(uid);
  };
  return <div className="modal-bg">
    <form className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="switch-user-title" onSubmit={submit}>
      <button type="button" className="modal-close" title="关闭" aria-label="关闭" disabled={busy} onClick={close}><X /></button>
      <span className="brand-mark"><UserRoundCog /></span>
      <h2 id="switch-user-title">切换用户</h2>
      <label htmlFor="switch-user-uid">用户 UID
        <input id="switch-user-uid" list="switch-user-options" inputMode="numeric" pattern="[0-9]+" required autoFocus placeholder="输入或选择 UID" value={targetUid} onChange={(event) => setTargetUid(event.target.value)} disabled={busy || !verified} />
      </label>
      <datalist id="switch-user-options">
        {users.filter((entry) => entry.id !== user.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.username}</option>)}
      </datalist>
      <UserLookupPreview {...target} />
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary" disabled={busy || !verified || !target.user}><UserRoundCog />{verified === null ? "验证中..." : busy ? "切换中..." : "切换用户"}</button>
    </form>
  </div>;
}
function TagManager({ close, error }: { close: () => void; error: (s: string) => void }) {
  const [tags, setTags] = useState<any[]>([]), [users, setUsers] = useState<any[]>([]), [label, setLabel] = useState(""), [color, setColor] = useState("#b08c00"), [scope, setScope] = useState<"global" | "personal">("personal"), [busy, setBusy] = useState(false), [targetUid, setTargetUid] = useState(""), [selectedTag, setSelectedTag] = useState("-1");
  const load = () => Promise.all([api.adminTags(), api.tagUsers()]).then(([t, u]) => { setTags(t); setUsers(u); }).catch((e) => error(e.message));
  useEffect(() => { void load(); }, []);
  const create = async (e: React.FormEvent) => { e.preventDefault(); try { await api.createTag({ label, color, scope }); setLabel(""); await load(); } catch (e: any) { error(e.message); } };
  const toggle = async (user: any, tagId: number) => { if (busy) return; const ids = user.tag_ids.includes(tagId) ? user.tag_ids.filter((x: number) => x !== tagId) : [...user.tag_ids, tagId]; setBusy(true); try { await api.updateUserTags(user.id, ids); await load(); } catch (e: any) { error(e.message); } finally { setBusy(false); } };
  const assign = async (e: React.FormEvent) => { e.preventDefault(); const uid = Number(targetUid), tagId = Number(selectedTag); const user = users.find((u) => u.id === uid); if (!Number.isInteger(uid) || !user) return error("请输入有效的用户 UID"); if (tagId !== -1 && !tags.some((t) => t.id === tagId)) return error("请选择有效的 Tag"); await toggle(user, tagId); };
  return <div className="modal-bg"><section className="announcement-modal tag-manager"><button className="modal-close" type="button" onClick={close}><X /></button><h2>Tag 管理</h2><form className="tag-create" onSubmit={create}><input required maxLength={24} placeholder="Tag 文字" value={label} onChange={(e) => setLabel(e.target.value)} /><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /><select value={scope} onChange={(e) => setScope(e.target.value as any)} aria-label="标签范围"><option value="personal">指定用户</option><option value="global">全体用户</option></select><button className="primary"><Plus />新增</button></form><form className="tag-create" onSubmit={assign}><input required inputMode="numeric" pattern="[0-9]+" placeholder="输入用户 UID" value={targetUid} onChange={(e) => setTargetUid(e.target.value)} /><select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)} aria-label="选择标签"><option value="-1">作弊者</option>{tags.filter((tag) => !tag.builtin && tag.scope !== "global").map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}</select><button className="primary" disabled={busy}><Plus />分配 / 取消</button></form><div className="tag-catalog">{tags.map((tag) => <span key={`${tag.id}-${tag.label}`} className="user-custom-tag" style={{ backgroundColor: tag.color }}>{tag.label}{tag.scope === "global" ? " · 全体" : ""}{!tag.builtin && <button type="button" onClick={async () => { try { await api.deleteTag(tag.id); await load(); } catch (e: any) { error(e.message); } }}>×</button>}</span>)}</div><div className="tag-user-list">{users.map((u) => <div key={u.id}><b>UID {u.id} · {u.username}</b><div>{u.tag_ids.filter((id: number) => id === -1 || tags.some((t) => t.id === id)).map((id: number) => { const tag = id === -1 ? { label: "作弊者", color: "#b08c00" } : tags.find((t) => t.id === id); return <span key={id} className={id === -1 ? "cheater-tag" : "user-custom-tag"} style={id === -1 ? undefined : { backgroundColor: tag?.color }}>{tag?.label}</span>; })}</div></div>)}</div></section></div>;
}
function CertificationPage({ user, error, go, issuing = false }: { user: User; error: (s: string) => void; go: (page: "certifications" | "certification-create") => void; issuing?: boolean }) {
  const admin = user.role === "admin" || user.role === "root";
  const [manage, setManage] = useState(admin);
  const [targetUid, setTargetUid] = useState(""), [submitting, setSubmitting] = useState(false);
  const target = useUserLookup(manage && issuing ? targetUid : "");
  const [items,setItems]=useState<any[]>([]), [form,setForm]=useState({kind:"programming",title:"OI 赛事认证",displayText:"",description:"",color:"#d99a00"});
  const [editingKind,setEditingKind]=useState<string|null>(null);
  const load=()=> (admin&&manage?api.adminCertifications():api.certifications()).then(setItems).catch((e)=>error(e.message));
  useEffect(()=>{if(!issuing)void load();},[manage,issuing]);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(submitting||(manage&&!target.user))return;
    const userId=Number(targetUid);
    if(manage&&(!Number.isSafeInteger(userId)||userId<1))return error("请输入有效的用户 UID");
    setSubmitting(true);
    try{
      const result=await api.applyCertification({...form,...(manage?{userId}:{})});
      setEditingKind(null);setTargetUid("");
      if(issuing)go("certifications");else await load();
      error(result.status==="approved"?"认证信息已直接生效":"认证信息已提交审核");
    }catch(e:any){error(e.message);}finally{setSubmitting(false);}
  };
  const edit=(item:any)=>{setEditingKind(item.kind);setForm({kind:item.kind,title:item.title,displayText:item.display_text||"",description:item.description||"",color:item.color});window.scrollTo({top:0,behavior:"smooth"});};
  return <section className="page certification-page">
    <div className="page-title"><div><span className="kicker">VERIFICATION</span><h1>{issuing?"发起认证":manage?"管理认证":"认证中心"}</h1>{!issuing&&<p>{manage?"审核、撤销用户认证。":admin?"管理员的认证新建或修改后直接生效。":"申请或修改认证后需要管理员审核。"}</p>}</div>{issuing?<button className="plain" disabled={submitting} onClick={()=>go("certifications")}><ArrowLeft/>返回管理认证</button>:admin&&<div className="cert-actions">{manage&&<button className="primary" disabled={submitting} onClick={()=>go("certification-create")}><Plus/>发起认证</button>}<button className="plain" disabled={submitting} onClick={()=>{setManage(!manage);setEditingKind(null);}}>{manage?"我的认证":"返回审批"}</button></div>}</div>
    {(!manage||issuing)&&<form className="cert-form" onSubmit={submit}>
      {manage&&<label>用户 UID<input required inputMode="numeric" pattern="[0-9]+" placeholder="输入用户 UID" value={targetUid} onChange={(e)=>setTargetUid(e.target.value)} disabled={submitting}/></label>}
      {manage&&<UserLookupPreview {...target} />}
      <select disabled={editingKind!==null} value={form.kind+"|"+form.color+"|"+form.title} onChange={(e)=>{const [kind,color,title]=e.target.value.split("|");setForm({...form,kind,color,title});}}><option value="programming|#d99a00|OI 赛事认证">OI 赛事认证</option><option value="programming|#2daa75|ACM/ICPC 认证">ACM/ICPC 认证</option><option value="personal|#d34b4b|个人认证">个人认证</option><option value="personal|#6b4bbd|管理员认证">管理员认证</option></select>
      {user.role === "root" && <label className="cert-color">认证颜色<input type="color" value={form.color} onChange={(e)=>setForm({...form,color:e.target.value})}/></label>}
      <input required maxLength={80} placeholder="认证名称，如 bilibili 个人认证" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/>
      <input required maxLength={120} placeholder="认证展示文本，如 bilibili 创始人（站长）" value={form.displayText} onChange={(e)=>setForm({...form,displayText:e.target.value})}/>
      <textarea maxLength={2000} placeholder="证明材料或说明（不会展示在个人主页）" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/>
      <div className="cert-form-actions"><button className="primary" disabled={submitting||(manage&&!target.user)}><ShieldCheck/>{submitting?"提交中...":manage?"发起认证":editingKind?"保存修改":admin?"添加认证":"申请认证"}</button>{(editingKind||issuing)&&<button type="button" className="plain" disabled={submitting} onClick={()=>issuing?go("certifications"):setEditingKind(null)}>{issuing?"取消":"取消编辑"}</button>}</div>
    </form>}
    {!issuing&&<div className="cert-list">{items.map(x=><article key={x.id}><div><b>{x.username||x.title}</b>{x.username&&<span>{x.title}</span>}<p className="cert-display-text">{x.display_text||"未设置展示文本"}</p><p>{x.description||"暂无证明材料或说明"}</p></div><span className="verification-badge" style={{color:x.color}}><BadgeCheck/> {x.status==="approved"?"已认证":x.status==="pending"?"待审核":x.status==="revoked"?"已撤销":"未通过"}</span>{manage&&admin?<div className="cert-actions">{x.status!=="approved"&&<button className="primary" onClick={async()=>{await api.reviewCertification(x.id,"approved");load();}}>同意</button>}<button className="plain" onClick={async()=>{await api.reviewCertification(x.id,x.status==="approved"?"revoked":"rejected");load();}}>{x.status==="approved"?"撤销":"拒绝"}</button></div>:<button className="plain" onClick={()=>edit(x)}>编辑</button>}</article>)}</div>}
  </section>;
}
function CertificationGuidePage({ start }: { start: () => void }) {
  return <section className="page certification-guide">
    <div className="cert-guide-hero"><span className="kicker">VERIFICATION GUIDE</span><h1>认证说明</h1><p>Infinite Judge 通过认证标识帮助社区识别用户的程序设计经历和公开身份信息。认证仅表明已提交的特定信息通过审核，不代表平台对用户其他行为或观点背书。</p><button className="primary" onClick={start}><ShieldCheck />申请或管理认证</button></div>
    <div className="cert-guide-layout">
      <nav className="cert-guide-nav" aria-label="认证说明目录"><a href="#types">认证类型</a><a href="#requirements">申请要求</a><a href="#process">认证流程</a><a href="#display">展示与修改</a><a href="#privacy">材料与隐私</a><a className="danger" href="#integrity">真实性与责任</a></nav>
      <article className="cert-guide-content">
        <section id="types"><h2>认证类型</h2><h3>程序设计能力认证</h3><p>用于展示 OI、ACM/ICPC 等程序设计竞赛或算法学习经历。申请时请说明经历、成绩或奖项，并提供能够核验归属的材料。</p><h3>个人身份认证</h3><p>用于展示与社区、学校、团队、项目或公开职务有关的身份。认证文本应准确、克制，不得制造容易误解的夸大表述。</p></section>
        <section id="requirements"><h2>申请要求</h2><ul><li>认证信息必须属于申请者本人，且在申请时仍然准确。</li><li>认证名称应概括认证类别，展示文本应简洁说明已核验的身份或经历。</li><li>证明材料需要清晰、完整，并能同时对应申请者与申请内容。</li><li>如信息发生变化，请及时编辑认证并重新提交。</li></ul></section>
        <section id="process"><h2>认证流程</h2><ol><li>进入认证中心，选择认证类型。</li><li>填写认证名称、公开展示文本和仅供审核的证明说明。</li><li>普通用户提交后进入人工审核；管理员会根据材料核对申请内容。</li><li>审核通过后，认证标识和文本将在排行榜与个人主页展示。</li></ol></section>
        <section id="display"><h2>展示与修改</h2><p>将鼠标停留在用户名旁的认证图标上，可查看完整认证名称和展示文本。点击图标可随时返回本说明页。</p><p>普通用户修改已通过的认证后，新内容需要重新审核；管理员的认证修改后直接生效。平台可在信息失效、存疑或违反规则时撤销认证。</p></section>
        <section id="privacy"><h2>材料与隐私</h2><p>申请页中的“证明材料或说明”仅用于认证审核，不会作为公开认证文本展示。请只提供完成核验所必需的信息，并对身份证件号码、住址等无关敏感信息进行遮挡。</p></section>
        <section id="integrity" className="cert-integrity"><h2>真实性与责任</h2><p><strong>严禁伪造材料、冒用他人身份、虚构奖项或职务，也不得通过剪辑、遮挡或误导性表述影响审核判断。</strong></p><p>一经发现虚假认证，平台将立即撤销相关认证，并可对账号采取限制功能、禁言、暂停或永久封禁等处置。对多次伪造、有组织欺骗、侵害他人权益或涉嫌违法的情形，平台将保留固定证据、向相关方通报并依法追究责任的权利。</p></section>
      </article>
    </div>
  </section>;
}
function VideoCallPage({ me, peerId, report }: { me: User; peerId: number; report: (message: string) => void }) {
  const [peer, setPeer] = useState<User | null>(null);
  const [calling, setCalling] = useState(false);
  useEffect(() => { const end = () => { setCalling(false); leaveCall("ended"); }; window.addEventListener(CALL_ENDED, end); return () => window.removeEventListener(CALL_ENDED, end); }, [peerId]);
  const startOutgoing = (target: User) => { setCalling(true); startCall({ uid: target.id, name: target.username, avatar: target.avatar }); };
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => { if (peerId) api.userProfile(peerId).then(setPeer).catch(() => {}); }, [peerId]);
  useEffect(() => { if (!peerId) return; let stopped = false; const poll = () => api.userPresence(peerId).then((value) => { if (!stopped) setOnline(value.online); }).catch(() => {}).finally(() => { if (!stopped) window.setTimeout(poll, 15000); }); void poll(); return () => { stopped = true; }; }, [peerId]);
  const leaveCall = async (reason: "ended" | "offline") => {
    if (reason === "offline") await api.sendMessage({ recipientId: peerId, content: "系统提示：对方当前不在线，视频通话未接通。" }).catch(() => {});
    history.pushState({}, "", "/messages");
    dispatchEvent(new PopStateEvent("popstate"));
  };
  return <section className="page video-call-page"><div className="page-title"><div><span className="kicker">VIDEO CALL</span><h1>视频通话</h1><p>与 {peer?.username || `UID ${peerId}`} 进行视频通话。</p></div><div className="video-presence"><i className={online ? "online" : "offline"} />{online === null ? "检查中" : online ? "在线" : "不在线"}<button className="plain" onClick={() => history.back()}>返回消息</button></div></div><div className="video-call-stage">{peer ? <button className="primary" onClick={() => startOutgoing(peer)}><Video />{calling ? "正在呼叫…" : "开始视频通话"}</button> : <p>正在加载对方资料…</p>}</div></section>;
}
function AdminVerifyModal({
  close,
  done,
}: {
  close: () => void;
  done: (expiresAt: number, token?: string) => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState<"password" | "passkey">("password");
  const passkeyVerify=async()=>{setBusy(true);setError("");try{const {options,ceremony}=await api.adminPasskeyOptions();const response=await startAuthentication({optionsJSON:options});const result=await api.verifyAdminPasskey(ceremony,response);done(result.expiresAt,result.token);}catch(e:any){if(!String(e.message||"").includes("尚未设置"))setError(e.name==="NotAllowedError"?"已取消通行密钥验证，可使用密码继续":e.message);}finally{setBusy(false);}};
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
            done(result.expiresAt, result.token);
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
        <h2>确认管理员身份</h2>
        <p>选择密码或通行密钥其中一种方式确认身份。确认结果在 4 小时后失效。</p>
        <div className="auth-methods"><button type="button" className={method === "password" ? "active" : ""} onClick={() => setMethod("password")}>密码</button><button type="button" className={method === "passkey" ? "active" : ""} onClick={() => setMethod("passkey")}>通行密钥</button></div>
        {method === "password" && <label>
          管理员密码
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>}
        {error && <div className="form-error">{error}</div>}
        {method === "password" ? <button className="primary" disabled={busy}><ShieldCheck />{busy ? "确认中..." : "确认并进入"}</button> : <button type="button" className="primary" disabled={busy} onClick={passkeyVerify}><KeyRound />{busy ? "确认中..." : "使用通行密钥确认"}</button>}
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
    <div className="page-title discussion-title"><div><span className="kicker">{labels.kicker}</span><h1>{labels.title}</h1><p>{training ? "按计划组织题目，循序推进算法训练。" : "集中查看题目要求与截止时间，按时完成作业。"}</p></div>{(user?.role === "admin" || user?.role === "root") && <button className="primary" onClick={() => { setForm({ ...blank }); setSelected(null); }}><Plus />{labels.create}</button>}</div>
    {form ? <form className="learning-editor" onSubmit={save}><div className="learning-editor-head"><h2>{form.id ? `编辑${labels.title}` : labels.create}</h2><button type="button" className="icon-btn" onClick={() => setForm(null)}><X /></button></div><div className="form-grid"><label>标题<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>{training ? "开始时间（可选）" : "发布时间（可选）"}<WheelDateTime optional value={form.starts_at || ""} onChange={(value) => setForm({ ...form, starts_at: value })} /></label><label>结束/截止时间（可选）<WheelDateTime optional value={form.ends_at || ""} onChange={(value) => setForm({ ...form, ends_at: value })} /></label></div><label>说明（Markdown）<textarea rows={7} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} onKeyDown={(e) => handleEditorTab(e, form.description, (next) => setForm({ ...form, description: next }))} /></label><fieldset><legend>选择题目</legend><div className="learning-picker">{problems.map((p) => <label key={p.id}><input type="checkbox" checked={form.problems.includes(p.id)} onChange={(e) => setForm({ ...form, problems: e.target.checked ? [...form.problems, p.id] : form.problems.filter((id: string) => id !== p.id) })} /><span><b>{p.id}</b>{p.title}</span></label>)}</div></fieldset><div className="form-actions"><button className="primary"><Check />保存</button>{form.id && <button type="button" className="danger" onClick={() => remove(form.id)}><Trash2 />删除</button>}</div></form>
    : selected ? <div className="learning-detail"><button className="text-btn" onClick={() => setSelected(null)}><ArrowLeft />返回列表</button><div className="learning-detail-head"><div><span className="tag">{status(selected)}</span><h2>{selected.title}</h2><p>创建者：{selected.creator}</p></div>{(user?.role === "admin" || user?.role === "root") && <button className="plain" onClick={() => edit(selected.id)}>编辑</button>}</div>{selected.starts_at && <p className="learning-time"><Clock />开始：{new Date(selected.starts_at).toLocaleString()}</p>}{selected.ends_at && <p className="learning-time"><Clock />{training ? "结束" : "截止"}：{new Date(selected.ends_at).toLocaleString()}</p>}<RichMarkdown>{selected.description || "暂无说明"}</RichMarkdown><h3>题目列表</h3><div className="contest-problems">{selected.problems.length ? selected.problems.map((entry: any, index: number) => { const problem = problems.find((p) => p.id === entry.id); return <button key={entry.id} onClick={() => problem && openProblem(problem)}><b>{index + 1}</b><span>{entry.id} {entry.title}</span><ChevronRight /></button>; }) : <div className="empty">暂未添加题目</div>}</div></div>
    : items.length ? <div className="learning-list">{items.map((item) => <article key={item.id} onClick={() => show(item.id)}><div><span className="tag">{status(item)}</span><h2>{item.title}</h2><p>{item.description || "暂无说明"}</p></div><div className="learning-meta">{item.ends_at && <span><Clock />{training ? "结束" : "截止"} {new Date(item.ends_at).toLocaleString()}</span>}<span>{item.creator}</span><ChevronRight /></div></article>)}</div>
    : <div className="large-empty"><BookOpen /><p>{labels.empty}</p>{user?.role !== "admin" && <small>管理员创建后会显示在这里。</small>}</div>}
  </section>;
}
function RankingPage({ openProfile }: { openProfile: (id: number) => void }) {
  return <section className="page"><div className="page-title"><span className="kicker">RATING</span><h1>RP 排行榜</h1><p>由固定 RP 与刷题浮动 RP 组成；越早通过、该题通过人数越少，获得的浮动 RP 越高。</p></div><RpRanking openProfile={openProfile} /></section>;
}
function RpRanking({ compact = false, openProfile }: { compact?: boolean; openProfile: (id: number) => void }) {
  const [rows, setRows] = useState<any[]>([]); useEffect(() => { api.ranking().then(setRows).catch(() => {}); }, []);
  const guide=(event:React.MouseEvent|React.KeyboardEvent)=>{event.stopPropagation();history.pushState({},"","/certifications/guide");dispatchEvent(new PopStateEvent("popstate"));};
  return <div className={compact ? "rp-board compact" : "rp-board"}><div className="rp-head"><span>排名</span><span>用户</span><span>通过</span><span>RP</span></div>{rows.slice(0, compact ? 8 : 100).map((row, index) => <div role="button" tabIndex={0} className="rp-row" key={row.id} onClick={() => openProfile(row.id)} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openProfile(row.id);}}}><b>{index + 1}</b><span className="rp-user">{row.avatar ? <img src={row.avatar} /> : <i>{row.username[0].toUpperCase()}</i>}<span className="rp-name">{row.username}</span>{row.certifications?.map((cert: any) => <button type="button" key={cert.id} className="verification-icon certification-link" style={{color:cert.color}} data-certification={`${cert.title}\n${cert.display_text||"已通过认证"}`} aria-label={`${cert.title}：${cert.display_text||"已通过认证"}，点击查看认证说明`} onKeyDown={(e)=>e.stopPropagation()} onClick={guide}><BadgeCheck/></button>)}{row.tags?.map((tag: any) => <em key={tag.id} className="user-custom-tag" style={{ backgroundColor: tag.color }}>{tag.label}</em>)}{row.cheater ? <em className="cheater-tag">作弊者</em> : null}</span><span>{row.solved}</span><strong>{row.rp}</strong></div>)}</div>;
}
function Hitokoto() {
  const [quote, setQuote] = useState({ text: "正在获取一言...", from: "", url: "https://hitokoto.cn" });
  useEffect(() => { api.hitokoto().then(setQuote).catch(() => setQuote({ text: "我之所以想变强，是为了活得轻松写意。", from: "Infinite Judge", url: "https://hitokoto.cn" })); }, []);
  return <section className="hitokoto"><h2>一言</h2><blockquote>{quote.text}</blockquote>{quote.from && <cite>— {quote.from}</cite>}</section>;
}
function AboutPage({ error }: { error: (message: string) => void }) {
  const [about, setAbout] = useState<{ content: string; version: string; name: string } | null>(null);
  useEffect(() => { api.about().then(setAbout).catch((e) => error(e.message)); }, []);
  if (!about) return <section className="page setup-loading">正在加载关于页面...</section>;
  const content = about.content || `# 关于 ${about.name}\n\n${about.name} 是一个在线评测与算法训练平台。`;
  const version = about.version.replace(/^v/i, "");
  return <section className="page about-page">
    <header className="about-header"><div><span className="kicker">ABOUT</span><h1>{about.name}</h1><p>在线评测、算法训练与竞赛管理平台</p></div><span className="about-version">InfiniteJudge v{version} Professional</span></header>
    <article className="about-content"><RichMarkdown>{content}</RichMarkdown></article>
  </section>;
}
function LicensePage({ error }: { error: (message: string) => void }) {
  const [license, setLicense] = useState<{ content: string; name: string } | null>(null);
  useEffect(() => { api.license().then(setLicense).catch((e) => error(e.message)); }, []);
  if (!license) return <section className="page setup-loading">正在加载许可证...</section>;
  return <section className="page legal-page">
    <header className="legal-header"><span className="kicker">LICENSE</span><h1>{license.name}</h1><p>版本 1.0 · 2026 年</p></header>
    <article className="legal-document">{license.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>
  </section>;
}
function OperationsPage({
  kind,
}: {
  kind: "queue" | "status" | "compatibility";
}) {
  const [health, setHealth] = useState<any>(null),
    [rows, setRows] = useState<Submission[]>([]),
    [compatibility, setCompatibility] = useState(() => localStorage.getItem("ij-compatibility-mode") === "1");
  const toggleCompatibility = () => { const next = !compatibility; setCompatibility(next); localStorage.setItem("ij-compatibility-mode", next ? "1" : "0"); document.documentElement.toggleAttribute("data-compatibility", next); window.dispatchEvent(new CustomEvent("ij-compatibility-change", { detail: next })); };
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
                  <td><a className="submission-id-link" href={`/records/${r.id}`} onClick={(event) => { event.preventDefault(); history.pushState({}, "", `/records/${r.id}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>#{r.id}</a></td>
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
          <><div className="service-grid">
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
          </div><div className="server-list"><div className="server-list-title"><Activity /><b>Servers</b><span>{health?.servers?.length ?? 0} 台在线</span></div><table><thead><tr><th>ID</th><th>当前状态</th><th>系统信息</th><th>CPU 信息</th><th>内存信息</th><th>Handled requests</th><th>运行时间</th></tr></thead><tbody>{health?.servers?.map((server: any) => <tr key={server.id}><td><code>{server.id}</code></td><td><span className="server-online"><i />{server.status}</span></td><td>{server.system}</td><td>{server.cpu}</td><td>{(server.memory_used / 1073741824).toFixed(1)} GiB / {(server.memory_total / 1073741824).toFixed(1)} GiB</td><td>{server.handled_requests}</td><td>{Math.floor(server.uptime / 86400)}天 {Math.floor(server.uptime % 86400 / 3600)}小时 {Math.floor(server.uptime % 3600 / 60)}分</td></tr>) || <tr><td colSpan={7}>正在读取服务器信息...</td></tr>}</tbody></table></div></>
        )}
        {kind === "compatibility" && (
          <div className="compat-list">
            <section className="compat-toggle"><Activity /><div><b>老浏览器兼容模式</b><p>关闭流星雨、动画、过渡、背景模糊和透明玻璃效果，降低图形性能要求。</p></div><button type="button" className={compatibility ? "primary" : "plain"} onClick={toggleCompatibility}>{compatibility ? "已开启 · 点击关闭" : "开启兼容模式"}</button></section>
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
    [nativeShell] = useState(() => Boolean((window as any).ChatNative)),
    [loginMethod, setLoginMethod] = useState<"password" | "passkey">("password"),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [emailVerification, setEmailVerification] = useState(false),
    [auth0Enabled, setAuth0Enabled] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => { api.authConfig().then((value) => { setEmailVerification(value.emailVerification); setAuth0Enabled(Boolean(value.auth0?.enabled)); }).catch(() => {}); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let r;
      if(mode==="login") {
        if (loginMethod === "password") r = await api.login(name,password);
        else { const {options,ceremony}=await api.passkeyLoginOptions(name); const response=await startAuthentication({optionsJSON:options}); r=await api.passkeyLogin(ceremony,response); }
      } else r=await api.register(name,password,email,code);
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
        {mode === "login" && !nativeShell && <div className="auth-methods"><button type="button" className={loginMethod === "password" ? "active" : ""} onClick={() => setLoginMethod("password")}>密码登录</button><button type="button" className={loginMethod === "passkey" ? "active" : ""} onClick={() => setLoginMethod("passkey")}>通行密钥登录</button></div>}
        <label>
          用户名
          <input
            autoFocus
            required
            minLength={3}
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="3-24 个中文、字母、数字或下划线字符"
          />
        </label>
        {(mode === "register" || loginMethod === "password" || nativeShell) && <label>
          密码
          <input
            required={mode === "register" || loginMethod === "password" || nativeShell}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 8 位"
          />
        </label>}
        {mode === "register" && emailVerification && <>
          <label>邮箱<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>验证码<div className="email-code-row"><input required value={code} onChange={(e) => setCode(e.target.value)} /><button type="button" className="plain" onClick={async () => { try { await api.sendEmailCode(email); setError("验证码已发送"); } catch (e: any) { setError(e.message); } }}>发送验证码</button></div></label>
        </>}
        {error && <div className="form-error">{error}</div>}
        {mode === "login" && auth0Enabled && !nativeShell && <button type="button" className="plain oauth-button" disabled={busy} onClick={() => { location.href = "/api/auth/auth0/start"; }}>使用 Auth0 统一登录</button>}
        <button className="primary" disabled={busy}>
          {busy ? "请稍候..." : mode === "login" ? loginMethod === "password" || nativeShell ? "使用密码登录" : "使用通行密钥登录" : "注册"}
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
// User-supplied HTML/JS runs in a sandboxed frame without same-origin access, so hosting a
// hostile custom_head can no longer read the visitor's session token from this origin.
function CustomHtml({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;font:inherit;color:inherit;background:transparent;overflow:hidden}</style></head><body>${html}</body></html>`);
    doc.close();
    let frameId = 0;
    const measure = () => {
      const next = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0);
      setHeight((current) => current === next ? current : next);
      frameId = requestAnimationFrame(measure);
    };
    frameId = requestAnimationFrame(measure);
    return () => { cancelAnimationFrame(frameId); doc.open(); doc.write(""); doc.close(); };
  }, [html]);
  return <iframe className="user-custom-html" ref={ref} sandbox="allow-scripts" title="用户自定义内容" style={{ height: height ? `${height}px` : "auto" }} />;
}

function CustomizePage({ user, changed, error }: { user: User; changed: (value: User) => void; error: (message: string) => void }) {
  const [tab, setTab] = useState<"css" | "script" | "body" | "head">("css");
  const [css, setCss] = useState(user.custom_css || ""), [script, setScript] = useState(user.custom_script || ""), [body, setBody] = useState(user.custom_html || ""), [head, setHead] = useState(user.custom_head || ""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.customize().then((value) => {
      if (cancelled) return;
      setCss(value.custom_css); setScript(value.custom_script); setBody(value.custom_html); setHead(value.custom_head);
      changed({ ...user, ...value });
    }).catch((cause: Error) => { if (!cancelled) error(`无法从服务器读取自定义内容：${cause.message}`); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user.id]);
  const value = tab === "css" ? css : tab === "script" ? script : tab === "body" ? body : head;
  const update = (next: string) => tab === "css" ? setCss(next) : tab === "script" ? setScript(next) : tab === "body" ? setBody(next) : setHead(next);
  const save = async () => {
    setSaving(true);
    try {
      await api.updateCustomize({ custom_css: css, custom_script: script, custom_html: body, custom_head: head });
      const stored = await api.customize();
      setCss(stored.custom_css); setScript(stored.custom_script); setBody(stored.custom_html); setHead(stored.custom_head);
      changed({ ...user, ...stored }); error("自定义内容已保存到服务器");
    } catch (cause: any) { error(`服务器保存失败：${cause.message}`); }
    finally { setSaving(false); }
  };
  return <section className="page customize-simple"><div className="customize-panel"><nav className="customize-tabs">{[["css","自定义 CSS"],["script","自定义 Script"],["body","自定义 HTML (body)"],["head","自定义 HTML (head)"]].map(([id,label]) => <button type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id as any)} key={id}>{label}</button>)}</nav><div className="customize-editor-wrap"><div className="customize-gutter">{value.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea className="customize-editor" value={value} onChange={(event) => update(event.target.value)} disabled={loading} spellCheck={false} /></div><footer className="customize-actions"><button className="primary" type="button" onClick={save} disabled={loading || saving}><Save />{loading ? "读取中..." : saving ? "保存中..." : "保存"}</button><button className="plain" type="button" disabled={loading || saving} onClick={() => { setCss(user.custom_css || ""); setScript(user.custom_script || ""); setBody(user.custom_html || ""); setHead(user.custom_head || ""); }}>重置</button><span>版权区域由 InfiniteJudge 固定提供</span></footer></div></section>;
}

function HomePage({
  problems,
  announcement,
  carousel,
  carouselInterval,
  user,
  go,
  open,
  openProfile,
  error,
}: {
  problems: Problem[];
  announcement?: string;
  carousel?: SiteConfig["carousel"];
  carouselInterval?: number;
  user: User | null;
  go: (p: Exclude<Page, "problem" | "profile">) => void;
  open: (p: Problem) => void;
  openProfile: (id: number) => void;
  error: (s: string) => void;
}) {
  return (
    <section className="page hydro-layout home-dashboard">
      <div className="hydro-main">
        <section className="announcement">
          <Markdown>{announcement}</Markdown>
        </section>
        <section className="home-ranking"><div className="section-heading"><div><span className="kicker">RATING</span><h2>RP 排行榜</h2></div><button className="plain" onClick={() => go("ranking")}>查看全部<ChevronRight /></button></div><RpRanking compact openProfile={openProfile} /></section>
      </div>
      <aside className="hydro-side">
        <Carousel items={carousel} interval={carouselInterval} />
        <Hitokoto />
        <Countdown admin={(user?.role === "admin" || user?.role === "root")} error={error} />
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

function Carousel({ items, interval = 5 }: { items?: SiteConfig["carousel"]; interval?: number }) {
  const valid = (items || []).filter((item) => item?.image?.trim());
  const intervalMs = Math.max(1, Math.min(60, Number(interval) || 5)) * 1000;
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);
  useEffect(() => { if (valid.length < 2) return; const timer = window.setInterval(() => setIndex((value) => (value + 1) % valid.length), intervalMs); return () => window.clearInterval(timer); }, [valid.length, intervalMs]);
  if (!valid.length) return null;
  const item = valid[index % valid.length];
  const content = <><img src={item.image} alt={item.title || ""} />{item.title && <div className="home-carousel-caption">{item.title}</div>}{valid.length > 1 && <div className="home-carousel-dots">{valid.map((_, i) => <button type="button" className={i === index ? "active" : ""} onClick={(event) => { event.preventDefault(); setIndex(i); }} key={i} aria-label={`第${i + 1}张`} />)}</div>}</>;
  return <section className="home-carousel">{item.link ? <a href={item.link} target="_blank" rel="noreferrer">{content}</a> : content}</section>;
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
    [editing, setEditing] = useState<CountdownConfig | null>(null);
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
              onClick={() => setEditing({ title: "", target: new Date(Date.now() + 864e5).toISOString() })}
            >
              <Settings2 />
            </button>
          )}
        </div>
        <div className="countdown-compact-list">
          {configs.length ? configs.map((config) => {
            const left = new Date(config.target).getTime() - now;
            const days = Math.max(0, Math.ceil(left / 864e5));
            return <div className="countdown-compact-row" key={config.id || config.title}>
              <span title={new Date(config.target).toLocaleString()}>{config.title}</span>
              <b>{left <= 0 ? "已结束" : `还有 ${days} 天`}</b>
              {admin&&<div className="countdown-row-actions"><button type="button" title={`编辑 ${config.title}`} onClick={()=>setEditing(config)}><Settings2/></button><button type="button" className="danger" title={`删除 ${config.title}`} onClick={async()=>{if(!config.id||!confirm(`确定删除倒计时“${config.title}”？`))return;try{await api.deleteCountdown(config.id);setConfigs(current=>current.filter(item=>item.id!==config.id));}catch(e:any){error(e.message);}}}><Trash2/></button></div>}
            </div>;
          }) : <p className="muted">暂无倒计时</p>}
        </div>
      </section>
      {editing && (
        <CountdownModal
          value={editing}
          close={() => setEditing(null)}
          save={async (next) => {
            try {
              const saved = await api.updateCountdown(next);
              setConfigs((current) => [...current.filter(item=>item.id!==saved.id), saved].sort((a, b) => +new Date(a.target) - +new Date(b.target)));
              setEditing(null);
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
            id: value.id,
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
        <h2>{value.id?"编辑倒计时":"添加倒计时"}</h2>
        <p>{value.id?"修改已有倒计时的名称和目标时间。":"自定义首页显示的活动名称和目标时间。"}</p>
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
          <WheelDateTime value={target} onChange={setTarget}/>
        </label>
        <button className="primary">{value.id?"保存修改":"添加倒计时"}</button>
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
  pageSize,
}: {
  problems: Problem[];
  open: (p: Problem) => void;
  user: User | null;
  reload: () => void;
  error: (s: string) => void;
  create: () => void;
  pageSize: number;
}) {
  const [q, setQ] = useState(""),
    [difficulty, setDifficulty] = useState("全部"),
    [managing, setManaging] = useState(false),
    [currentPage, setCurrentPage] = useState(1), [crossProblem,setCrossProblem]=useState<Problem|null>(null);
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
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const visible = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setCurrentPage(1), [q, difficulty, pageSize]);
  useEffect(()=>{if(!q.trim().startsWith("*"))return setCrossProblem(null);api.problem(q.trim()).then(setCrossProblem).catch(()=>setCrossProblem(null));},[q]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  return (
    <section className="page">
      <div className="page-title discussion-title">
        <div>
          <span className="kicker">PROBLEM SET</span>
          <h1>题库</h1>
          <p>在精选题目中找到你的下一次突破。</p>
        </div>
        {(user?.role === "admin" || user?.role === "root") && (
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
                {(q.trim().startsWith("*")?(crossProblem?[crossProblem]:[]):visible).map((p) => (
                  <tr key={p.id} onClick={() => open(p)}>
                    <td className="mono">{p.id}</td>
                    <td>
                      <b>{p.title}</b>
                      <small>{p.source_domain?`引用自 ${p.source_domain} · `:""}{p.tags.join(" · ")}</small>
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
          {list.length > pageSize && <nav className="problem-pagination" aria-label="题库分页"><button className="plain" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>上一页</button><span>第 {currentPage} / {totalPages} 页 · 共 {list.length} 题</span><button className="plain" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>下一页</button></nav>}
        </>
      )}
    </section>
  );
}
const codeKeywords: Record<string, RegExp> = {
  cpp: /^(?:alignas|alignof|and|asm|auto|bool|break|case|catch|char|class|const|constexpr|continue|default|delete|do|double|else|enum|explicit|extern|false|float|for|friend|if|inline|int|long|namespace|new|nullptr|operator|or|private|protected|public|register|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|union|unsigned|using|virtual|void|volatile|while)$/,
  python: /^(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|return|True|try|while|with|yield)$/,
  java: /^(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|false|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|null|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|true|try|void|volatile|while)$/
};
const INTEGRITY_PREFIX = /^[ \t]*\/\/@ij[0-9a-f]{10}[^\n]*\n?/;
const INTEGRITY_SUFFIX = /\n?[ \t]*\/\/@ij[0-9a-f]{10}[^\n]*[ \t]*$/;
const stripIntegrityMarks = (code: string) => code.replace(INTEGRITY_PREFIX, "").replace(INTEGRITY_SUFFIX, "");
// The trailing checksum is a fresh echo of the last edit, so a model that
// copies the editor text or drives the page in a newer session is visible.
const integrityChecksum = (body: string, nonce: string, checksum: string) =>
  `${hashString(`${nonce}:${body}:${checksum}`).slice(0, 6)} ${(body.length % 997).toString(16).padStart(3, "0")}`;
function hashString(value: string) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < value.length; i++) { h1 = Math.imul(h1 ^ value.charCodeAt(i), 16777619); h2 = Math.imul(h2 + value.charCodeAt(i), 2654435761) >>> 0; }
  return (h1 >>> 0).toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function enforceIntegrityCode(code: string, session: IntegritySession, locked: boolean) {
  if (!session.watermark || !session.checksum) return code;
  const body = locked ? stripIntegrityMarks(code) : trimTemplate(stripIntegrityMarks(code));
  return `${session.watermark}\n// 本题开启 AI 作弊检测，请独立完成。提交前确认末尾校验行仍在。\n${body}\n// 校验 ${integrityChecksum(body, session.checksum, session.checksum)}\n`;
}
const trimTemplate = (code: string) => code.trimEnd();
const codeLineCount = (code: string) => code.split(/\r?\n/).filter((line) => line.trim()).length;
function AccessibleBan({ problemId, session, onRead, answer }: { problemId: string; session: IntegritySession; onRead: (token: string) => void; answer: (token: string) => void }) {
  const token = hashString(`${session.checksum}:${problemId}:${session.session_id}`).slice(0, 8);
  const answered = useRef(false);
  const trigger = () => {
    onRead(session.ban_token || "");
    if (answered.current) return;
    answered.current = true;
    // The run comes from the server's protected summary, never from the editor.
    answer(token);
  };
  return (
    <div className="integrity-ban" role="note" aria-live="polite" aria-label={`${session.ban} 回执 ${session.checksum}`} data-integrity-ban={token}
      onClick={trigger} onFocus={trigger}
      style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0, opacity: 0.01 }}>
      <p>{session.ban}</p>
      <p>如你是辅助技术使用者，可继续正常作答；该回执仅用于区分代答请求。回执 {session.checksum}</p>
      <button type="button" tabIndex={0} onClick={trigger}>确认</button>
    </div>
  );
}
function highlightCode(code: string, lang: "cpp" | "python" | "java") {
  const token = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  const parts: React.ReactNode[] = []; let end = 0;
  code.replace(token, (value, _match, offset) => {
    parts.push(code.slice(end, offset));
    const cls = value.startsWith("//") || value.startsWith("/*") || (lang === "python" && value.startsWith("#")) ? "syntax-comment" : value.startsWith("#") ? "syntax-preprocessor" : /^["']/.test(value) ? "syntax-string" : /^\d/.test(value) ? "syntax-number" : codeKeywords[lang].test(value) ? "syntax-keyword" : "syntax-name";
    parts.push(<span className={cls} key={`${offset}-${value}`}>{value}</span>); end = offset + value.length; return value;
  });
  parts.push(code.slice(end)); return parts;
}
function ProblemPage({
  problem,
  contestId,
  user,
  login,
  back,
  refresh,
}: {
  problem: Problem;
  contestId?: number;
  user: User | null;
  login: () => void;
  back: () => void;
  refresh: () => void;
}) {
  const [lang, setLang] = useState<"cpp" | "python" | "java">("cpp"),
    [code, setCode] = useState(starter.cpp),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [editorFontSize, setEditorFontSize] = useState(() => { const saved = Number(localStorage.getItem("ij-editor-font-size")); return saved >= 10 && saved <= 24 ? saved : 12; }),
    [answer, setAnswer] = useState<any[]>([]),
    [showAntiCheatNotice, setShowAntiCheatNotice] = useState(Boolean(problem.anti_cheat_enabled && (!user || !["root", "admin"].includes(user.role)))),
    [integrity, setIntegrity] = useState<IntegritySession | null>(null),
    [integrityError, setIntegrityError] = useState(""),
    [integrityGuard, setIntegrityGuard] = useState<{ run: () => void } | null>(null),
    [integrityGate, setIntegrityGate] = useState<{ key: string; queued: boolean } | null>(null),
    [integrityBlocked, setIntegrityBlocked] = useState(""),
    [integrityAnswer, setIntegrityAnswer] = useState<(IntegrityRun & { ban: string }) | null>(null),
    [integrityNote, setIntegrityNote] = useState(""),
    [integrityStatement, setIntegrityStatement] = useState<IntegritySession["statement"]>(undefined);
  const integrityBuffer = useRef<any[]>([]), codeRef = useRef(code), blockedRef = useRef(blocked), baselineRef = useRef("");
  codeRef.current = code; blockedRef.current = blocked;
  const accountRef = useRef<number>(0), lockedRef = useRef(false);
  if (integrity) { accountRef.current = integrity.session_id || 0; lockedRef.current = baselineRef.current !== ""; }
  const nowRef = useRef(0);
  nowRef.current = Date.now();
  const integrityActive = Boolean(user && problem.integrity_enabled && !["root", "admin"].includes(user.role));
  const [masked, setMasked] = useState(false);
  // Answering state masking: the statement only renders while this window has
  // focus. Screen recording or a helper window taking over hides it.
  useEffect(() => {
    if (!integrityActive) { setMasked(false); return; }
    const sync = () => setMasked(!document.hasFocus() || document.visibilityState === "hidden");
    sync();
    const timer = window.setInterval(() => setMasked(!document.hasFocus()), 1200);
    window.addEventListener("focus", sync); window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", sync); window.removeEventListener("blur", sync); document.removeEventListener("visibilitychange", sync); };
  }, [integrityActive, problem.id]);
  // Screenshot hotkeys are not blocked (students may need them); they are logged.
  useEffect(() => {
    if (!integrityActive) return;
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const shot = key === "printscreen" || (event.metaKey && event.shiftKey && (key === "3" || key === "4" || key === "5")) || (event.ctrlKey && event.shiftKey && key === "s");
      if (shot) integrityBuffer.current.push({ type: "screenshot", chars: 0, at: Date.now() });
      if (event.type === "keyup" && shot) setIntegrityNote("截图快捷键已记录，仅用于事后核对");
    };
    window.addEventListener("keydown", onKey, true); window.addEventListener("keyup", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKey, true); };
  }, [integrityActive, problem.id]);
  // A statement copied from another copy of the page carries that copy's mark.
  useEffect(() => {
    if (!integrityActive) return;
    const onCopy = () => { const selection = String(window.getSelection() || ""); if (selection.length >= 40) integrityBuffer.current.push({ type: "statement", chars: selection.length, text: selection }); };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [integrityActive, problem.id]);
  useEffect(() => {
    if (!user || !problem.anti_cheat_enabled || ["root", "admin"].includes(user.role)) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      api.reportFocus(problem.id, contestId).then((r) => { setBlocked(r.blocked); if (r.blocked) setResult({ status: "Error", error: "切屏次数已达上限，已禁止答题并将成绩记为 0" }); }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [problem.id, problem.anti_cheat_enabled, user]);
  const flushIntegrity = (extra: any[] = []) => {
    const events = [...integrityBuffer.current, ...extra];
    integrityBuffer.current = [];
    if (!events.length) return Promise.resolve();
    return api.integrityEvent(problem.id, events).then((r) => {
      if (r.verdict === "Blocked") setIntegrityBlocked("答题风险分数已达拦截线，本次提交会被判 0 分");
    }).catch(() => {});
  };
  useEffect(() => {
    if (!integrityActive) { setIntegrity(null); return; }
    let alive = true;
    api.integrityStart(problem.id, { language: lang }).then((value) => { if (alive && value.active) { setIntegrity(value); setIntegrityStatement(value.statement); } }).catch((cause: any) => { if (alive) setIntegrityError(cause.message); });
    return () => { alive = false; };
  }, [problem.id, integrityActive, lang]);
  useEffect(() => {
    if (!integrityActive) return;
    const timer = window.setInterval(() => { if (!blockedRef.current) void flushIntegrity(); }, 5000);
    return () => window.clearInterval(timer);
  }, [problem.id, integrityActive]);
  useEffect(() => {
    if (!integrityActive) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!(target instanceof HTMLTextAreaElement) || target.getAttribute("aria-label") !== "代码编辑器") return;
      const chars = event.clipboardData?.getData("text")?.length || 0;
      if (chars >= 20) integrityBuffer.current.push({ type: "paste", chars, source: "text" });
    };
    const onDrop = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.(".code-editor")) return;
      const text = event.dataTransfer?.getData("text") || "";
      if (text.length >= 20) integrityBuffer.current.push({ type: "paste", chars: text.length, source: "drop" });
    };
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    return () => { document.removeEventListener("paste", onPaste, true); document.removeEventListener("drop", onDrop, true); };
  }, [problem.id, integrityActive]);
  function language(v: "cpp" | "python" | "java") {
    setLang(v);
    setCode(starter[v]);
  }
  function changeEditorFontSize(size: number) { setEditorFontSize(size); localStorage.setItem("ij-editor-font-size", String(size)); }
  async function submit() {
    if (!user) return login();
    if (blocked || integrityBlocked) return;
    setBusy(true);
    try {
      const objective=problem.question_type && problem.question_type!=="programming";
      if (integrityActive && !objective) {
        // Two different windows on the same protected problem: the student's page
        // is gone and whatever is submitting now is re-opened or scripted.
        if (accountRef.current && accountRef.current !== integrity?.session_id) {
          await api.integrityEvent(problem.id, [{ type: "files", files: [{ name: "reopened", ban_seen: true, content: "" }] }]).catch(() => {});
        }
      }
      const s = await api.submit(objective ? {problem_id:problem.id,answer,contest_id:contestId} : {problem_id:problem.id,language:lang,source:code,contest_id:contestId});
      setResult(s);
      if (s.status === "AntiCheat") { setBusy(false); refresh(); return; }
      if(objective){setBusy(false);refresh();return;}
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
      if (e.code === "INTEGRITY_BLOCKED") setIntegrityBlocked(e.message);
      setBusy(false);
    }
  }
  const guardActive = integrityActive && (!problem.question_type || problem.question_type === "programming") && !integrityBlocked;
  useEffect(() => {
    if (!guardActive) { setIntegrityGuard(null); return; }
    setIntegrityGuard({ run: () => { void submit(); } });
  });
  // Baseline survives reloads and auto re-open: it belongs to the problem, not
  // to one page view, so code copied from the summary dialog follows the student.
  const baselineKey = `ij-integrity:${problem.id}:${user?.id || 0}`;
  useEffect(() => {
    if (!integrity?.session_id) return;
    const saved = localStorage.getItem(baselineKey);
    if (saved && !baselineRef.current) { baselineRef.current = saved; setCode((current) => enforceIntegrityCode(current, integrity, true)); return; }
    // The first protected start wraps the template and locks the baseline; later
    // starts or language switches re-apply watermarks without restarting it.
    const locked = baselineRef.current !== "";
    setCode((current) => {
      const next = enforceIntegrityCode(current, integrity, locked);
      if (!locked) { baselineRef.current = stripIntegrityMarks(next).trimEnd(); localStorage.setItem(baselineKey, baselineRef.current); }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrity?.session_id, integrity?.checksum, lang]);
  return (
    <section className="problem-view">
      {integrityActive && integrity && (
        <AccessibleBan problemId={problem.id} session={integrity}
          onRead={(token) => integrityBuffer.current.push({ type: "paste", chars: 0, source: "text", ban_seen: true, ban_token: token })}
          answer={(token) => api.integrityRun(problem.id, { source: code, summary: problem.sample_output || "", language: lang })
            .then((run) => { setIntegrityAnswer({ ...run, ban: token }); })
            .catch(() => {})} />
      )}
      {showAntiCheatNotice && (
        <div className="modal-bg" role="dialog" aria-modal="true">
          <div className="auth-modal anti-cheat-notice">
            <h2>已开启反作弊</h2>
            <p>本题会监控你是否切换浏览器标签页或窗口。</p>
            <p>切屏达到 {problem.anti_cheat_limit || 3} 次后将禁止继续答题，相关成绩记为 0 分。</p>
            <button className="primary" onClick={() => setShowAntiCheatNotice(false)}>我已了解，开始答题</button>
          </div>
        </div>
      )}
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
            <span>{{programming:"编程题",single:"单选题",multiple:"多选题",judge:"判断题",objective:"客观题"}[problem.question_type || "programming"]}</span>
          </div>
          {integrityStatement ? (
            <div className={masked ? "statement-mask" : undefined} aria-busy={masked}>
              {problem.input_format === "已合并到完整题面" ? <Markdown>{integrityStatement.description}</Markdown> : <><h2>题目描述</h2><Markdown>{integrityStatement.description}</Markdown><h2>输入格式</h2><Markdown>{integrityStatement.input_format}</Markdown><h2>输出格式</h2><Markdown>{integrityStatement.output_format}</Markdown></>}
              {masked && <div className="statement-cover" role="status"><EyeOff />窗口失去焦点，题面已隐藏。请回到本窗口继续答题，切换窗口或录屏不会显示题面。</div>}
            </div>
          ) : problem.input_format === "已合并到完整题面" ? <Markdown>{problem.description}</Markdown> : <><h2>题目描述</h2><Markdown>{problem.description}</Markdown><h2>输入格式</h2><Markdown>{problem.input_format}</Markdown><h2>输出格式</h2><Markdown>{problem.output_format}</Markdown></>}
          {problem.input_format !== "已合并到完整题面" && <div className="sample">
            <div>
              <b>输入</b>
              <pre>{problem.sample_input}</pre>
            </div>
            <div>
              <b>输出</b>
              <pre>{problem.sample_output}</pre>
            </div>
          </div>}
        </article>
        <aside className={problem.question_type && problem.question_type!=="programming" ? "submit-panel objective-panel" : "submit-panel"}>
          {problem.question_type && problem.question_type!=="programming" ? <><div className="editor-head"><b>选择答案</b><span>{problem.question_type==="objective"?`${problem.objective_items?.length||0} 道小题`:problem.question_type==="multiple"?"可多选":"请选择一项"}</span></div>{problem.question_type==="objective"?<div className="objective-answer-list">{(problem.objective_items||[]).map((item,index)=><section key={index}><strong>第 {index+1} 题 · {item.type==="single"?"单选":item.type==="multiple"?"多选":"判断"}</strong>{item.options.map((option,j)=><label key={j}><input type={item.type==="multiple"?"checkbox":"radio"} name={`objective-answer-${index}`} checked={(answer[index]||[]).includes(option)} onChange={e=>{const next=[...answer],current=next[index]||[];next[index]=item.type==="multiple"?(e.target.checked?[...current,option]:current.filter((x:string)=>x!==option)):[option];setAnswer(next)}}/><b>{String.fromCharCode(65+j)}</b><span>{option}</span></label>)}</section>)}</div>:<div className="objective-answer-list">{(problem.objective_options||[]).map((option,index)=><label key={index}><input type={problem.question_type==="multiple"?"checkbox":"radio"} name="objective-answer" checked={answer.includes(option)} onChange={(e)=>setAnswer(problem.question_type==="multiple"?(e.target.checked?[...answer,option]:answer.filter((x)=>x!==option)):[option])}/><b>{String.fromCharCode(65+index)}</b><span>{option}</span></label>)}</div>}<div className="editor-foot"><span>{problem.question_type==="objective"?`已作答 ${answer.filter(x=>x?.length).length}/${problem.objective_items?.length||0}`:`已选择 ${answer.length} 项`}</span><button className="primary" disabled={busy||blocked||!answer.length||(problem.question_type==="objective"&&answer.filter(x=>x?.length).length!==(problem.objective_items?.length||0))} onClick={submit}><Send/>{busy?"提交中...":user?"提交答案":"登录后提交"}</button></div></> : <>
          {integrityActive && integrity && <div className="integrity-badge" role="status"><ShieldCheck />AI 作弊检测已开启{integrityBlocked ? ` · ${integrityBlocked}` : ""}{integrityNote ? ` · ${integrityNote}` : ""}</div>}
          <div className="editor-head">
            <select
              value={lang}
              onChange={(e) => language(e.target.value as any)}
            >
              <option value="cpp">C++ 20</option>
              <option value="python">Python 3.12</option>
              <option value="java">Java 21</option>
            </select>
            <div className="editor-meta"><span>{lang === "java" ? "Main.java" : lang === "cpp" ? "Main.cpp" : "main.py"}</span><select aria-label="编辑器字号" title="编辑器字号" value={editorFontSize} onChange={(e) => changeEditorFontSize(Number(e.target.value))}>{[10,11,12,13,14,15,16,18,20,22,24].map((size) => <option key={size} value={size}>{size}px</option>)}</select></div>
          </div>
          <div className="code-editor" style={{ "--editor-font-size": `${editorFontSize}px` } as React.CSSProperties}>
            <pre className="code-highlight" aria-hidden="true"><code>{highlightCode(code, lang)}</code></pre>
            <textarea
              spellCheck={false}
              value={code}
              aria-label="代码编辑器"
              onChange={(e) => setCode(e.target.value)}
              onScroll={(e) => { const layer = e.currentTarget.previousElementSibling as HTMLElement | null; if (layer) { layer.scrollTop = e.currentTarget.scrollTop; layer.scrollLeft = e.currentTarget.scrollLeft; } }}
              onKeyDown={(e) => handleEditorTab(e, code, setCode)}
            />
          </div>
          <div className="editor-foot">
            <span>{code.split("\n").length} 行 · UTF-8</span>
            <button className="primary" disabled={busy || blocked} onClick={submit}>
              <Send />
              {blocked ? "已禁止答题" : busy ? "评测中..." : user ? "提交评测" : "登录后提交"}
            </button>
          </div>
          </>}
          {integrityActive && integrity && (
            <div className="integrity-run">
              <button type="button" className="plain" onClick={() => {
                const run = integrityAnswer || { runner: "stdin", prompt: problem.sample_output || "", answer: problem.sample_output || "", code_hash: "" };
                // Presents the stored run for copying; it never replaces grading.
                setIntegrityAnswer({ ...run, ban: integrity.ban_token || "" });
              }}><Code2 />查看运行摘要</button>
              {integrityAnswer && <pre className="integrity-run-out">{integrityAnswer.out || integrityAnswer.prompt}</pre>}
            </div>
          )}
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
                    {result.id && <a className="result-link" href={`/records/${result.id}`} onClick={(event) => { event.preventDefault(); history.pushState({}, "", `/records/${result.id}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>查看提交记录</a>}
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
  createContest,
}: {
  user: User | null;
  problems: Problem[];
  error: (s: string) => void;
  openProblem: (p: Problem, contestId?: number) => void;
  createContest: () => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [showRanking, setShowRanking] = useState(false);
  const [oilState, setOilState] = useState<any>(null);
  const [oilProblems, setOilProblems] = useState<any[]>([]);
  const [oilChat, setOilChat] = useState<any[]>([]);
  const [oilMessage, setOilMessage] = useState("");
  const [showHack, setShowHack] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const inviteToken = new URLSearchParams(location.search).get("team");
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
  async function refreshOil(id: number) {
    const state = await api.oilState(id);
    setOilState(state);
    setOilProblems([]);
    setOilChat([]);
    if (state.participant) {
      const response = await api.oilProblems(id);
      setOilProblems(response.problems || []);
    }
    if (state.participant?.locked) setOilChat(await api.oilChat(id));
  }

  useEffect(() => {
    if (selected?.type !== "OIL") {
      setOilState(null);
      setOilProblems([]);
      setOilChat([]);
      return;
    }
    void refreshOil(selected.id).catch(() => {});
  }, [selected?.id, selected?.type]);
  useEffect(() => {
    if (!selected || selected.type !== "OIL" || !inviteToken || !user || oilState?.participant || inviteBusy) return;
    setInviteBusy(true);
    api.oilJoinInvite(selected.id, inviteToken)
      .then(() => { history.replaceState({}, "", `/contests/${selected.id}`); return refreshOil(selected.id); })
      .catch((e) => error(e.message))
      .finally(() => setInviteBusy(false));
  }, [selected?.id, user?.id, oilState?.participant, inviteToken]);
  async function copyTeamLink() {
    try {
      const invite = await api.oilInvite(selected.id);
      const url = `${location.origin}/contests/${selected.id}?team=${encodeURIComponent(invite.token)}`;
      await navigator.clipboard.writeText(url);
      alert(`队伍 ${invite.teamNo} 的组队链接已复制`);
    } catch (e: any) { error(e.message); }
  }
  async function transferCaptain(member: any) {
    if (!confirm(`确定将队长转让给 ${member.username} 吗？转让后你将失去队伍管理权限。`)) return;
    try { await api.oilTransferCaptain(selected.id, member.user_id); await refreshOil(selected.id); }
    catch (e: any) { error(e.message); }
  }
  async function kickMember(member: any) {
    if (!confirm(`确定将 ${member.username} 踢出小队吗？`)) return;
    try { await api.oilKickMember(selected.id, member.user_id); await refreshOil(selected.id); }
    catch (e: any) { error(e.message); }
  }
  async function disbandTeam() {
    if (!confirm("确定解散小队吗？所有成员都将退出，现有组队链接也会失效。")) return;
    try { await api.oilDisbandTeam(selected.id); await refreshOil(selected.id); }
    catch (e: any) { error(e.message); }
  }
  async function showContest(id: number) {
    try {
      setSelected(await api.contest(id));
      setShowRanking(false);
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
        {(user?.role === "admin" || user?.role === "root") && (
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
          createContest={createContest}
        />
      ) : selected ? (
        <div className="contest-detail">
          <button className="text-btn" onClick={() => { setSelected(null); setShowRanking(false); history.pushState({}, "", "/contests"); }}>返回比赛列表</button>
          <div className="contest-detail-head">
            <div><span className="tag">{selected.type} · {status(selected)}</span><h2>{selected.title}</h2></div>
            <div className="contest-detail-actions"><span><Clock />{new Date(selected.starts_at).toLocaleString()} · {selected.duration} 分钟</span><button type="button" className="plain" onClick={() => setShowRanking(!showRanking)}><Trophy />{showRanking ? "返回比赛" : "比赛排行榜"}</button></div>
          </div>
          <p>{selected.description || "暂无比赛说明"}</p>
          {showRanking ? <ContestRanking contestId={selected.id} user={user} /> : <>
          {selected.type === "OIL" && (
            <section className="oil-rules">
              <h3>OIL 赛制</h3>
              <p>两队对抗，每队 {selected.team_size || 5} 人；做题阶段 {Math.round((selected.solving_duration || 7200) / 60)} 分钟，公开 Hack 阶段 {Math.round((selected.hack_duration || 3600) / 60)} 分钟。</p>
              <ul>
                <li>比赛开始后所有队员都能看到全部个人题、团队题和神秘题，锁题前队内不能交流。</li>
                <li>锁定后不能再查看或提交个人题，可进入队内交流并 Hack 对手个人题。</li>
                <li>个人题按子任务独立 Hack，成功后该子任务得分变为 40%，攻击方不得分。</li>
                <li>公开 Hack 阶段仅可 Hack 团队思维题；需攻破对方全部正确做法，成功后对方失去 70% 分数且攻击方获得等量分数。</li>
                <li>团队思维题每题 50 分且无部分分；神秘题 200 分，禁止 Hack。</li>
              </ul>
            </section>
          )}
          {selected.type === "OIL" && oilState && (
            <section className="oil-runtime">
              {!oilState.participant ? (
                oilState.contest.team_mode === "admin" ? <div className="oil-join-actions"><span>本比赛由管理员预设队伍，你尚未被分配，请联系比赛管理员。</span></div> : <div className="oil-join-actions"><button className="primary" disabled={inviteBusy} onClick={() => api.oilJoin(selected.id).then(() => refreshOil(selected.id)).catch((e) => error(e.message))}>{inviteBusy ? "正在加入队伍..." : "创建队伍并加入比赛"}</button>{inviteToken && !user && <span>登录后即可加入邀请队伍</span>}</div>
              ) : !oilState.participant.locked ? (
                <>
                  <b>你已加入比赛，队伍 {oilState.participant.team_no} · 位置 {oilState.participant.seat_no}</b>
                  <div className="oil-team-panel">
                    <div className="oil-team-head"><b>小队成员</b>{oilState.contest.team_mode !== "admin" && <button className="plain" onClick={copyTeamLink}><Users />复制组队链接</button>}</div>
                    {oilState.participants.filter((p: any) => p.team_no === oilState.participant.team_no).map((member: any) => (
                      <div className="oil-member-row" key={member.user_id}>
                        <span><b>{member.username}</b>{member.user_id === oilState.captainId && <i>队长</i>}<small>位置 {member.seat_no}{member.locked ? " · 已锁题" : ""}</small></span>
                        {user?.id === oilState.captainId && member.user_id !== user?.id && <div><button className="text-btn" onClick={() => transferCaptain(member)}>转让队长</button><button className="text-btn danger" onClick={() => kickMember(member)}>踢出小队</button></div>}
                      </div>
                    ))}
                    {user?.id === oilState.captainId && <div className="oil-team-danger"><button className="plain danger" onClick={disbandTeam}><Trash2 />解散小队</button></div>}
                  </div>
                  <p>这里显示本场比赛的全部题目。锁定后可进入队内讨论。</p>
                  <div className="contest-problems">
                    {oilProblems.length ? oilProblems.map((p) => (
                      <button key={p.id} onClick={() => { const problem = problems.find((x) => x.id === p.id); if (problem) openProblem(problem, selected.id); else api.problem(p.id).then((item) => openProblem(item, selected.id)).catch((e) => error(e.message)); }}>
                        <b>{p.isMystery ? "神秘" : p.isTeam ? "团队" : "个人"}</b>
                        <span>{p.id} {p.title}</span>
                      </button>
                    )) : <div className="empty">正在加载个人题...</div>}
                  </div>
                  <button className="primary" onClick={() => { if (!confirm("确定锁题吗？\n\n锁题后不能再查看或提交个人题，并将进入团队阶段和队内讨论。此操作无法撤销。")) return; api.oilLock(selected.id).then(() => refreshOil(selected.id)).catch((e) => error(e.message)); }}>锁题并进入团队阶段</button>
                </>
              ) : (
                <>
                  <div className="oil-locked-head"><b>你已锁定个人题，队伍 {oilState.participant.team_no} · 位置 {oilState.participant.seat_no}</b><button type="button" className="plain" onClick={() => setShowHack(!showHack)}><Flame />{showHack ? "关闭 Hack" : "Hack 对手"}</button></div>
                  {showHack && <OilHackPanel contestId={selected.id} error={error} />}
                  <div className="contest-problems">
                    {oilProblems.map((p) => <button className={p.isMystery ? "mystery-problem" : undefined} key={p.id} onClick={() => { const problem = problems.find((x) => x.id === p.id); if (problem) openProblem(problem, selected.id); else api.problem(p.id).then((item) => openProblem(item, selected.id)).catch((e) => error(e.message)); }}><b>{p.isMystery ? "神秘" : p.isTeam ? "团队" : "个人"}</b><span>{p.id} {p.title}</span>{p.isMystery && <small>200 分 · 禁止 Hack</small>}</button>)}
                  </div>
                  <div className="oil-chat">
                    <div className="oil-chat-list">{oilChat.map((m) => <p key={m.id}><b>{m.username}</b>：{m.content}</p>)}</div>
                    <form onSubmit={(e) => { e.preventDefault(); if (!oilMessage.trim()) return; api.sendOilChat(selected.id, oilMessage).then(() => { setOilMessage(""); return api.oilChat(selected.id); }).then(setOilChat).catch((e) => error(e.message)); }}>
                      <input value={oilMessage} onChange={(e) => setOilMessage(e.target.value)} placeholder="队内消息" />
                      <button className="primary">发送</button>
                    </form>
                  </div>
                </>
              )}
            </section>
          )}
          {selected.type !== "OIL" && <><h3>比赛题目</h3><div className="contest-problems">
            {selected.problems?.length ? selected.problems.map((cp: any, index: number) => {
              const problem = problems.find((p) => p.id === cp.id);
              return <button key={cp.id} onClick={() => problem && openProblem(problem, selected.id)}><b>{String.fromCharCode(65 + index)}</b><span>{cp.id} {cp.title}</span></button>;
            }) : <div className="empty">比赛暂未添加题目</div>}
          </div></>}
          </>}
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
function ContestRanking({ contestId, user }: { contestId: number; user: User | null }) {
  const [problems, setProblems] = useState<Array<{id:string;title:string}>>([]);
  const [rows, setRows] = useState<Array<{ rank: number; user_id?: number; username?: string; team_no?: number | null; members?: string[]; submissions: number; solved: number; score: number; last_submit_at: string | null }>>([]);
  const [error, setError] = useState("");
  const load = () => api.contestRanking(contestId).then((data) => { setProblems(data.problems || []); setRows(data.rows || []); }).catch((cause: Error) => setError(cause.message));
  useEffect(() => {
    let stopped = false;
    const refresh = () => api.contestRanking(contestId).then((data) => { if (!stopped) { setProblems(data.problems || []); setRows(data.rows || []); } }).catch((cause: Error) => { if (!stopped) setError(cause.message); });
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [contestId]);
  const admin=user?.role === "admin" || user?.role === "root";
  async function edit(row:any, problem:any) { const current=row.problem_results?.[problem.id]?.score ?? 0, value=prompt(`修改 ${row.team_no ? `队伍 ${row.team_no}` : row.username} 的 ${problem.id} 得分`,String(current)); if(value===null)return; const score=Number(value); if(!Number.isInteger(score)||score<0)return setError("请输入非负整数分数"); try { await api.updateContestRankingScore(contestId,Number(row.team_no ?? row.user_id),problem.id,score); await load(); } catch(cause:any){setError(cause.message);} }
  const columns=`70px minmax(150px,1fr) repeat(${problems.length},minmax(76px,1fr)) 70px 70px 70px`;
  return <section className="contest-ranking"><div className="section-heading"><div><span className="kicker">LIVE RANKING</span><h3>比赛排行榜</h3></div><span>{admin ? "点击题目分数可修改 · " : ""}每 5 秒更新</span></div>{error && <div className="ranking-error">{error}</div>}{rows.length ? <div className="contest-ranking-table"><div className="contest-ranking-row contest-ranking-head" style={{gridTemplateColumns:columns}}><span>排名</span><span>队伍 / 选手</span>{problems.map((problem,index)=><span title={problem.title} key={problem.id}>{String.fromCharCode(65+index)}<small>{problem.id}</small></span>)}<span>通过</span><span>得分</span><span>提交</span></div>{rows.map((row:any) => <div className="contest-ranking-row" style={{gridTemplateColumns:columns}} key={row.team_no ?? row.user_id}><b>#{row.rank}</b><span>{row.team_no ? <><b>队伍 {row.team_no}</b><small>{row.members?.join(" · ")}</small></> : row.username}</span>{problems.map((problem)=><button type="button" disabled={!admin} className={`problem-result ${row.problem_results?.[problem.id]?.accepted ? "accepted" : row.problem_results?.[problem.id] ? "attempted" : ""}`} onClick={()=>admin&&edit(row,problem)} title={admin?`点击修改 ${problem.id} 分数`:problem.title} key={problem.id}><b>{row.problem_results?.[problem.id]?.score ?? "-"}</b><small>{row.problem_results?.[problem.id]?.accepted ? "通过" : row.problem_results?.[problem.id] ? "未通过" : "未提交"}</small></button>)}<b>{row.solved}</b><b>{row.score}</b><span>{row.submissions}</span></div>)}</div> : <div className="empty">暂无本场比赛提交记录。</div>}</section>;
}
function OilHackPanel({ contestId, error }: { contestId: number; error: (message: string) => void }) {
  const [phase, setPhase] = useState(""), [targets, setTargets] = useState<any[]>([]), [selected, setSelected] = useState<any>(null), [input, setInput] = useState(""), [busy, setBusy] = useState(false);
  const load = () => api.oilHackTargets(contestId).then((value) => { setPhase(value.phase); setTargets(value.targets || []); if (selected) setSelected((value.targets || []).find((item: any) => item.id === selected.id) || null); }).catch((cause) => error(cause.message));
  useEffect(() => { void load(); }, [contestId]);
  const submit = async () => { if (!selected || !input.trim()) return error("请选择提交并输入 Hack 数据"); setBusy(true); try { const result = await api.submitOilHack(contestId, selected.id, input); error(`Hack #${result.id} 已提交，等待判定`); setInput(""); } catch (cause: any) { error(cause.message); } finally { setBusy(false); } };
  return <section className="oil-hack-panel"><div className="section-heading"><div><span className="kicker">{phase === "hacking" ? "PUBLIC HACK" : "PERSONAL HACK"}</span><h3>Hack 目标</h3></div><span>未通过提交也可选择</span></div>{targets.length ? <div className="oil-hack-layout"><div className="oil-hack-targets">{targets.map((target) => <button type="button" className={selected?.id === target.id ? "active" : ""} onClick={() => setSelected(target)} key={target.id}><b>#{target.id} · {target.username}</b><span>{target.problem_id} · {target.status} · {target.score} 分</span></button>)}</div>{selected && <div className="oil-hack-workspace"><div className="oil-hack-meta"><b>{selected.problem_id} · {selected.username}</b><span>{selected.language} · {selected.status}</span></div><pre><code>{selected.source}</code></pre><label>Hack 输入<textarea rows={8} value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入能使目标程序失败的数据" /></label><button type="button" className="primary" disabled={busy || !input.trim()} onClick={submit}><Flame />{busy ? "提交中..." : "提交 Hack"}</button></div>}</div> : <div className="empty">当前阶段没有可 Hack 的对手提交。</div>}</section>;
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
function SubmissionPage({ id, back }: { id: number; back: () => void }) {
  const [record, setRecord] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.submission(id).then(setRecord).catch(() => setRecord({ error: "记录不存在" })); }, [id]);
  async function copy() { if (!record?.source) return; await navigator.clipboard?.writeText(record.source); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  const language = record?.language === "python" ? "python" : record?.language === "java" ? "java" : "cpp";
  if (!record) return <section className="page setup-loading">正在加载提交记录...</section>;
  if (record.error) return <section className="page"><button className="plain" onClick={back}>返回评测记录</button><div className="empty">{record.error}</div></section>;
  const tests = Array.isArray(record.detail) ? record.detail : [];
  return <section className="page submission-page"><div className="page-title"><button className="plain" onClick={back}>返回评测记录</button><span className="kicker">SUBMISSION #{record.id}</span><h1>{record.status}</h1><p>{record.title} · {record.user} · {new Date(record.created_at + "Z").toLocaleString()}</p></div><div className="submission-summary"><span>状态 <b>{record.status}</b></span><span>分数 <b>{record.score ?? 0}</b></span><span>耗时 <b>{record.time_ms ?? "-"} ms</b></span><span>内存 <b>{record.memory_kb ?? "-"} KB</b></span><span>语言 <b>{record.language}</b></span></div>{record.can_view_code ? <><section className="submission-tests"><h2>测试点记录</h2><div className="submission-test-table"><div className="submission-test-row submission-test-head"><span>#</span><span>状态</span><span>得分</span><span>耗时</span><span>内存</span></div>{tests.length ? tests.map((test: any, index: number) => <div className="submission-test-row" key={test.test || index}><span>#{test.test || index + 1}</span><span className={`test-status ${String(test.status || "").toLowerCase().replaceAll(" ", "-")}`}><StatusIcon status={test.status} />{test.status || "-"}</span><span>{test.score ?? (test.status === "Accepted" ? Math.round(100 / tests.length) : 0)}</span><span>{test.time_ms ?? "-"} ms</span><span>{test.memory_kb ?? record.memory_kb ?? "-"} KB</span></div>) : <div className="submission-test-empty">暂无测试点详情</div>}</div></section><section className="submission-code"><div className="submission-code-head"><h2>提交代码</h2><button className="plain" onClick={copy}><Code2 />{copied ? "已复制" : "复制代码"}</button></div><pre><code>{record.source ? highlightCode(record.source, language) : "该提交没有可显示的源码。"}</code></pre></section>{tests.some((test: any) => test.output || test.error || test.checker) && <section className="submission-detail"><h2>错误与检查信息</h2>{tests.filter((test: any) => test.output || test.error || test.checker).map((test: any, index: number) => <div className="submission-test-message" key={index}><b>测试点 #{test.test || index + 1}</b><pre>{test.error || test.checker || test.output}</pre></div>)}</section>}</> : <div className="submission-private"><Code2 /><div><b>提交代码不可见</b><p>只有提交者本人、管理员和 Root 可以查看源码与测试点详情。</p></div></div>}</section>;
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
            <a className="record" key={r.id} href={`/records/${r.id}`} onClick={(event) => { event.preventDefault(); history.pushState({}, "", `/records/${r.id}`); window.dispatchEvent(new PopStateEvent("popstate")); }}>
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
            </a>
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
            {((user?.role === "admin" || user?.role === "root") || user?.id === selected.user_id) && (
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
  onKeyDown={(e) => handleEditorTab(e, content, setContent)}
/>
            </label>
            <button className="primary">发布讨论</button>
          </form>
        </div>
      )}
    </section>
  );
}
async function boot() {
  if (oauthCode && !oauthError) {
    try {
      const response = await fetch("/api/auth/auth0/complete", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: oauthCode }), signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error(result.error || "登录状态无效，请重新登录");
      localStorage.setItem("ij-token", result.token);
      sessionStorage.removeItem("ij-admin-verification");
      sessionStorage.removeItem("ij-admin-verification-expires");
    } catch (error: any) { oauthError = error.message || "无法完成登录，请重试"; }
  }
  createRoot(document.getElementById("root")!).render(<App />);
}
// The iOS "信" shell loads the same bundle at #chat and gets the reduced client.
const root = document.getElementById("root")!;
if (location.hash.startsWith("#chat")) startChatApp(root);
else void boot();
