import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, PublicProfile, User, UserFile } from "./api";
import { Camera, Download, File, KeyRound, Mail, Plus, Save, Send, Trash2, Upload, UserCircle } from "lucide-react";

export function AccountPage({ user, changed, error }: { user: User; changed: (u: User) => void; error: (s: string) => void }) {
  const [profile, setProfile] = useState({ username: user.username, avatar: user.avatar || "", bio: user.bio || "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [uploading, setUploading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const chooseAvatar = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const updated = await api.uploadAvatar(file);
      setProfile((current) => ({ ...current, avatar: updated.avatar || "" }));
      changed(updated);
      error("头像已更新");
    } catch (x: any) { error(x.message); } finally { setUploading(false); }
  };
  return <section className="page account-page">
    <div className="page-title"><span className="kicker">ACCOUNT</span><h1>账户信息</h1><p>维护公开资料、头像与登录凭据。</p></div>
    <div className="account-grid">
      <form className="settings-panel content-form profile-settings" onSubmit={async (e) => { e.preventDefault(); try { const updated = await api.updateProfile(profile); changed(updated); error("资料已保存"); } catch (x: any) { error(x.message); } }}>
        <h2><UserCircle />个人资料</h2>
        <div className="avatar-editor">
          <div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="当前头像" /> : profile.username[0]?.toUpperCase()}</div>
          <div><b>头像</b><p>支持 JPG、PNG、GIF、WebP，最大 5 MB。</p><input ref={avatarInput} hidden type="file" accept="image/*" onChange={(e) => chooseAvatar(e.target.files?.[0])} /><button type="button" className="secondary" disabled={uploading} onClick={() => avatarInput.current?.click()}><Camera />{uploading ? "上传中..." : "上传头像"}</button></div>
        </div>
        <label className="field"><span>用户名</span><input required value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label>
        <label className="field"><span>个人简介（Markdown）</span><textarea rows={10} maxLength={2000} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="介绍你的算法方向、学校或近期计划" /></label>
        <div className="bio-preview markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.bio || "简介预览"}</ReactMarkdown></div>
        <button className="primary"><Save />保存资料</button>
      </form>
      <form className="settings-panel content-form password-settings" onSubmit={async (e) => { e.preventDefault(); if (password.newPassword !== password.repeat) return error("两次输入的新密码不一致"); try { await api.updatePassword(password); setPassword({ currentPassword: "", newPassword: "", repeat: "" }); error("密码修改成功"); } catch (x: any) { error(x.message); } }}>
        <h2><KeyRound />修改密码</h2>
        <label className="field"><span>当前密码</span><input required type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} /></label>
        <label className="field"><span>新密码</span><input required minLength={8} type="password" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} /></label>
        <label className="field"><span>重复新密码</span><input required type="password" value={password.repeat} onChange={(e) => setPassword({ ...password, repeat: e.target.value })} /></label>
        <button className="primary"><KeyRound />修改密码</button>
      </form>
    </div>
  </section>;
}

export function ProfilePage({ id, error }: { id: number; error: (s: string) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  useEffect(() => { api.userProfile(id).then(setProfile).catch((e) => error(e.message)); }, [id]);
  if (!profile) return <div className="page setup-loading">正在加载个人资料...</div>;
  return <section className="page profile-page">
    <div className="profile-hero"><div className="profile-avatar large">{profile.avatar ? <img src={profile.avatar} alt="" /> : profile.username[0].toUpperCase()}</div><div><span>UID {profile.id}</span><h1>{profile.username}</h1><p>加入于 {new Date(profile.created_at + "Z").toLocaleDateString()}</p></div><strong>{profile.rp} RP</strong></div>
    <div className="profile-content"><article className="settings-panel profile-bio"><h2>个人简介</h2><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{profile.bio || "这个用户还没有填写个人简介。"}</ReactMarkdown></div></article><aside className="profile-stats"><section><b>{profile.submissions}</b><span>提交</span></section><section><b>{profile.solved}</b><span>通过</span></section><section><b>{profile.blog.length}</b><span>博客</span></section></aside></div>
    <section className="profile-posts"><div className="section-heading"><div><span className="kicker">BLOG</span><h2>最近博客</h2></div></div>{profile.blog.length ? profile.blog.map((post) => <article key={post.id}><time>{new Date(post.created_at + "Z").toLocaleDateString()}</time><h3>{post.title}</h3><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown></div></article>) : <div className="settings-panel empty">暂无博客</div>}</section>
  </section>;
}

export function FilesPage({ error }: { error: (s: string) => void }) {
  const [items, setItems] = useState<UserFile[]>([]), [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () => api.files().then(setItems).catch((e) => error(e.message));
  useEffect(() => { void load(); }, []);
  const uploadFile = async (file?: globalThis.File) => { if (!file) return; setUploading(true); try { await api.uploadFile(file); await load(); error("文件上传成功"); } catch (x: any) { error(x.message); } finally { setUploading(false); if (input.current) input.current.value = ""; } };
  const download = async (item: UserFile) => { try { const blob = await api.downloadFile(item.id), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = item.original_name; anchor.click(); URL.revokeObjectURL(url); } catch (x: any) { error(x.message); } };
  return <section className="page files-page"><div className="page-title discussion-title"><div><span className="kicker">STORAGE</span><h1>我的文件</h1><p>管理个人资料和博客中使用的文件，单个文件最大 20 MB。</p></div><input ref={input} hidden type="file" onChange={(e) => uploadFile(e.target.files?.[0])} /><button className="primary" disabled={uploading} onClick={() => input.current?.click()}><Upload />{uploading ? "上传中..." : "上传文件"}</button></div><div className="file-table settings-panel"><div className="file-row file-head"><span>文件名</span><span>大小</span><span>上传时间</span><span>操作</span></div>{items.map((item) => <div className="file-row" key={item.id}><span className="file-name"><File />{item.original_name}<small>{item.mime_type}</small></span><span>{formatBytes(item.size)}</span><span>{new Date(item.created_at + "Z").toLocaleString()}</span><span className="file-actions"><button className="icon" title="下载" onClick={() => download(item)}><Download /></button><button className="icon danger" title="删除" onClick={async () => { if (!confirm(`删除 ${item.original_name}？`)) return; try { await api.deleteFile(item.id); load(); } catch (x: any) { error(x.message); } }}><Trash2 /></button></span></div>)}{!items.length && <div className="empty file-empty"><File />还没有上传文件</div>}</div></section>;
}
const formatBytes = (size: number) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;

export function MessagesPage({ error }: { error: (s: string) => void }) {
  const [items, setItems] = useState<any[]>([]), [recipient, setRecipient] = useState(""), [content, setContent] = useState("");
  const load = () => api.messages().then(setItems).catch((e) => error(e.message)); useEffect(() => { void load(); }, []);
  return <section className="page"><div className="page-title"><span className="kicker">INBOX</span><h1>站内消息</h1><p>与站内用户进行私信交流。</p></div><div className="messages-layout"><form className="settings-panel content-form" onSubmit={async (e) => { e.preventDefault(); try { await api.sendMessage({ recipient, content }); setContent(""); error("消息已发送"); } catch (x: any) { error(x.message); } }}><h2><Plus />新消息</h2><label className="field"><span>收件人用户名</span><input required value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label><label className="field"><span>内容</span><textarea required rows={7} value={content} onChange={(e) => setContent(e.target.value)} /></label><button className="primary"><Send />发送</button></form><div className="message-list">{items.length ? items.map((item) => <article key={item.id} className={item.read_at ? "" : "unread"} onClick={() => { if (!item.read_at) api.readMessage(item.id).then(load); }}><div><b>{item.sender}</b><time>{new Date(item.created_at + "Z").toLocaleString()}</time></div><p>{item.content}</p></article>) : <div className="settings-panel empty"><Mail />暂无站内消息</div>}</div></div></section>;
}

export function BlogPage({ user, error }: { user: User | null; error: (s: string) => void }) {
  const [posts, setPosts] = useState<any[]>([]), [writing, setWriting] = useState(false), [title, setTitle] = useState(""), [content, setContent] = useState(""); const load = () => api.blog().then(setPosts); useEffect(() => { load(); }, []);
  return <section className="page"><div className="page-title discussion-title"><div><span className="kicker">BLOG</span><h1>博客</h1><p>记录题解、训练经验与技术思考。</p></div>{user && <button className="primary" onClick={() => setWriting(!writing)}><Plus />写博客</button>}</div>{writing && <form className="settings-panel blog-editor" onSubmit={async (e) => { e.preventDefault(); try { await api.createBlog({ title, content }); setTitle(""); setContent(""); setWriting(false); load(); } catch (x: any) { error(x.message); } }}><input required placeholder="博客标题" value={title} onChange={(e) => setTitle(e.target.value)} /><div><textarea required rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="使用 Markdown 编写" /><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "实时预览"}</ReactMarkdown></div></div><button className="primary">发布博客</button></form>}<div className="blog-list">{posts.map((post) => <article key={post.id}><span>{post.username} · {new Date(post.created_at + "Z").toLocaleDateString()}</span><h2>{post.title}</h2><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown></div></article>)}</div></section>;
}
