import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Camera, Heart, ImagePlus, LogOut, MessageSquarePlus, Mic, Play, Search, Send, Trash2, UserPlus, Users, Video, X,
} from "lucide-react";
import { api, FriendGroups, FriendRequest, Moment, User } from "./api";
import { VideoCall } from "./video-call";
import { EmojiPicker, insertAtCaret } from "./emoji";
import "./style.css";
import "./chat.css";

// Mobile chat client used by the iOS "信" shell. Only 信息 / 视频通话 / 朋友圈 are kept.
// Native hooks: window.ChatNative (provided by the iOS app) and window.ijChat (consumed by it).

type InfoMessage = {
  id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  read_at: string | null;
  created_at: string;
  sender: string;
  sender_avatar?: string;
  recipient: string;
  recipient_avatar?: string;
};

type Peer = { uid: number; name: string; avatar?: string };
type Tab = "chats" | "moments" | "me";
type Person = { id: number; username: string; avatar: string; relation?: string };
type VoiceClip = { duration: number; url: string };

type ChatBridge = {
  platform?: string;
  nativeNotifications?: boolean;
  notify?: (title: string, body: string) => void;
  startCall?: (uid: number, name: string, video: boolean) => boolean;
  endCall?: () => void;
  recordVoice?: () => Promise<VoiceClip | null>;
  cancelVoice?: () => void;
  pickImages?: () => Promise<Array<{ data: string; name: string }> | null>;
  logout?: () => void;
  setTitle?: (title: string, badge: number) => void;
};

declare global {
  interface Window {
    ChatNative?: ChatBridge;
    ijChat?: {
      resume: () => void;
      callEnded: (reason: "ended" | "offline") => void;
      readMessages: () => void;
    };
  }
}

const native = (): ChatBridge => window.ChatNative ?? {};
const isNative = () => Boolean(window.ChatNative);
const VOICE_RE = /^\[语音\](\d+)\|(\S+)$/;
const CALL_RE = /^【(视频|语音)通话】/;

function parseTime(value: string) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  return new Date(text.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? "" : "Z")).getTime();
}
const pad = (value: number) => String(value).padStart(2, "0");
function sqlTime(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function clock(value: string) {
  const date = new Date(parseTime(value));
  return Number.isNaN(date.getTime()) ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function shortTime(value: string) {
  const then = parseTime(value);
  if (!Number.isFinite(then)) return "";
  const now = Date.now(), date = new Date(then);
  if (now - then < 60 * 60000) return clock(value);
  if (new Date(now).toDateString() === date.toDateString()) return clock(value);
  if (now - then < 7 * 864e5) return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function dayLabel(value: string) {
  const then = parseTime(value), now = new Date();
  if (new Date().toDateString() === new Date(then).toDateString()) return "今天";
  if (new Date(Date.now() - 864e5).toDateString() === new Date(then).toDateString()) return "昨天";
  if (now.getFullYear() === new Date(then).getFullYear()) return new Date(then).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
  return new Date(then).toLocaleDateString("zh-CN");
}
function timeAgo(value: string) {
  const diff = Date.now() - parseTime(value);
  if (!Number.isFinite(diff)) return "";
  if (diff < 6e4) return "刚刚";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
  if (diff < 6048e5) return `${Math.floor(diff / 864e5)} 天前`;
  return new Date(parseTime(value)).toLocaleDateString("zh-CN");
}
function preview(text: string) {
  if (VOICE_RE.test(text)) return "[语音]";
  if (/^系统提示：/.test(text)) return text;
  return text;
}
function initial(name?: string) {
  return (name || "?").trim().slice(0, 1).toUpperCase();
}

function Avatar({ name, url, size = 46 }: { name?: string; url?: string; size?: number }) {
  return <span className="cv-avatar" style={{ width: size, height: size, fontSize: Math.round(size / 2.5) }}>
    {url ? <img src={url} alt="" /> : initial(name)}
  </span>;
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    if (!text) return;
    const timer = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timer);
  }, [text]);
  if (!text) return null;
  return <div className="cv-toast">{text}</div>;
}

function dataUrlToFile(data: string, name: string) {
  const [meta, body] = data.split(",");
  const type = /data:([^;]+)/.exec(meta)?.[1] || "image/jpeg";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type });
}

function Login({ done }: { done: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailVerification, setEmailVerification] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.authConfig().then((value) => setEmailVerification(value.emailVerification)).catch(() => {}); }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = mode === "login"
        ? await api.login(name.trim(), password)
        : await api.register(name.trim(), password, email, code);
      localStorage.setItem("ij-token", result.token);
      done(result.user);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return <div className="cv-login">
    <div className="cv-login-brand">信</div>
    <h1>{mode === "login" ? "欢迎回来" : "创建账户"}</h1>
    <p>只保留信息、视频通话与朋友圈。</p>
    <form onSubmit={submit}>
      <label>用户名<input autoFocus required minLength={3} maxLength={24} autoCapitalize="none" autoCorrect="off" value={name} onChange={(event) => setName(event.target.value)} placeholder="3-24 个字符" /></label>
      <label>密码<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></label>
      {mode === "register" && emailVerification && <>
        <label>邮箱<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>验证码<div className="cv-row-inline"><input required value={code} onChange={(event) => setCode(event.target.value)} /><button type="button" className="cv-plain" onClick={async () => { try { await api.sendEmailCode(email); setError("验证码已发送"); } catch (cause: any) { setError(cause.message); } }}>发送</button></div></label>
      </>}
      {error && <div className="cv-error">{error}</div>}
      <button className="cv-primary" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录" : "注册"}</button>
      <button type="button" className="cv-switch" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "没有账户？立即注册" : "已有账户？返回登录"}</button>
    </form>
  </div>;
}

const APIClientBase = () => "";
const IMAGE_URL_RE = /^(\/api\/public\/|https?:\/\/).*\.(png|jpe?g|gif|webp|heic|bmp)$/i;

function Bubble({ message, meId, groupStart, onVoice }: { message: InfoMessage; meId: number; groupStart: boolean; onVoice: (url: string, seconds: number) => void }) {
  const mine = message.sender_id === meId;
  const voice = VOICE_RE.exec(message.content);
  const seconds = voice ? Math.max(1, parseInt(voice[1], 10)) : 0;
  return <div className={`cv-msg ${mine ? "mine" : ""} ${groupStart ? "start" : ""}`}>
    {groupStart ? <Avatar name={message.sender} url={message.sender_avatar} size={36} /> : <span className="cv-avatar-gap" />}
    <div className="cv-msg-main">
      {voice
        ? <button type="button" className="cv-bubble cv-voice" style={{ width: `${Math.min(60, 24 + seconds * 3)}%` }} onClick={() => onVoice(voice[2], seconds)}><Play fill="currentColor" /><span>{seconds}″</span></button>
        : IMAGE_URL_RE.test(message.content.trim())
        ? <img className="cv-bubble cv-image" src={message.content.trim()} alt="" loading="lazy" onClick={() => window.open(APIClientBase() + message.content.trim(), "_blank")} />
        : CALL_RE.test(message.content)
        ? <div className="cv-call-note">{message.content.replace(CALL_RE, "").trim()}</div>
        : <div className="cv-bubble">{message.content}</div>}
      <time>{clock(message.created_at)}</time>
    </div>
  </div>;
}

function ChatView({ me, peer, messages, onBack, onCall, onSend, onVoice, onNotify }: {
  me: User;
  peer: Peer;
  messages: InfoMessage[];
  onBack: () => void;
  onCall: (video: boolean) => void;
  onSend: (text: string) => Promise<void>;
  onVoice: (clip: VoiceClip | null) => Promise<void> | void;
  onNotify: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [online, setOnline] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  const stick = useRef(true);

  const scrollToEnd = (smooth = false) => requestAnimationFrame(() => {
    const element = listRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  });
  useEffect(() => { stick.current = true; scrollToEnd(); }, [peer.uid]);
  useLayoutEffect(() => { if (stick.current) scrollToEnd(); }, [messages.length, messages[messages.length - 1]?.id]);
  useEffect(() => {
    let stopped = false;
    const check = () => api.userPresence(peer.uid).then((value) => { if (!stopped) setOnline(value.online); }).catch(() => {});
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [peer.uid]);
  const startedAt = useRef(0);
  useEffect(() => () => { mounted.current = false; audioRef.current?.pause(); native().cancelVoice?.(); }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    stick.current = true;
    try { await onSend(value); setText(""); } catch (cause: any) { onNotify(cause.message); } finally { setSending(false); }
  };
  const toggleRecording = async () => {
    const recorder = native().recordVoice;
    if (!recorder) return onNotify("当前环境不支持语音");
    if (recording) {
      setRecording(false);
      try {
        const clip = await recorder();
        if (clip) { stick.current = true; await onVoice(clip); }
        else onNotify("录音没有保存");
      } catch (cause: any) { onNotify(cause.message || "语音录制失败"); }
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try { await recorder(); }
    catch (cause: any) { setRecording(false); onNotify(cause.message || "无法开始录音"); }
  };
  const tail = Boolean(native().recordVoice);
  const play = (url: string, seconds: number) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playing === seconds) return setPlaying(0);
    const audio = new Audio(url);
    audio.onended = () => setPlaying(0);
    audio.onerror = () => { setPlaying(0); onNotify("无法播放语音"); };
    audioRef.current = audio;
    setPlaying(seconds);
    void audio.play().catch(() => { setPlaying(0); onNotify("无法播放语音"); });
  };

  return <div className="cv-chat">
    <header className="cv-chat-head">
      <button type="button" className="cv-back" onClick={onBack} aria-label="返回">‹</button>
      <div className="cv-chat-title"><b>{peer.name}</b><span>{online === null ? "\u00a0" : online ? "在线" : "离线"}</span></div>
      <button type="button" className="cv-round" onClick={() => onCall(true)} aria-label="视频通话"><Video /></button>
    </header>
    <div className="cv-chat-list" ref={listRef} onScroll={(event) => { const element = event.currentTarget; stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; }}>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at);
        const groupStart = newDay || previous.sender_id !== message.sender_id || parseTime(message.created_at) - parseTime(previous.created_at) > 4 * 60000;
        return <div key={message.id}>
          {newDay && <div className="cv-day">{dayLabel(message.created_at)}</div>}
          <Bubble message={message} meId={me.id} groupStart={groupStart} onVoice={play} />
        </div>;
      })}
      {!messages.length && <div className="cv-chat-empty">开始和 {peer.name} 聊天吧</div>}
    </div>
    <form className="cv-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      {tail && <button type="button" className={`cv-round ${recording ? "recording" : ""}`} onClick={() => void toggleRecording()} aria-label={recording ? "结束录音" : "录制语音"}>
        <Mic />
        {recording && <span className="cv-rec-time">{elapsed}″</span>}
      </button>}
      <EmojiPicker disabled={recording} onPick={(emoji) => insertAtCaret(inputRef.current, text, emoji, setText)} />
      <textarea ref={inputRef} rows={1} maxLength={4000} value={text} placeholder={recording ? `录音中 ${elapsed}″ · 点麦克风结束` : "发送消息"} onChange={(event) => setText(event.target.value)} onFocus={() => setTimeout(() => { stick.current = true; scrollToEnd(true); }, 300)} disabled={recording} />
      <button className="cv-send" disabled={!text.trim() || sending || recording} aria-label="发送"><Send /></button>
    </form>
  </div>;
}

function PersonRow({ person, trailing }: { person: Person; trailing?: React.ReactNode }) {
  return <div className="cv-person">
    <Avatar name={person.username} url={person.avatar} size={40} />
    <span><b>{person.username}</b><small>{person.relation === "friend" ? "好友" : person.relation === "pending_out" ? "已发送好友申请" : person.relation === "pending_in" ? "对方已申请好友" : `UID ${person.id}`}</small></span>
    {trailing}
  </div>;
}

function Sheet({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="cv-sheet-bg" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <div className="cv-sheet">
      <header><b>{title}</b><button type="button" className="cv-round" onClick={close} aria-label="关闭"><X /></button></header>
      {children}
    </div>
  </div>;
}

function CreateConversation({ me, close, onPick, onNotify }: { me: User; close: () => void; onPick: (peer: Peer) => void; onNotify: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if (/^\d+$/.test(value)) {
        const target = Number(value);
        if (target === me.id) return onNotify("不能给自己发消息");
        const profile = await api.userProfile(target);
        onPick({ uid: profile.id, name: profile.username, avatar: profile.avatar });
        return;
      }
      const rows = (await api.userSearch(value)) as Person[];
      setResults(rows.filter((row) => row.id !== me.id));
      if (!rows.length) onNotify("没有找到用户");
    } catch (cause: any) { onNotify(cause.message); } finally { setBusy(false); }
  };
  return <Sheet title="发起会话" close={close}>
    <form className="cv-search" onSubmit={search}><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名，或输入 UID" /><button className="cv-send" disabled={busy} aria-label="搜索"><Search /></button></form>
    <div className="cv-sheet-list">
      {(results || []).map((person) => <button type="button" key={person.id} className="cv-person-button" onClick={() => onPick({ uid: person.id, name: person.username, avatar: person.avatar })}><PersonRow person={person} /></button>)}
    </div>
  </Sheet>;
}

type Conversation = { uid: number; name: string; avatar?: string; last: InfoMessage; unread: number };

function ChatList({ messages, me, openedAt, onOpen, onCreate }: { messages: InfoMessage[]; me: User; openedAt: Record<number, number>; onOpen: (peer: Peer) => void; onCreate: () => void }) {
  const conversations = useMemo(() => {
    const map = new Map<number, Conversation>();
    for (const message of messages) {
      const mine = message.sender_id === me.id;
      const uid = mine ? message.recipient_id : message.sender_id;
      if (!Number.isInteger(uid)) continue;
      const entry = map.get(uid);
      if (entry && entry.last.id > message.id) continue;
      map.set(uid, {
        uid,
        name: mine ? message.recipient : message.sender,
        avatar: mine ? message.recipient_avatar : message.sender_avatar,
        last: message,
        unread: (entry?.unread || 0) + (!mine && !message.read_at && message.id > (openedAt[uid] || 0) ? 1 : 0),
      });
    }
    return [...map.values()].sort((a, b) => b.last.id - a.last.id);
  }, [messages, me.id, openedAt]);
  return <div className="cv-list">
    <header className="cv-tab-head"><h1>信息</h1><button type="button" className="cv-round" onClick={onCreate} aria-label="发起会话"><MessageSquarePlus /></button></header>
    <div className="cv-list-body">
      {conversations.map((conversation) => <button type="button" key={conversation.uid} className="cv-conv" onClick={() => onOpen({ uid: conversation.uid, name: conversation.name, avatar: conversation.avatar })}>
        <span className="cv-conv-wrap">
          <Avatar name={conversation.name} url={conversation.avatar} size={50} />
          {conversation.unread > 0 && <i className="cv-conv-badge">{conversation.unread > 99 ? "99+" : conversation.unread}</i>}
        </span>
        <span className="cv-conv-text">
          <span className="cv-conv-top"><b>{conversation.name}</b><time>{shortTime(conversation.last.created_at)}</time></span>
          <small>{conversation.last.sender_id === me.id ? "我：" : ""}{preview(conversation.last.content)}</small>
        </span>
      </button>)}
      {!conversations.length && <div className="cv-empty"><MessageSquarePlus /><b>还没有会话</b><span>点右上角按钮开始聊天</span></div>}
    </div>
  </div>;
}

function MomentComposer({ me, close, done, onNotify }: { me: User; close: () => void; done: () => Promise<void>; onNotify: (text: string) => void }) {
  const [content, setContent] = useState("");
  const [previews, setPreviews] = useState<Array<{ url: string; file: File }>>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = (files: File[]) => {
    if (!files.length) return;
    setPreviews((current) => [...current, ...files.slice(0, 9 - current.length).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const pick = async () => {
    if (native().pickImages) {
      const picked = await native().pickImages!();
      if (picked) add(picked.map((image) => dataUrlToFile(image.data, image.name)));
      else if (picked === null) onNotify("没有可用的图片");
    } else input.current?.click();
  };
  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!content.trim() && !previews.length) return onNotify("请填写内容或选择图片");
    setBusy(true);
    try {
      const images: string[] = [];
      for (const item of previews) images.push((await api.uploadMomentImage(item.file)).url);
      await api.createMoment({ content: content.trim(), images });
      previews.forEach((item) => URL.revokeObjectURL(item.url));
      close();
      await done();
    } catch (cause: any) { onNotify(cause.message); } finally { setBusy(false); }
  };
  return <div className="cv-sheet-bg" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <form className="cv-sheet cv-composer" onSubmit={publish}>
      <header><button type="button" className="cv-plain" onClick={close}>取消</button><b>发表动态</b><button className="cv-primary small" disabled={busy}>{busy ? "发布中…" : "发表"}</button></header>
      <div className="cv-composer-main">
        <Avatar name={me.username} url={me.avatar} size={42} />
        <textarea autoFocus maxLength={2000} rows={3} value={content} onChange={(event) => setContent(event.target.value)} placeholder="这一刻的想法…" />
      </div>
      {!!previews.length && <div className="cv-previews">{previews.map((item, index) => <span key={item.url}>
        <img src={item.url} alt="" />
        <button type="button" className="cv-remove" onClick={() => setPreviews((current) => { URL.revokeObjectURL(item.url); return current.filter((_, i) => i !== index); })} aria-label="移除"><X /></button>
      </span>)}</div>}
      <input ref={input} hidden type="file" accept="image/*" multiple onChange={(event) => { add(Array.from(event.target.files || [])); event.target.value = ""; }} />
      <button type="button" className="cv-plain add" onClick={pick} disabled={previews.length >= 9}><ImagePlus /> 图片 {previews.length ? `(${previews.length}/9)` : ""}</button>
    </form>
  </div>;
}

function Moments({ user, friends, refresh, onNotify, openChat }: { user: User; friends: FriendGroups; refresh: () => Promise<void>; onNotify: (text: string) => void; openChat: (peer: Peer) => void }) {
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [commenting, setCommenting] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sheet, setSheet] = useState<"friends" | "search" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [friendUid, setFriendUid] = useState("");

  const load = () => api.moments().then(setMoments).catch((cause: any) => onNotify(cause.message));
  useEffect(() => { void load(); }, [user.id]);

  const like = async (moment: Moment) => {
    setMoments((current) => current?.map((item) => item.id === moment.id ? { ...item, liked: !item.liked } : item) ?? null);
    try {
      const result = await api.toggleMomentLike(moment.id);
      setMoments((current) => current?.map((item) => item.id === moment.id ? { ...item, liked: result.liked, likes: result.likes } : item) ?? null);
    } catch (cause: any) { onNotify(cause.message); void load(); }
  };
  const submitComment = async (moment: Moment) => {
    const value = comment.trim();
    if (!value) return;
    try {
      const created = await api.addMomentComment(moment.id, value);
      setMoments((current) => current?.map((item) => item.id === moment.id ? { ...item, comments: [...item.comments, created] } : item) ?? null);
      setComment(""); setCommenting(null);
    } catch (cause: any) { onNotify(cause.message); }
  };
  const removeComment = async (moment: Moment, id: number) => {
    if (!confirm("删除这条评论？")) return;
    try {
      await api.deleteMomentComment(id);
      setMoments((current) => current?.map((item) => item.id === moment.id ? { ...item, comments: item.comments.filter((entry) => entry.id !== id) } : item) ?? null);
    } catch (cause: any) { onNotify(cause.message); }
  };
  const removeMoment = async (moment: Moment) => {
    if (!confirm("删除这条动态？点赞和评论会一并删除。")) return;
    try { await api.deleteMoment(moment.id); await load(); } catch (cause: any) { onNotify(cause.message); }
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    try { setResults((await api.userSearch(query.trim())) as Person[]); } catch (cause: any) { onNotify(cause.message); } finally { setSearching(false); }
  };
  const addFriend = async (person: Person) => {
    try {
      const result = await api.sendFriendRequest(person.id);
      onNotify(result.status === "accepted" ? "已成为好友" : "好友申请已发送");
      await refresh();
      if (query.trim()) setResults((await api.userSearch(query.trim())) as Person[]);
    } catch (cause: any) { onNotify(cause.message); }
  };
  const respond = async (request: FriendRequest, status: "accepted" | "rejected") => {
    try {
      await api.respondFriendRequest(request.id, status);
      onNotify(status === "accepted" ? `已添加 ${request.username} 为好友` : "已拒绝好友申请");
      await refresh(); await load();
    } catch (cause: any) { onNotify(cause.message); }
  };
  const unfriend = async (id: number, name: string) => {
    if (!confirm(`删除好友 ${name}？删除后你们将互相看不到对方的朋友圈。`)) return;
    try { await api.removeFriend(id); onNotify("已删除好友"); await refresh(); await load(); } catch (cause: any) { onNotify(cause.message); }
  };
  const chatWithFriend = async (event: React.FormEvent) => {
    event.preventDefault();
    const target = Number(friendUid);
    if (!Number.isInteger(target) || target < 1) return onNotify("请输入有效的 UID");
    if (target === user.id) return onNotify("不能和自己聊天");
    try {
      const profile = await api.userProfile(target);
      setFriendUid(""); setSheet(null);
      openChat({ uid: profile.id, name: profile.username, avatar: profile.avatar });
    } catch (cause: any) { onNotify(cause.message); }
  };

  const requests = friends.incoming.length;
  const [seenRequests, setSeenRequests] = useState(0);
  return <div className="cv-moments">
    <div className="cv-cover">
      <div className="cv-cover-pattern" />
      <div className="cv-cover-title"><Avatar name={user.username} url={user.avatar} size={66} /><div><b>{user.username}</b><small>朋友圈</small></div></div>
      <div className="cv-cover-actions">
        <button type="button" onClick={() => { setQuery(""); setResults(null); setSheet("search"); }}><UserPlus />加好友</button>
        <button type="button" onClick={() => { setSheet("friends"); setSeenRequests(requests); }}><Users />好友{requests - seenRequests > 0 && <i>{requests - seenRequests}</i>}</button>
        <button type="button" className="cv-camera" onClick={() => setComposing(true)} aria-label="发表动态"><Camera /></button>
      </div>
    </div>
    <div className="cv-feed">
      {moments?.map((moment, index) => {
        const showDay = !index || dayLabel(moments[index - 1].created_at) !== dayLabel(moment.created_at);
        return <div key={moment.id}>
          {showDay && <div className="cv-day">{dayLabel(moment.created_at)}</div>}
          <article className="cv-moment">
            <Avatar name={moment.username} url={moment.avatar} size={42} />
            <div className="cv-moment-body">
              <header><b>{moment.username}</b>{moment.mine && <button type="button" className="cv-link danger" onClick={() => removeMoment(moment)}><Trash2 />删除</button>}</header>
              {moment.content && <p>{moment.content}</p>}
              {!!moment.images.length && <div className={`cv-images count-${Math.min(moment.images.length, 9)}`}>
                {moment.images.map((url) => <img key={url} src={url} alt="" loading="lazy" onClick={() => setViewer(url)} />)}
              </div>}
              <footer>
                <span>{timeAgo(moment.created_at)}</span>
                <button type="button" className={commenting === moment.id ? "active" : ""} onClick={() => { setCommenting(commenting === moment.id ? null : moment.id); setComment(""); }}>评论</button>
                <button type="button" className={moment.liked ? "liked" : ""} onClick={() => like(moment)}><Heart fill={moment.liked ? "currentColor" : "none"} />{moment.liked ? "取消" : "赞"}</button>
              </footer>
              {(!!moment.likes.length || !!moment.comments.length) && <div className="cv-moment-social">
                {!!moment.likes.length && <div className="cv-likes"><Heart fill="currentColor" />{moment.likes.map((entry) => entry.username).join("，")}</div>}
                {moment.comments.map((entry) => <div className="cv-comment" key={entry.id}>
                  <span><b>{entry.username}</b>：{entry.content}</span>
                  {(entry.user_id === user.id || moment.mine) && <button type="button" className="cv-link danger" onClick={() => removeComment(moment, entry.id)}>删除</button>}
                </div>)}
              </div>}
            </div>
          </article>
        </div>;
      })}
      {moments !== null && !moments.length && <div className="cv-empty"><Camera /><b>朋友圈还没有内容</b><span>发表第一条动态，或先添加好友</span></div>}
      {moments === null && <div className="cv-loading">加载中…</div>}
    </div>

    {composing && <MomentComposer me={user} close={() => setComposing(false)} done={load} onNotify={onNotify} />}
    {commenting !== null && <div className="cv-comment-bar">
      <input autoFocus maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="评论" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const moment = moments?.find((item) => item.id === commenting); if (moment) void submitComment(moment); } }} />
      <button type="button" className="cv-send" onClick={() => { const moment = moments?.find((item) => item.id === commenting); if (moment) void submitComment(moment); }} aria-label="发送"><Send /></button>
    </div>}
    {sheet === "search" && <Sheet title="添加好友" close={() => setSheet(null)}>
      <form className="cv-search" onSubmit={search}><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名" /><button className="cv-send" disabled={searching} aria-label="搜索"><Search /></button></form>
      <div className="cv-sheet-list">
        {(results || []).map((person) => <PersonRow key={person.id} person={person} trailing={person.relation === "none"
          ? <button type="button" className="cv-primary small" onClick={() => addFriend(person)}><UserPlus />添加</button>
          : <small className="cv-hint">{person.id === user.id ? "我自己" : person.relation === "friend" ? "已是好友" : person.relation === "pending_out" ? "已申请" : "待确认"}</small>} />)}
        {results && !results.length && <div className="cv-sheet-empty">没有找到用户</div>}
        {!results && <div className="cv-sheet-empty">输入用户名查找</div>}
      </div>
    </Sheet>}
    {sheet === "friends" && <Sheet title={`好友 (${friends.friends.length})`} close={() => setSheet(null)}>
      <form className="cv-search" onSubmit={chatWithFriend}><input inputMode="numeric" value={friendUid} onChange={(event) => setFriendUid(event.target.value)} placeholder="输入 UID 发起聊天" /><button className="cv-send" aria-label="打开聊天"><MessageSquarePlus /></button></form>
      <div className="cv-sheet-list">
        {friends.incoming.map((request) => <PersonRow key={`in-${request.id}`} person={{ id: request.user_id, username: request.username, avatar: request.avatar }} trailing={<span className="cv-actions">
          <button type="button" className="cv-primary small" onClick={() => respond(request, "accepted")}>接受</button>
          <button type="button" className="cv-plain small" onClick={() => respond(request, "rejected")}>拒绝</button>
        </span>} />)}
        {friends.friends.map((friend) => <PersonRow key={friend.id} person={{ ...friend, relation: "friend" }} trailing={<button type="button" className="cv-plain small" onClick={() => unfriend(friend.id, friend.username)}>删除</button>} />)}
        {!friends.friends.length && !friends.incoming.length && <div className="cv-sheet-empty">还没有好友</div>}
      </div>
    </Sheet>}
    {viewer && <div className="cv-viewer" onClick={() => setViewer(null)}><img src={viewer} alt="" /></div>}
  </div>;
}

function Account({ user, logout }: { user: User; logout: () => void }) {
  return <div className="cv-account">
    <div className="cv-account-card">
      <Avatar name={user.username} url={user.avatar} size={76} />
      <b>{user.username}</b>
      <small>UID {user.id}</small>
    </div>
    <div className="cv-account-tip">「信」只保留信息、视频通话与朋友圈。修改头像、密码等资料请前往网页版账户设置。</div>
    <button type="button" className="cv-logout" onClick={logout}><LogOut />退出登录</button>
  </div>;
}

export function ChatApp() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [site, setSite] = useState({ name: "信", logo: "" });
  const [tab, setTab] = useState<Tab>("chats");
  const [messages, setMessages] = useState<InfoMessage[]>([]);
  const [active, setActive] = useState<Peer | null>(null);
  const [creating, setCreating] = useState(false);
  const [friends, setFriends] = useState<FriendGroups>({ friends: [], incoming: [], outgoing: [] });
  const [toast, setToast] = useState("");
  const [call, setCall] = useState<{ peer: Peer; pending?: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const [phone, setPhone] = useState(false);
  const initialUnread = useRef(true);
  const [openedAt, setOpenedAt] = useState<Record<number, number>>({});
  const activeRef = useRef<Peer | null>(null);
  const seenRef = useRef(0);
  activeRef.current = active;

  const notify = (text: string) => setToast(text);
  const uid = user?.id;

  const logout = () => {
    localStorage.removeItem("ij-token");
    setUser(null); setMessages([]); setFriends({ friends: [], incoming: [], outgoing: [] });
    setActive(null); setTab("chats"); setCreating(false); setCall(null); setPhone(false);
    native().endCall?.();
    native().logout?.();
  };
  const signIn = (value: User) => { setUser(value); setActive(null); setTab("chats"); setCreating(false); };

  useEffect(() => {
    if (localStorage.getItem("ij-token")) api.site().then((value) => setSite({ name: value.name || "信", logo: value.logo || "" })).catch(() => {});
    if (!localStorage.getItem("ij-token")) { setBooting(false); return; }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem("ij-token"))
      .finally(() => { setBooting(false); window.setTimeout(() => window.dispatchEvent(new CustomEvent("chat-resume")), 800); });
  }, []);

  useEffect(() => {
    document.title = site.name || "信";
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    if (site.logo) link.href = site.logo;
  }, [site]);

  const loadMessages = async (): Promise<InfoMessage[]> => {
    try {
      const rows = ((await api.messages()) as InfoMessage[]).sort((a, b) => a.id - b.id);
      setMessages(rows);
      return rows;
    } catch (cause: any) {
      if (cause.status === 401) { notify("登录已过期，请重新登录"); logout(); }
      return [];
    }
  };
  const loadFriends = async () => {
    try { setFriends(await api.friends()); } catch { /* keep previous list */ }
  };

  useEffect(() => {
    if (!uid) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const rows = await loadMessages();
      if (stopped) return;
      const peer = activeRef.current;
      if (peer) void api.readConversation(peer.uid).catch(() => {});
      for (const row of rows) {
        if (row.recipient_id !== uid || row.read_at || row.sender_id === peer?.uid || row.id <= seenRef.current) continue;
        seenRef.current = row.id;
        if (initialUnread.current) continue;
        const title = `${row.sender} 发来消息`;
        if (isNative() && !native().nativeNotifications) native().notify?.(title, preview(row.content));
        else if (!isNative()) notify(`${title}：${preview(row.content)}`);
      }
      initialUnread.current = false;
      api.friends().then(setFriends).catch(() => {});
    };
    void tick();
    const timer = window.setInterval(tick, 3000);
    const resume = () => { if (stopped) return; initialUnread.current = true; void tick(); };
    window.addEventListener("chat-resume", resume);
    document.addEventListener("visibilitychange", resume);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("chat-resume", resume); document.removeEventListener("visibilitychange", resume); };
  }, [uid]);

  useEffect(() => { if (uid) void loadFriends(); }, [uid]);

  useEffect(() => {
    if (!active) return;
    setOpenedAt((current) => ({ ...current, [active.uid]: Math.max(current[active.uid] || 0, messages[messages.length - 1]?.id || 0) }));
    api.readConversation(active.uid).catch(() => {});
    setMessages((current) => current.map((row) => row.sender_id === active.uid && !row.read_at ? { ...row, read_at: row.read_at ?? "read" } : row));
  }, [active?.uid, messages.length]);

  // Incoming rings mirror the browser client: poll /calls/signals and present the ring.
  useEffect(() => {
    if (!uid) return;
    let stopped = false;
    let last = 0;
    let lastRing = 0;
    const poll = async () => {
      try {
        const signals = await api.callSignals(last);
        for (const signal of signals) {
          if (stopped) return;
          last = Math.max(last, signal.id);
          if (signal.type !== "offer" || Date.now() - lastRing < 4000) continue;
          lastRing = Date.now();
          setCall((current) => current ? current : { peer: { uid: signal.sender_id, name: signal.sender, avatar: signal.sender_avatar }, pending: true });
          void api.sendCallSignal({ recipientId: signal.sender_id, callId: signal.call_id, type: "hangup" }).catch(() => {});
        }
      } catch { /* transient network errors are retried on the next tick */ }
      if (!stopped) window.setTimeout(poll, 1000);
    };
    void poll();
    return () => { stopped = true; };
  }, [uid]);

  useEffect(() => {
    (window as any).ijChat = {
      resume: () => window.dispatchEvent(new CustomEvent("chat-resume")),
      callEnded: (reason: "ended" | "offline") => {
        setPhone(false); setCall(null);
        const peer = activeRef.current;
        if (reason === "offline" && peer) void api.sendMessage({ recipientId: peer.uid, content: "系统提示：对方当前不在线，视频通话未接通。" }).catch(() => {});
        void loadMessages();
      },
      readMessages: () => { initialUnread.current = true; window.dispatchEvent(new CustomEvent("chat-resume")); },
    };
  }, []);

  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".cv-main");
    if (!scroller || !isNative()) return;
    let startY = 0;
    let tracking = false;
    const start = (event: TouchEvent) => {
      if (scroller.scrollTop > 0) { tracking = false; return; }
      startY = event.touches[0].clientY;
      tracking = true;
    };
    const move = (event: TouchEvent) => {
      if (!tracking) return;
      setPull(Math.min(80, Math.max(0, event.touches[0].clientY - startY)));
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      setPull((current) => {
        if (current > 56) { void loadMessages(); void loadFriends(); }
        return 0;
      });
    };
    scroller.addEventListener("touchstart", start as EventListener, { passive: true });
    scroller.addEventListener("touchmove", move as EventListener, { passive: true });
    scroller.addEventListener("touchend", end);
    scroller.addEventListener("touchcancel", end);
    return () => {
      scroller.removeEventListener("touchstart", start as EventListener);
      scroller.removeEventListener("touchmove", move as EventListener);
      scroller.removeEventListener("touchend", end);
      scroller.removeEventListener("touchcancel", end);
    };
  }, [Boolean(user), active]);

  const unread = user ? messages.filter((row) => row.recipient_id === user.id && !row.read_at).length : 0;
  const tabUnread = tab === "chats" ? unread : tab === "moments" ? friends.incoming.length : 0;
  const headerTitle = call?.pending ? "视频通话" : active ? "信息" : tab === "moments" ? "朋友圈" : tab === "me" ? "我" : "信息";
  useEffect(() => { native().setTitle?.(headerTitle, active || call?.pending ? 0 : tabUnread); }, [headerTitle, active?.uid, call?.pending, tabUnread]);

  if (booting) return <div className="cv-splash"><span>{(site.name || "信").slice(0, 1)}</span></div>;
  if (!user) return <><Login done={signIn} /><Toast text={toast} onClose={() => setToast("")} /></>;

  const activeMessages = active ? messages.filter((row) => row.sender_id === active.uid || row.recipient_id === active.uid).sort((a, b) => a.id - b.id) : [];
  const pushTemp = (content: string) => setMessages((current) => [...current, {
    id: (current[current.length - 1]?.id || 0) + 1000, sender_id: user.id, recipient_id: active!.uid, content, read_at: null, created_at: sqlTime(),
    sender: user.username, sender_avatar: user.avatar, recipient: active!.name, recipient_avatar: active!.avatar,
  }]);
  const sendText = async (text: string) => {
    if (!active) return;
    await api.sendMessage({ recipientId: active.uid, content: text });
    pushTemp(text);
  };
  const sendVoice = async (clip: VoiceClip | null) => {
    if (!active) return;
    if (!clip) { notify("录音没有保存"); return; }
    const response = await fetch(clip.url);
    const blob = await response.blob();
    const ext = (blob.type.split("/")[1] || "m4a").replace("x-", "");
    const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type || "audio/mp4" });
    const uploaded = await api.uploadFile(file);
    await api.sendMessage({ recipientId: active.uid, content: `[语音]${Math.max(1, Math.round(clip.duration))}|${uploaded.public_url}` });
  };
  const startCall = (peer: Peer) => {
    if (native().startCall) {
      if (!native().startCall!(peer.uid, peer.name, true)) notify("通话服务不可用");
      return;
    }
    if (!isNative()) { setCall({ peer }); return; }
    // Inside the iOS shell WebRTC cannot capture media; fall back to an in-app notice.
    notify("无法发起视频通话");
  };
  const endCall = async (reason: "ended" | "offline") => {
    const peer = call?.peer ?? active;
    setCall(null); setPhone(false);
    if (!peer) return;
    await api.sendMessage({ recipientId: peer.uid, content: reason === "offline" ? "系统提示：对方当前不在线，视频通话未接通。" : "【视频通话】通话已结束" }).catch(() => {});
    await loadMessages();
  };

  return <div className="cv-app">
    <div className="cv-main" style={{ transform: pull ? `translateY(${pull * 0.45}px)` : undefined }}>
      {pull > 0 && <div className="cv-pull" style={{ opacity: Math.min(1, pull / 56) }}>{pull > 56 ? "松开刷新" : "下拉刷新"}</div>}
      {tab === "chats" && !active && <ChatList messages={messages} me={user} openedAt={openedAt} onOpen={(peer) => setActive(peer)} onCreate={() => setCreating(true)} />}
      {tab === "chats" && active && <ChatView
        me={user}
        peer={active}
        messages={activeMessages}
        onBack={() => setActive(null)}
        onCall={() => startCall(active)}
        onSend={sendText}
        onVoice={sendVoice}
        onNotify={notify}
      />}
      {tab === "moments" && <Moments user={user} friends={friends} refresh={loadFriends} onNotify={notify} openChat={(peer) => { setTab("chats"); setActive(peer); }} />}
      {tab === "me" && <Account user={user} logout={logout} />}
    </div>
    {creating && <CreateConversation me={user} close={() => setCreating(false)} onNotify={notify} onPick={(peer) => { setCreating(false); setTab("chats"); setActive(peer); }} />}
    {!active && <nav className="cv-tabbar">
      <button type="button" className={tab === "chats" ? "active" : ""} onClick={() => { setTab("chats"); setActive(null); }}><span className="cv-tab-chat" />信息{unread > 0 && <em>{unread > 99 ? "99+" : unread}</em>}</button>
      <button type="button" className={tab === "moments" ? "active" : ""} onClick={() => { setTab("moments"); setActive(null); }}><span className="cv-tab-moments" />朋友圈{friends.incoming.length > 0 && <em>{friends.incoming.length}</em>}</button>
      <button type="button" className={tab === "me" ? "active" : ""} onClick={() => { setTab("me"); setActive(null); }}><span className="cv-tab-me" />我</button>
    </nav>}
    <Toast text={toast} onClose={() => setToast("")} />
    {call && call.pending && <div className="cv-ring">
      <Avatar name={call.peer.name} url={call.peer.avatar} size={92} />
      <b>{call.peer.name}</b>
      <span>邀请你视频通话</span>
      <div className="cv-ring-actions">
        <button type="button" className="reject" onClick={() => endCall("offline")} aria-label="拒绝"><X /></button>
        <button type="button" className="accept" onClick={() => startCall(call.peer)} aria-label="接听"><Video /></button>
      </div>
      {!native().startCall && <button type="button" className="cv-ring-text" onClick={() => endCall("offline")}>当前环境无法接听，回复未接通</button>}
    </div>}
    {phone && <div className="cv-phone"><VideoCall me={user} peer={null} report={notify} autoStartCall onEnded={(reason) => { setPhone(false); native().endCall?.(); void endCall(reason); }} /></div>}
  </div>;
}

export function startChatApp(container: HTMLElement) {
  document.documentElement.classList.add("chat-mode");
  createRoot(container).render(<ChatApp />);
}
