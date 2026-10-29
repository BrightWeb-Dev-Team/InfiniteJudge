import { useEffect, useRef, useState } from "react";
import { api, PublicProfile, User, UserFile } from "./api";
import { ArrowLeft, BadgeCheck, Camera, Copy, Download, Edit3, File, Image as ImageIcon, KeyRound, Mail, Plus, Save, Send, SlidersHorizontal, Trash2, Upload, UserCircle, Video } from "lucide-react";
import { Markdown } from "./markdown";
import { handleEditorTab } from "./editor";
import { EmojiPicker, insertAtCaret } from "./emoji";
import { startRegistration } from "@simplewebauthn/browser";
import { CALL_STATUS, callStatus, startCall, type Peer } from "./video-call";

export function AccountPage({ user, changed, error, liquidGlass, setLiquidGlass, compatibility, glassTransparency, setGlassTransparency, glassRefraction, setGlassRefraction, mascot, setMascot }: {
  user: User;
  changed: (u: User) => void;
  error: (s: string) => void;
  liquidGlass: boolean;
  setLiquidGlass: (enabled: boolean) => void;
  compatibility: boolean;
  glassTransparency: number;
  setGlassTransparency: (value: number) => void;
  glassRefraction: number;
  setGlassRefraction: (value: number) => void;
  mascot: boolean;
  setMascot: (enabled: boolean) => void;
}) {
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
        <label className="field"><span>用户名</span><input required minLength={3} maxLength={24} value={profile.username} onChange={(e) => setProfile({ ...profile, username: e.target.value })} /></label>
<label className="field"><span>个人简介（Markdown）</span><textarea rows={10} maxLength={2000} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} onKeyDown={(e) => handleEditorTab(e, profile.bio, (next) => setProfile({ ...profile, bio: next }))} placeholder="介绍你的算法方向、学校或近期计划" /></label>
        <Markdown className="bio-preview">{profile.bio || "简介预览"}</Markdown>
        <button className="primary"><Save />保存资料</button>
      </form>
      <div className="account-security-column">
        <section className="settings-panel content-form appearance-settings" aria-labelledby="appearance-title">
          <h2 id="appearance-title"><SlidersHorizontal />外观</h2>
          <div className="appearance-option">
            <div><label id="liquid-glass-label" htmlFor="liquid-glass-switch">液态玻璃</label><small id="liquid-glass-status" role="status">{liquidGlass && compatibility ? "兼容模式下暂停" : liquidGlass ? "已开启" : "已关闭"}</small></div>
            <button id="liquid-glass-switch" type="button" className="appearance-switch" role="switch" aria-checked={liquidGlass} aria-labelledby="liquid-glass-label" aria-describedby="liquid-glass-status" onClick={() => setLiquidGlass(!liquidGlass)}><span aria-hidden="true" /></button>
          </div>
          <div className="glass-transparency-setting">
            <div><label htmlFor="glass-transparency">玻璃透明度</label><output htmlFor="glass-transparency">{glassTransparency}%</output></div>
            <input id="glass-transparency" type="range" min="0" max="100" step="1" value={glassTransparency} aria-valuetext={`${glassTransparency}%`} disabled={!liquidGlass || compatibility} onChange={(event) => setGlassTransparency(Number(event.target.value))} />
          </div>
          <div className="glass-transparency-setting">
            <div><label htmlFor="glass-refraction">折射强度</label><output htmlFor="glass-refraction">{glassRefraction}%</output></div>
            <input id="glass-refraction" type="range" min="0" max="100" step="1" value={glassRefraction} aria-valuetext={`${glassRefraction}%`} disabled={!liquidGlass || compatibility} onChange={(event) => setGlassRefraction(Number(event.target.value))} />
          </div>
          <div className="appearance-option">
            <div><label id="mascot-label" htmlFor="mascot-switch">看板娘</label><small id="mascot-status" role="status">{mascot ? "已开启" : "已关闭"}</small></div>
            <button id="mascot-switch" type="button" className="appearance-switch" role="switch" aria-checked={mascot} aria-labelledby="mascot-label" aria-describedby="mascot-status" onClick={() => setMascot(!mascot)}><span aria-hidden="true" /></button>
          </div>
        </section>
        <form className="settings-panel content-form password-settings" onSubmit={async (e) => { e.preventDefault(); if (password.newPassword !== password.repeat) return error("两次输入的新密码不一致"); try { await api.updatePassword(password); setPassword({ currentPassword: "", newPassword: "", repeat: "" }); error("密码修改成功"); } catch (x: any) { error(x.message); } }}>
          <h2><KeyRound />修改密码</h2>
          <label className="field"><span>当前密码</span><input required type="password" value={password.currentPassword} onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })} /></label>
          <label className="field"><span>新密码</span><input required minLength={8} type="password" value={password.newPassword} onChange={(e) => setPassword({ ...password, newPassword: e.target.value })} /></label>
          <label className="field"><span>重复新密码</span><input required type="password" value={password.repeat} onChange={(e) => setPassword({ ...password, repeat: e.target.value })} /></label>
          <button className="primary"><KeyRound />修改密码</button>
        </form>
        <PasskeySettings error={error} />
      </div>
    </div>
  </section>;
}

function PasskeySettings({ error }: { error: (message: string) => void }) {
  const [keys, setKeys] = useState<any[]>([]), [busy, setBusy] = useState(false);
  const load = () => api.passkeys().then(setKeys).catch((x) => error(x.message));
  useEffect(() => { void load(); }, []);
  const add = async () => {
    if (!window.PublicKeyCredential) return error("当前浏览器不支持通行密钥");
    const name = prompt("给这枚通行密钥起个名称", "我的通行密钥")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { options, ceremony } = await api.passkeyRegistrationOptions();
      const response = await startRegistration({ optionsJSON: options });
      await api.registerPasskey(ceremony, response, name);
      await load();
      error("通行密钥已添加");
    } catch (x: any) { error(x.name === "NotAllowedError" ? "已取消通行密钥操作" : x.message); } finally { setBusy(false); }
  };
  return <section className="settings-panel content-form passkey-settings">
    <div className="passkey-heading"><div><h2><KeyRound />通行密钥</h2><p>使用指纹、面容或设备密码登录。它与密码是两种可选的登录方式。</p></div><button type="button" className="secondary" disabled={busy} onClick={add}><Plus />{busy ? "添加中..." : "添加"}</button></div>
    <div className="passkey-list">{keys.length ? keys.map((key) => <article key={key.id}>
      <KeyRound /><div><b>{key.name}</b><span>{key.last_used_at ? `最近使用：${new Date(key.last_used_at + "Z").toLocaleString()}` : `添加于 ${new Date(key.created_at + "Z").toLocaleString()}`}</span></div>
      <button type="button" className="icon-button" title="重命名" onClick={async () => { const name = prompt("通行密钥名称", key.name)?.trim(); if (!name) return; try { await api.renamePasskey(key.id, name); await load(); } catch (x: any) { error(x.message); } }}><Edit3 /></button>
      <button type="button" className="icon-button danger" title="删除" onClick={async () => { if (!confirm(`删除通行密钥“${key.name}”？`)) return; try { await api.deletePasskey(key.id); await load(); error("通行密钥已删除"); } catch (x: any) { error(x.message); } }}><Trash2 /></button>
    </article>) : <div className="empty">尚未添加通行密钥</div>}</div>
  </section>;
}

export function ProfilePage({ id, error }: { id: number; error: (s: string) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState<"bio" | "activity" | "solutions">("bio");
  useEffect(() => { api.userProfile(id).then(setProfile).catch((e) => error(e.message)); }, [id]);
  if (!profile) return <div className="page setup-loading">正在加载个人资料...</div>;
  return <section className="page profile-page">
    <div className="profile-hero">
      <div className="profile-identity">
        {profile.avatar && <div className="profile-avatar large"><img src={profile.avatar} alt="" /></div>}
        <div>
          <h1>{profile.username}</h1>
          <span>UID: {profile.id}</span>
          <p>加入于 {new Date(profile.created_at + "Z").toLocaleDateString()}</p>
        </div>
      </div>
      <strong>{profile.rp} RP</strong>
      <nav className="profile-tabs" aria-label="个人资料栏目">
        <button className={tab === "bio" ? "active" : ""} onClick={() => setTab("bio")}>个人简介</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>最近活动</button>
        <button className={tab === "solutions" ? "active" : ""} onClick={() => setTab("solutions")}>最近编写的题解</button>
      </nav>
    </div>
    {!!profile.certifications?.length && <section className="profile-certifications" aria-label="用户认证">{profile.certifications.map((cert) => <article key={cert.id} style={{ "--cert-color": cert.color } as React.CSSProperties}><h2><BadgeCheck aria-hidden="true" />{cert.title}：</h2><p>{cert.display_text || cert.title}</p></article>)}</section>}
    <div className="profile-content"><article className="settings-panel profile-bio">{tab === "bio" && <><h2>个人简介</h2><Markdown>{profile.bio || "这个用户还没有填写个人简介。"}</Markdown></>}{tab === "activity" && <><h2>最近活动</h2>{profile.recent_submissions?.length ? profile.recent_submissions.map((item) => <p key={item.id}>{item.problem_id} {item.title} · {item.status} · {new Date(item.created_at + "Z").toLocaleString()}</p>) : <div className="empty">暂无评测活动</div>}</>}{tab === "solutions" && <><h2>最近编写的题解</h2>{profile.blog.length ? profile.blog.map((post) => <p key={post.id}><a href={`/blog/${profile.id}/${post.id}`}>{post.title}</a> · {new Date(post.updated_at + "Z").toLocaleString()}</p>) : <div className="empty">暂无题解</div>}</>}</article><aside className="profile-stats"><section><b>{profile.submissions}</b><span>提交</span></section><section><b>{profile.solved}</b><span>通过</span></section><section><b>{profile.blog.length}</b><span>博客</span></section></aside></div>
    <section className="profile-posts"><div className="section-heading"><div><span className="kicker">BLOG</span><h2>最近博客</h2></div></div>{profile.blog.length ? profile.blog.map((post) => <article key={post.id} onClick={() => { history.pushState({}, "", `/blog/${profile.id}/${post.id}`); dispatchEvent(new PopStateEvent("popstate")); }}><time>{new Date(post.created_at + "Z").toLocaleDateString()}</time><h3>{post.title}</h3></article>) : <div className="settings-panel empty">暂无博客</div>}</section>
  </section>;
}

export function FilesPage({ error }: { error: (s: string) => void }) {
  const [items, setItems] = useState<UserFile[]>([]), [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () => api.files().then(setItems).catch((e) => error(e.message));
  useEffect(() => { void load(); }, []);
  const uploadFile = async (file?: globalThis.File) => { if (!file) return; setUploading(true); try { await api.uploadFile(file); await load(); error("文件上传成功"); } catch (x: any) { error(x.message); } finally { setUploading(false); if (input.current) input.current.value = ""; } };
  const download = async (item: UserFile) => { try { const blob = await api.downloadFile(item.id), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = item.original_name; anchor.click(); URL.revokeObjectURL(url); } catch (x: any) { error(x.message); } };
  const copyLink = async (item: UserFile) => { try { await navigator.clipboard.writeText(new URL(item.public_url, location.origin).href); error("文件链接已复制"); } catch { error("复制失败，请检查浏览器剪贴板权限"); } };
  return <section className="page files-page"><div className="page-title discussion-title"><div><span className="kicker">STORAGE</span><h1>我的文件</h1><p>管理个人资料和博客中使用的文件，单个文件最大 20 MB。</p></div><input ref={input} hidden type="file" onChange={(e) => uploadFile(e.target.files?.[0])} /><button className="primary" disabled={uploading} onClick={() => input.current?.click()}><Upload />{uploading ? "上传中..." : "上传文件"}</button></div><div className="file-table settings-panel"><div className="file-row file-head"><span>文件名</span><span>大小</span><span>上传时间</span><span>操作</span></div>{items.map((item) => <div className="file-row" key={item.id}><span className="file-name"><File />{item.original_name}<small>{item.mime_type}</small></span><span>{formatBytes(item.size)}</span><span>{new Date(item.created_at + "Z").toLocaleString()}</span><span className="file-actions"><button className="icon" title="复制文件链接" aria-label={`复制 ${item.original_name} 的文件链接`} onClick={() => copyLink(item)}><Copy /></button><button className="icon" title="下载" onClick={() => download(item)}><Download /></button><button className="icon danger" title="删除" onClick={async () => { if (!confirm(`删除 ${item.original_name}？`)) return; try { await api.deleteFile(item.id); load(); } catch (x: any) { error(x.message); } }}><Trash2 /></button></span></div>)}{!items.length && <div className="empty file-empty"><File />还没有上传文件</div>}</div></section>;
}
const formatBytes = (size: number) => size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;

// Uploaded pictures are sent as their public URL; render those as images, not links.
const isImageMessage = (text: string) => /^(\/api\/public\/|https?:\/\/).*\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(text.trim());

const previewText = (text: string) => {
  const voice = text.match(/^\[语音\](\d+)\|(\S+)$/);
  if (voice) return `[语音] ${voice[1]}″`;
  return isImageMessage(text) ? "[图片]" : text;
};

const voiceNoteOf = (text: string) => {
  const match = text.match(/^\[语音\](\d+)\|(\S+)$/);
  return match ? { seconds: match[1], url: match[2] } : null;
};

const playVoice = (event: React.MouseEvent, url: string) => {
  event.preventDefault();
  event.stopPropagation();
  const audio = new Audio(url);
  void audio.play().catch(() => {});
};

export function MessagesPage({ error, unreadChanged }: {
  error: (s: string) => void;
  unreadChanged?: (count: number) => void;
  openVideoCall?: (uid: number) => void;
}) {
  const [me, setMe] = useState<User | null>(null), [items, setItems] = useState<any[]>([]), [active, setActive] = useState<number | null>(null), [newUid, setNewUid] = useState(""), [creating, setCreating] = useState(false), [content, setContent] = useState(""), [uploading, setUploading] = useState(false), [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "connected">("idle"), [activeCall, setActiveCall] = useState<{ peer: Peer } | null>(null);
  const acceptCall = () => window.dispatchEvent(new CustomEvent("ij-call-accept"));
  const historyRef = useRef<HTMLDivElement>(null), pickerRef = useRef<HTMLInputElement>(null), draftRef = useRef<HTMLTextAreaElement>(null);
  const load = async () => {
    try {
      const [user, messages] = await Promise.all([api.me(), api.messages()]);
      setMe(user);
      setItems(messages);
      unreadChanged?.(messages.filter((message) => message.recipient_id === user.id && !message.read_at).length);
    } catch (e: any) {
      error(e.message);
    }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const sync = () => {
      const state = callStatus();
      setCallState(state.phase);
      setActiveCall(state.peer ? { peer: state.peer } : null);
    };
    sync();
    window.addEventListener(CALL_STATUS, sync);
    return () => window.removeEventListener(CALL_STATUS, sync);
  }, []);
  const scrollChat = (smooth = false) => requestAnimationFrame(() => {
    const element = historyRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  });
  useEffect(() => { if (active) { void api.readConversation(active).then(() => load()).then(() => scrollChat()).catch((e) => error(e.message)); } }, [active]);
  const conversations = me ? [...new Set(items.map((m) => m.sender_id === me.id ? m.recipient_id : m.sender_id).filter((uid) => Number.isInteger(uid)))].map((uid) => {
    const rows = items.filter((m) => m.sender_id === uid || m.recipient_id === uid), last = rows[rows.length - 1];
    if (!last) return null;
    const incoming = last.sender_id === uid;
    return { uid, name: incoming ? last.sender : last.recipient, avatar: incoming ? last.sender_avatar : last.recipient_avatar, last: { ...last, content: previewText(last.content) }, unread: rows.filter((m) => m.sender_id === uid && !m.read_at).length };
  }).filter(Boolean).sort((a: any, b: any) => b.last.id - a.last.id) as any[] : [];
  const chat = active ? items.filter((m) => m.sender_id === active || m.recipient_id === active) : [], peer = conversations.find((x) => x.uid === active);
  const send = async (e: React.FormEvent) => { e.preventDefault(); const uid = active || Number(newUid); if (!Number.isInteger(uid) || uid < 1) return error("请输入有效 UID"); try { await api.sendMessage({ recipientId: uid, content }); setActive(uid); setNewUid(""); setContent(""); await load(); scrollChat(true); } catch (x: any) { error(x.message); } };
  const sendImages = async (list: FileList | null) => {
    if (!list?.length) return;
    const uid = active || Number(newUid);
    if (!Number.isInteger(uid) || uid < 1) return error("请先选择一个会话");
    setUploading(true);
    try {
      for (const file of Array.from(list).slice(0, 9)) {
        if (!file.type.startsWith("image/")) continue;
        const uploaded = await api.uploadFile(file);
        await api.sendMessage({ recipientId: uid, content: uploaded.public_url });
      }
      setActive(uid);
      setNewUid("");
      await load();
      scrollChat(true);
    } catch (x: any) { error(x.message); } finally {
      setUploading(false);
      if (pickerRef.current) pickerRef.current.value = "";
    }
  };
  const begin = (e: React.FormEvent) => { e.preventDefault(); const uid = Number(newUid); if (!Number.isInteger(uid) || uid < 1) return error("请输入有效 UID"); if (uid === me?.id) return error("不能给自己发消息"); setActive(uid); setCreating(false); };
  return <section className="page messages-page"><div className="wechat-shell">
    <aside className="conversation-list"><div className="conversation-create">{creating ? <form onSubmit={begin}><input autoFocus type="number" min="1" placeholder="输入 UID" value={newUid} onChange={(e) => setNewUid(e.target.value)} /><button className="icon" title="确认"><Send /></button></form> : <button className="primary" onClick={() => setCreating(true)}><Plus />创建</button>}</div>{conversations.map((c) => <button key={c.uid} className={active === c.uid ? "active" : ""} onClick={() => setActive(c.uid)}><span><b>{c.name}</b><small>{c.last.content}</small></span>{c.unread > 0 && <i>{c.unread}</i>}</button>)}</aside>
    <main className="chat-panel">{active ? <><header>
      <button type="button" className={callState === "incoming" ? "video-call-start accept" : "video-call-start"} title="视频通话" onClick={() => callState === "incoming" ? acceptCall() : startCall({ uid: active, name: peer?.name || `UID ${active}`, avatar: peer?.avatar })}>
        <Video size={17} />
        <span>{callState === "incoming" ? "接听视频" : activeCall?.peer.uid === active && callState === "calling" ? "呼叫中…" : "视频通话"}</span>
      </button>
      <b>{peer?.name || `UID ${active}`} <small>(UID: {active})</small></b>
      <span className="chat-header-spacer" aria-hidden="true" />
    </header><div className="chat-history" ref={historyRef}>{chat.map((m) => { const mine = m.sender_id === me?.id; return <div key={m.id} className={`chat-message ${mine ? "mine" : "theirs"}`}><span className="chat-avatar">{(mine ? me?.avatar : m.sender_avatar) ? <img src={(mine ? me?.avatar : m.sender_avatar)} /> : (mine ? me?.username : m.sender)?.[0]}</span><div>{isImageMessage(m.content) ? <a href={m.content} target="_blank" rel="noreferrer"><img className="chat-image" src={m.content} alt="" loading="lazy" /></a> : <p className={voiceNoteOf(m.content) ? "chat-voice" : undefined} onClick={voiceNoteOf(m.content) ? (event) => playVoice(event, voiceNoteOf(m.content)!.url) : undefined}>{voiceNoteOf(m.content) ? `语音 ${voiceNoteOf(m.content)!.seconds}″` : m.content}</p>}<time>{new Date(m.created_at + "Z").toLocaleString()}</time></div></div>; })}</div><form className="chat-compose" onSubmit={send}><input ref={pickerRef} hidden type="file" accept="image/*" multiple onChange={(e) => void sendImages(e.target.files)} /><button type="button" className="icon chat-attach" title={uploading ? "上传中…" : "发送图片"} disabled={uploading || !(active || newUid)} onClick={() => pickerRef.current?.click()}>{uploading ? "…" : <ImageIcon />}</button><EmojiPicker disabled={!active} onPick={(emoji) => insertAtCaret(draftRef.current, content, emoji, setContent)} /><textarea ref={draftRef} required maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="输入消息，可粘贴图片" onPaste={(e) => { const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); void sendImages(dt.files); } }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button className="icon" title="发送"><Send /></button></form></> : <div className="chat-empty"><Mail /><b>选择一个会话</b><span>点击左侧“创建”，使用 UID 发起对话</span></div>}</main>
  </div></section>;
}

export function BlogPage({ user, error }: { user: User | null; error: (s: string) => void }) {
  // /blog/<uid>/<post id>[/edit] is canonical; /blog/<post id>[/edit] is still
  // understood so previously shared links keep working.
  const path = location.pathname.replace(/\/$/, ""), match = path.match(/^\/blog\/(\d+)(\/\d+)?(\/edit)?$/);
  const initialId = match ? Number(match[2]?.slice(1) || match[1]) : null;
  const blogUrl = (item: any, edit = false) => `/blog/${item.user_id}/${item.id}${edit ? "/edit" : ""}`;
  const [posts, setPosts] = useState<any[]>([]), [post, setPost] = useState<any>(null), [mode, setMode] = useState<"list" | "create" | "detail" | "edit">(path === "/blog/create" ? "create" : match?.[3] ? "edit" : initialId ? "detail" : "list"), [title, setTitle] = useState(""), [content, setContent] = useState("");
  const load = () => api.blog().then(setPosts).catch((x) => error(x.message));
  const open = (next: "list" | "create" | "detail" | "edit", item?: any) => { setMode(next); if (item) { setPost(item); setTitle(item.title); setContent(item.content || ""); } history.pushState({}, "", next === "list" ? "/blog" : next === "create" ? "/blog/create" : blogUrl(item || post, next === "edit")); };
  useEffect(() => { if (initialId) api.blogPost(initialId).then((item) => { setPost(item); setTitle(item.title); setContent(item.content); }).catch((x) => error(x.message)); else load(); }, []);
  const save = async (e: React.FormEvent) => { e.preventDefault(); try { if (mode === "edit") { await api.updateBlog(post.id, { title, content }); const item = await api.blogPost(post.id); open("detail", item); } else { const created = await api.createBlog({ title, content }); const item = await api.blogPost(created.id); open("detail", item); } error(mode === "edit" ? "博客已更新" : "博客已发布"); } catch (x: any) { error(x.message); } };
if (mode === "create" || mode === "edit") return <section className="page blog-layout"><form className="settings-panel blog-editor blog-editor-page" onSubmit={save}><label>标题<input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>内容（必填）</label><div className="blog-editor-split"><textarea required value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => handleEditorTab(e, content, setContent)} placeholder="使用 Markdown 编写" /><Markdown>{content || "实时预览"}</Markdown></div><div className="blog-actions"><button className="primary"><Save />{mode === "edit" ? "更新" : "发布"}</button>{mode === "edit" && <button type="button" className="danger" onClick={async () => { if (!confirm("确定删除这篇博客？")) return; try { await api.deleteBlog(post.id); open("list"); load(); } catch (x: any) { error(x.message); } }}><Trash2 />删除</button>}<button type="button" className="plain" onClick={() => mode === "edit" ? open("detail", post) : open("list")}><ArrowLeft />取消</button></div></form><MarkdownHelp /></section>;
  if (mode === "detail" && post) return <section className="page blog-layout"><article className="settings-panel blog-detail"><header><span>{post.username} 的博客</span><h1>{post.title}</h1><p>{post.username} · {new Date(post.created_at + "Z").toLocaleString()}</p></header><Markdown>{post.content}</Markdown><footer>{(user?.id === post.user_id || user?.role === "admin") && <button className="plain" onClick={() => open("edit", post)}><Edit3 />编辑</button>}<span>{post.views} 次查看</span></footer></article><AuthorCard post={post} /></section>;
  return <section className="page blog-layout"><div className="settings-panel blog-index"><div className="blog-list">{posts.map((item) => <button key={item.id} onClick={async () => { try { const full = await api.blogPost(item.id); open("detail", full); } catch (x: any) { error(x.message); } }} aria-label={`打开博客 ${item.title}`}><time><b>{new Date(item.created_at + "Z").getDate()}</b>{new Date(item.created_at + "Z").toLocaleDateString("zh-CN", { year: "numeric", month: "numeric" })}</time><div><h2>{item.title}</h2><span>{item.views} 次查看 · {new Date(item.updated_at + "Z").toLocaleString()}</span></div></button>)}{!posts.length && <div className="empty">暂无博客</div>}</div></div><aside className="settings-panel blog-author"><h2>{user ? `${user.username} 的博客` : "博客"}</h2>{user ? <button className="primary" onClick={() => { setTitle(""); setContent(""); open("create"); }}><Plus />创建一个博文</button> : <p>登录后可以发布博客。</p>}</aside></section>;
}

function AuthorCard({ post }: { post: any }) { return <aside className="settings-panel blog-author-card"><div className="author-banner" /><div className="profile-avatar">{post.avatar ? <img src={post.avatar} alt="" /> : post.username[0]}</div><h2>{post.username}</h2></aside>; }
function MarkdownHelp() { return <aside className="settings-panel markdown-help"><h2>Markdown 语法</h2>{[["行内代码","`std::cout()`"],["代码区块","```c++\nint main() {\n  return 0;\n}\n```"],["行内公式","$E=mc^2$"],["公式区块","$$E=mc^2$$"],["链接","[文本](https://...)"],["高亮","==文本=="],["图片","![说明](https://...)"],["指定大小的图片","![说明](url =100x100)"],["脚注","Here is a ref[^1].\n\n[^1]: And the footnote."],["视频","@[video](https://.../a.mp4)"],["Mention","@[](/user/uid)"]].map(([name, code]) => <div key={name}><span>{name}</span><code>{code}</code></div>)}</aside>; }
