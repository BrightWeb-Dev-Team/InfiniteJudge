import { useEffect, useRef, useState } from "react";
import { api, FriendGroups, FriendRequest, Moment, User } from "./api";
import { Check, Clock, Heart, ImagePlus, MessageCircle, Search, Send, Trash2, UserMinus, UserPlus, X } from "lucide-react";

function timeAgo(value: string) {
  const then = new Date(value.replace(" ", "T") + "Z").getTime();
  const diff = Date.now() - then;
  if (!Number.isFinite(diff)) return value;
  if (diff < 6e4) return "刚刚";
  if (diff < 36e5) return `${Math.floor(diff / 6e4)} 分钟前`;
  if (diff < 864e5) return `${Math.floor(diff / 36e5)} 小时前`;
  if (diff < 6048e5) return `${Math.floor(diff / 864e5)} 天前`;
  return new Date(then).toLocaleDateString();
}

function Avatar({ user, size = 44 }: { user: { username: string; avatar?: string }; size?: number }) {
  return <span className="moment-avatar" style={{ width: size, height: size, fontSize: size / 2.6 }}>
    {user.avatar ? <img src={user.avatar} alt="" /> : user.username[0]?.toUpperCase()}
  </span>;
}

export function MomentsPage({ user, error, onRequestsChange }: {
  user: User | null;
  error: (s: string) => void;
  onRequestsChange?: (count: number) => void;
}) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<globalThis.File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [onComment, setOnComment] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [friends, setFriends] = useState<FriendGroups>({ friends: [], incoming: [], outgoing: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<any> | null>(null);
  const [searching, setSearching] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const loadMoments = () => api.moments().then(setMoments).catch((x) => error(x.message));
  const loadFriends = () => api.friends().then((data) => { setFriends(data); onRequestsChange?.(data.incoming.length); }).catch((x) => error(x.message));

  useEffect(() => { if (!user) return; void loadMoments(); void loadFriends(); }, [user?.id]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const chooseFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).slice(0, 9 - files.length);
    if (!picked.length) return;
    setFiles((current) => [...current, ...picked].slice(0, 9));
    setPreviews((current) => [...current, ...picked.map((file) => URL.createObjectURL(file))].slice(0, 9));
    if (picker.current) picker.current.value = "";
  };
  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((current) => current.filter((_, i) => i !== index));
    setPreviews((current) => current.filter((_, i) => i !== index));
  };
  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !files.length) return error("请填写内容或选择图片");
    setPublishing(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) uploaded.push((await api.uploadMomentImage(file)).url);
      await api.createMoment({ content: content.trim(), images: uploaded });
      previews.forEach((url) => URL.revokeObjectURL(url));
      setContent(""); setFiles([]); setPreviews([]);
      await loadMoments();
      error("动态已发布");
    } catch (x: any) { error(x.message); } finally { setPublishing(false); }
  };
  const toggleLike = async (moment: Moment) => {
    try {
      const result = await api.toggleMomentLike(moment.id);
      setMoments((current) => current.map((item) => item.id === moment.id ? { ...item, liked: result.liked, likes: result.likes } : item));
    } catch (x: any) { error(x.message); }
  };
  const submitComment = async (moment: Moment) => {
    if (!commentText.trim()) return;
    try {
      const comment = await api.addMomentComment(moment.id, commentText.trim());
      setMoments((current) => current.map((item) => item.id === moment.id ? { ...item, comments: [...item.comments, comment] } : item));
      setCommentText(""); setOnComment(null);
    } catch (x: any) { error(x.message); }
  };
  const removeComment = async (moment: Moment, id: number) => {
    if (!confirm("删除这条评论？")) return;
    try {
      await api.deleteMomentComment(id);
      setMoments((current) => current.map((item) => item.id === moment.id ? { ...item, comments: item.comments.filter((c) => c.id !== id) } : item));
    } catch (x: any) { error(x.message); }
  };
  const removeMoment = async (moment: Moment) => {
    if (!confirm("删除这条动态？点赞和评论会一并删除。")) return;
    try { await api.deleteMoment(moment.id); await loadMoments(); error("动态已删除"); } catch (x: any) { error(x.message); }
  };
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) { setResults(null); return; }
    setSearching(true);
    try { setResults(await api.userSearch(query.trim())); } catch (x: any) { error(x.message); } finally { setSearching(false); }
  };
  const addFriend = async (id: number) => {
    try {
      const result = await api.sendFriendRequest(id);
      error(result.status === "accepted" ? "已成为好友" : "好友申请已发送");
      await loadFriends();
      if (query.trim()) setResults(await api.userSearch(query.trim()));
    } catch (x: any) { error(x.message); }
  };
  const respond = async (request: FriendRequest, status: "accepted" | "rejected") => {
    try {
      await api.respondFriendRequest(request.id, status);
      error(status === "accepted" ? `已添加 ${request.username} 为好友` : "已拒绝好友申请");
      await loadFriends();
    } catch (x: any) { error(x.message); }
  };
  const removeFriend = async (id: number, username: string) => {
    if (!confirm(`删除好友 ${username}？删除后你们将互相看不到对方的朋友圈。`)) return;
    try { await api.removeFriend(id); error("已删除好友"); await loadFriends(); await loadMoments(); } catch (x: any) { error(x.message); }
  };

  if (!user) return <section className="page">
    <div className="settings-panel moments-login"><Heart /><h1>朋友圈</h1><p>登录后即可查看好友动态、发布图文。</p></div>
  </section>;

  return <section className="page moments-page">
    <div className="page-title"><span className="kicker">MOMENTS</span><h1>朋友圈</h1><p>只对好友可见。发布你的近况，给好友点赞和评论。</p></div>
    <div className="moments-layout">
      <div className="moments-main">
        <form className="settings-panel moment-composer" onSubmit={publish}>
          <div className="moment-composer-head"><Avatar user={user} /><textarea maxLength={2000} rows={3} placeholder="这一刻的想法…" value={content} onChange={(e) => setContent(e.target.value)} /></div>
          {!!previews.length && <div className="moment-composer-previews">{previews.map((url, index) => <span key={url}><img src={url} alt="" /><button type="button" className="icon" title="移除" onClick={() => removeFile(index)}><X /></button></span>)}</div>}
          <div className="moment-composer-actions">
            <input ref={picker} hidden type="file" accept="image/*" multiple onChange={(e) => chooseFiles(e.target.files)} />
            <button type="button" className="plain" disabled={files.length >= 9} onClick={() => picker.current?.click()}><ImagePlus />图片 {files.length ? `(${files.length}/9)` : ""}</button>
            <button className="primary" disabled={publishing}><Send />{publishing ? "发布中…" : "发布"}</button>
          </div>
        </form>
        {moments.map((moment) => <article className="settings-panel moment-card" key={moment.id}>
          <Avatar user={moment} />
          <div className="moment-body">
            <header><b>{moment.username}</b><time>{timeAgo(moment.created_at)}</time></header>
            {moment.content && <p className="moment-text">{moment.content}</p>}
            {!!moment.images.length && <div className={`moment-images count-${Math.min(moment.images.length, 9)}`}>{moment.images.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" loading="lazy" /></a>)}</div>}
            <div className="moment-actions">
              <button type="button" className={moment.liked ? "active" : ""} onClick={() => toggleLike(moment)}><Heart />{moment.liked ? "已赞" : "赞"}{moment.likes.length ? ` ${moment.likes.length}` : ""}</button>
              <button type="button" className={onComment === moment.id ? "active" : ""} onClick={() => { setOnComment(onComment === moment.id ? null : moment.id); setCommentText(""); }}><MessageCircle />评论</button>
              {moment.mine && <button type="button" className="danger" onClick={() => removeMoment(moment)}><Trash2 />删除</button>}
            </div>
            {(!!moment.likes.length || !!moment.comments.length) && <div className="moment-social">
              {!!moment.likes.length && <div className="moment-likes"><Heart />{moment.likes.map((like) => <span key={like.user_id}>{like.username}</span>)}</div>}
              {!!moment.comments.length && <div className="moment-comments">{moment.comments.map((comment) => <div key={comment.id}><span><b>{comment.username}</b>：{comment.content}</span><time>{timeAgo(comment.created_at)}</time>{(comment.user_id === user.id || moment.user_id === user.id) && <button type="button" className="icon danger" title="删除评论" onClick={() => removeComment(moment, comment.id)}><Trash2 /></button>}</div>)}</div>}
            </div>}
            {onComment === moment.id && <form className="moment-comment-form" onSubmit={(e) => { e.preventDefault(); void submitComment(moment); }}>
              <input autoFocus maxLength={500} placeholder="写下你的评论" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
              <button className="icon" title="发送"><Send /></button>
            </form>}
          </div>
        </article>)}
        {!moments.length && <div className="settings-panel empty"><Heart />还没有动态。发布第一条，或先去右侧添加好友。</div>}
      </div>
      <aside className="moments-side">
        <section className="settings-panel friend-panel">
          <h2><UserPlus />添加好友</h2>
          <form className="friend-search" onSubmit={search}><input placeholder="搜索用户名" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="icon" disabled={searching} title="搜索"><Search /></button></form>
          {results && <div className="friend-results">{results.length ? results.map((item) => <div key={item.id}>
            <Avatar user={item} size={34} /><span><b>{item.username}</b><small>{item.relation === "friend" ? "已是好友" : item.relation === "pending_out" ? "已申请，等待确认" : item.relation === "pending_in" ? "对方已申请，请在下方处理" : `UID ${item.id}`}</small></span>
            {item.relation === "none" && <button type="button" className="icon" title="加好友" onClick={() => addFriend(item.id)}><UserPlus /></button>}
          </div>) : <div className="empty">没有找到用户</div>}</div>}
        </section>
        {!!friends.incoming.length && <section className="settings-panel friend-panel">
          <h2><Clock />好友申请 <b>{friends.incoming.length}</b></h2>
          <div className="friend-list">{friends.incoming.map((request) => <div key={request.id}>
            <Avatar user={request} size={34} /><span><b>{request.username}</b><small>{timeAgo(request.created_at)}</small></span>
            <button type="button" className="icon" title="接受" onClick={() => respond(request, "accepted")}><Check /></button>
            <button type="button" className="icon danger" title="拒绝" onClick={() => respond(request, "rejected")}><X /></button>
          </div>)}</div>
        </section>}
        <section className="settings-panel friend-panel">
          <h2>我的好友 {friends.friends.length ? <b>{friends.friends.length}</b> : null}</h2>
          {friends.friends.length ? <div className="friend-list">{friends.friends.map((friend) => <div key={friend.id}>
            <Avatar user={friend} size={34} /><span><b>{friend.username}</b><small>UID {friend.id}</small></span>
            <button type="button" className="icon danger" title="删除好友" onClick={() => removeFriend(friend.id, friend.username)}><UserMinus /></button>
          </div>)}</div> : <div className="empty">还没有好友</div>}
        </section>
        {!!friends.outgoing.length && <section className="settings-panel friend-panel">
          <h2>已发出的申请</h2>
          <div className="friend-list">{friends.outgoing.map((request) => <div key={request.id}>
            <Avatar user={request} size={34} /><span><b>{request.username}</b><small>等待对方确认</small></span>
            <button type="button" className="icon danger" title="撤回申请" onClick={async () => { try { await api.removeFriend(request.user_id); await loadFriends(); } catch (x: any) { error(x.message); } }}><X /></button>
          </div>)}</div>
        </section>}
      </aside>
    </div>
  </section>;
}
