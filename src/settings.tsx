import { useEffect, useRef, useState } from "react";
import { api, SiteConfig } from "./api";
import { ExternalLink, RefreshCw, Save, Upload } from "lucide-react";
import { Markdown } from "./markdown";
import { handleEditorTab } from "./editor";
import { WheelDateTime } from "./datetime";

const defaults: any = {
  antiCheatResetMinutes: 10080,
  email: { enabled: false, smtp: { host: "", port: 465, secure: true, user: "", pass: "", from: "" } },
  server: { allowInvite: true, uploadMb: 256, language: "简体中文", codeLanguage: "C++", cors: "" },
  limits: { problemFiles: 100, problemFileSize: 268435456, userFiles: 100, userFileSize: 134217728, contestFiles: 100, contestFileSize: 134217728, submissions: 60, submissionsPerUser: 15, pretests: 60, codeLength: 131072 },
  pagination: { problems: 100, contests: 20, discussions: 50, records: 100, ranking: 100, training: 10, replies: 50 },
  categories: "", discussionNodes: "", languages: "", about: "",
  session: { savedExpireSeconds: 2592000, unsavedExpireSeconds: 10800 },
};

export function SettingsPage({ error, changed }: { error: (s: string) => void; changed: (v: SiteConfig) => void }) {
  const [form, setForm] = useState<SiteConfig>({ name: "", serviceUrl: "", logo: "", homeAnnouncement: "", domainAnnouncement: "", announcementPopup: false, announcementStartsAt: "", announcementEndsAt: "" });
  const [advanced, setAdvanced] = useState<any>(defaults);
  const [saving, setSaving] = useState(false), [updating, setUpdating] = useState(false), [logs, setLogs] = useState<string[]>([]);
  const updateFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    Promise.all([api.site(), api.advancedSettings()]).then(([site, config]) => {
      setForm(site);
      setAdvanced({ ...defaults, ...config, email: { ...defaults.email, ...config.email, smtp: { ...defaults.email.smtp, ...config.email?.smtp } }, server: { ...defaults.server, ...config.server }, limits: { ...defaults.limits, ...config.limits }, pagination: { ...defaults.pagination, ...config.pagination }, session: { ...defaults.session, ...config.session } });
    }).catch((e) => error(e.message));
  }, []);
  const setGroup = (group: string, key: string, value: any) => setAdvanced((v: any) => ({ ...v, [group]: { ...v[group], [key]: value } }));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const [, config] = await Promise.all([api.updateSite(form), api.updateAdvancedSettings(advanced)]);
      // The site response does not include advanced pagination settings. Re-read it
      // after both writes so the problems page receives the effective page size.
      const site = await api.site();
      setForm(site); setAdvanced((v: any) => ({ ...v, ...config })); changed(site);
    } catch (e: any) { error(e.message); } finally { setSaving(false); }
  }
  async function finishUpdate(result: { version?: string; logs: string[]; restarting?: boolean }) {
    setLogs(result.logs);
    if (!result.version) return;
    sessionStorage.setItem("ij-update-result", `InfiniteJudge 已更新至 v${result.version}`);
    if (!result.restarting) return window.location.reload();
    await new Promise((done) => setTimeout(done, 2200));
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch("/api/health", { cache: "no-store" }); if (response.ok) return window.location.reload(); } catch {}
      await new Promise((done) => setTimeout(done, 1000));
    }
    error("更新已安装，但等待服务重启超时，请稍后刷新页面");
  }
  async function update() {
    if (!confirm("将从 BrightWeb 更新服务器下载、校验并安装最新版本，继续吗？")) return;
    setUpdating(true); setLogs([]);
    try {
      const result = await api.updateSystem();
      await finishUpdate(result);
    } catch (e: any) { error(e.message); } finally { setUpdating(false); }
  }
  async function uploadUpdate(file?: File) {
    if (!file) return;
    if (!confirm(`将上传并自动安装更新包“${file.name}”，继续吗？`)) { if (updateFile.current) updateFile.current.value = ""; return; }
    setUpdating(true); setLogs([]);
    try { await finishUpdate(await api.uploadSystemUpdate(file)); }
    catch (e: any) { error(e.message); }
    finally { setUpdating(false); if (updateFile.current) updateFile.current.value = ""; }
  }
  const numberField = (group: string, key: string, label: string) => <Field label={label}><input type="number" value={advanced[group][key]} onChange={(e) => setGroup(group, key, +e.target.value)} /></Field>;
  return <section className="page settings-page">
    <form className="settings-panel settings-form" onSubmit={save}>
      <div className="settings-savebar top-savebar"><div><b>配置管理</b><span>站点与主域配置保存后立即生效</span></div><button className="primary" disabled={saving}><Save />{saving ? "保存中..." : "保存全部配置"}</button></div>

      <SettingsSection title="站点与主域">
        <div className="settings-fields"><Field label="品牌名称"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="服务地址"><input required type="url" value={form.serviceUrl} onChange={(e) => setForm({ ...form, serviceUrl: e.target.value })} /></Field><Field label="Logo URL"><input type="url" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} /></Field><Field label="最大上传文件（MB）"><input type="number" value={advanced.server.uploadMb} onChange={(e) => setGroup("server", "uploadMb", +e.target.value)} /></Field></div>
        {form.logo && <div className="logo-preview"><img src={form.logo} /><span>Logo 预览</span></div>}
        <div className="announcement-editor"><Field label="主域公告（弹窗 Markdown）"><textarea rows={12} value={form.domainAnnouncement || ""} onChange={(e) => setForm({ ...form, domainAnnouncement: e.target.value })} onKeyDown={(e) => handleEditorTab(e, form.domainAnnouncement || "", (next) => setForm({ ...form, domainAnnouncement: next }))} /></Field><div className="announcement-preview"><span>弹窗预览</span><Markdown>{form.domainAnnouncement || "暂无公告"}</Markdown></div></div>
        <div className="announcement-editor"><Field label="首页公告（Markdown）"><textarea rows={12} value={form.homeAnnouncement || form.announcement || ""} onChange={(e) => setForm({ ...form, homeAnnouncement: e.target.value })} onKeyDown={(e) => handleEditorTab(e, form.homeAnnouncement || form.announcement || "", (next) => setForm({ ...form, homeAnnouncement: next }))} /></Field><div className="announcement-preview"><span>实时预览</span><Markdown>{form.homeAnnouncement || form.announcement || "暂无公告"}</Markdown></div></div>
        <label className="toggle-line"><input type="checkbox" checked={!!form.announcementPopup} onChange={(e) => setForm({ ...form, announcementPopup: e.target.checked })} />用户进入网站时弹出公告</label>
        <div className="settings-fields"><Field label="开始显示时间"><WheelDateTime optional value={form.announcementStartsAt||""} onChange={(value)=>setForm((current:any)=>({...current,announcementStartsAt:value}))}/></Field><Field label="停止显示时间"><WheelDateTime optional value={form.announcementEndsAt||""} onChange={(value)=>setForm((current:any)=>({...current,announcementEndsAt:value}))}/></Field></div>
      </SettingsSection>

      <SettingsSection title="SMTP 与邮件验证">
        <label className="toggle-line"><input type="checkbox" checked={advanced.email.enabled} onChange={(e) => setGroup("email", "enabled", e.target.checked)} />启用注册邮件验证</label>
        <div className="settings-fields">{[["host","SMTP 服务器地址","text"],["port","SMTP 服务器端口","number"],["user","SMTP 用户名","text"],["pass","SMTP 密码（留空表示不修改）","password"],["from","发件人","text"]].map(([key,label,type]) => <Field key={key} label={label}><input type={type} value={advanced.email.smtp[key] || ""} onChange={(e) => setAdvanced((v:any) => ({ ...v, email: { ...v.email, smtp: { ...v.email.smtp, [key]: type === "number" ? +e.target.value : e.target.value } } }))} /></Field>)}</div>
        <label className="toggle-line"><input type="checkbox" checked={advanced.email.smtp.secure} onChange={(e) => setAdvanced((v:any) => ({ ...v, email: { ...v.email, smtp: { ...v.email.smtp, secure: e.target.checked } } }))} />使用 SSL / TLS</label>
      </SettingsSection>

      <SettingsSection title="服务器设置">
        <label className="toggle-line"><input type="checkbox" checked={advanced.server.allowInvite} onChange={(e) => setGroup("server", "allowInvite", e.target.checked)} />允许邀请和注册用户</label>
        <div className="settings-fields"><Field label="默认显示语言"><select value={advanced.server.language} onChange={(e) => setGroup("server", "language", e.target.value)}><option>简体中文</option><option>English</option></select></Field><Field label="默认代码语言"><select value={advanced.server.codeLanguage} onChange={(e) => setGroup("server", "codeLanguage", e.target.value)}>{["C++","C","Python","Java","Rust"].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="CORS 域名"><input value={advanced.server.cors} onChange={(e) => setGroup("server", "cors", e.target.value)} /></Field><Field label="作弊者称号重置时间（分钟）"><input type="number" min="1" step="1" value={Math.max(1, Number(advanced.antiCheatResetMinutes) || 1)} onChange={(e) => setAdvanced({ ...advanced, antiCheatResetMinutes: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></Field></div>
      </SettingsSection>

      <SettingsSection title="资源与提交限制"><div className="settings-fields">{numberField("limits","problemFiles","单题最大文件数量")}{numberField("limits","problemFileSize","单题最大总文件大小（字节）")}{numberField("limits","userFiles","单用户最大文件数量")}{numberField("limits","userFileSize","单用户最大总文件大小（字节）")}{numberField("limits","contestFiles","比赛或训练最大文件数量")}{numberField("limits","contestFileSize","比赛或训练最大总文件大小（字节）")}{numberField("limits","submissions","每分钟提交数量限制")}{numberField("limits","submissionsPerUser","单用户每分钟提交数量")}{numberField("limits","pretests","每分钟自测数量限制")}{numberField("limits","codeLength","最大代码长度")}</div></SettingsSection>

      <SettingsSection title="基础设置"><div className="settings-code-grid"><Field label="讨论节点（每行一项）"><textarea rows={9} value={advanced.discussionNodes} onChange={(e) => setAdvanced({ ...advanced, discussionNodes: e.target.value })} onKeyDown={(e) => handleEditorTab(e, advanced.discussionNodes, (next) => setAdvanced({ ...advanced, discussionNodes: next }))} /></Field><Field label="题目分类（每行一项）"><textarea rows={9} value={advanced.categories} onChange={(e) => setAdvanced({ ...advanced, categories: e.target.value })} onKeyDown={(e) => handleEditorTab(e, advanced.categories, (next) => setAdvanced({ ...advanced, categories: next }))} /></Field><Field label="评测语言（每行一项）"><textarea rows={9} value={advanced.languages} onChange={(e) => setAdvanced({ ...advanced, languages: e.target.value })} onKeyDown={(e) => handleEditorTab(e, advanced.languages, (next) => setAdvanced({ ...advanced, languages: next }))} /></Field></div></SettingsSection>

      <SettingsSection title="每页显示数量"><div className="settings-fields">{numberField("pagination","problems","题目")}{numberField("pagination","contests","比赛")}{numberField("pagination","discussions","讨论")}{numberField("pagination","records","评测记录")}{numberField("pagination","ranking","排行榜用户")}{numberField("pagination","training","训练计划")}{numberField("pagination","replies","回复")}</div></SettingsSection>

      <SettingsSection title="关于与会话"><Field label="关于页面（Markdown）"><textarea className="wide-textarea" rows={12} value={advanced.about} onChange={(e) => setAdvanced({ ...advanced, about: e.target.value })} onKeyDown={(e) => handleEditorTab(e, advanced.about, (next) => setAdvanced({ ...advanced, about: next }))} /></Field><div className="settings-fields">{numberField("session","savedExpireSeconds","已保存会话过期秒数")}{numberField("session","unsavedExpireSeconds","未保存会话过期秒数")}</div></SettingsSection>
    </form>
    <div className="settings-panel update-panel"><div className="settings-heading"><RefreshCw /><div><h2>版本更新</h2><p>支持在线更新，或手动上传 ZIP、tar.gz 更新包。</p></div></div><a className="repo-link" href="https://update.brightweb.top/oj" target="_blank"><ExternalLink />update.brightweb.top/oj</a><div className="update-actions"><button className="primary" disabled={updating} onClick={update}><RefreshCw />{updating ? "正在更新..." : "在线更新"}</button><input ref={updateFile} hidden type="file" accept=".zip,.tar.gz,.tgz,application/zip,application/gzip" onChange={(e) => uploadUpdate(e.target.files?.[0])} /><button className="plain" disabled={updating} onClick={() => updateFile.current?.click()}><Upload />手动上传</button></div>{logs.length > 0 && <pre className="update-logs">{logs.join("\n\n")}</pre>}</div>
  </section>;
}
function SettingsSection({ title, children }: { title: string; children: any }) { return <section className="settings-section"><h2>{title}</h2>{children}</section>; }
function Field({ label, children }: { label: string; children: any }) { return <label className="field"><span>{label}</span>{children}</label>; }
