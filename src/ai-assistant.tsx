import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, MessageSquarePlus, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { api, type AiConversation } from "./api";
import { Markdown } from "./markdown";

type Message = { role: "user" | "assistant"; content: string };

export function AiAssistantPage({ user, error }: { user: { username: string }; error: (message: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [conversation, setConversation] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const openConversation = async (id: number) => { const result = await api.aiConversation(id); setConversation(result.conversation.id); setMessages(result.conversation.messages.map(({ role, content }) => ({ role, content }))); };
  const refreshConversations = async (selectLatest = false) => { const result = await api.aiConversations(); const list = result.conversations || []; setConversations(list); if (selectLatest && list[0]) await openConversation(list[0].id); };
  useEffect(() => { api.aiConfig().then((config) => setConfigured(Boolean(config.enabled))).catch(() => setConfigured(null)); refreshConversations().catch((cause: any) => error(cause.message)); }, []);
  useEffect(() => { const node = historyRef.current; if (node) node.scrollTop = node.scrollHeight; }, [messages, busy]);
  const newConversation = () => { setConversation(null); setMessages([]); setInput(""); };
  const send = async (event?: FormEvent) => {
    event?.preventDefault(); const content = input.trim(); if (!content || busy) return;
    setBusy(true); setInput(""); const next = [...messages, { role: "user" as const, content }]; setMessages(next); let id = conversation;
    try {
      if (!id) { const created = await api.createAiConversation(content.slice(0, 80)); id = created.conversation.id; setConversation(id); }
      await api.addAiConversationMessage(id, { role: "user", content });
      const result = await api.aiChat(next); setMessages((current) => [...current, result.message]);
      await api.addAiConversationMessage(id, result.message); await refreshConversations();
    } catch (cause: any) { setMessages((current) => current.slice(0, -1)); error(cause.message); }
    finally { setBusy(false); }
  };
  const removeConversation = async (id: number) => { try { await api.deleteAiConversation(id); setConversations((current) => current.filter((item) => item.id !== id)); if (conversation === id) newConversation(); } catch (cause: any) { error(cause.message); } };
  return <section className="page ai-assistant-page">
    <div className="page-title ai-assistant-title"><div><span className="kicker">AI ASSISTANT</span><h1>AI 助手</h1><p>针对算法学习、题目理解和代码思路提供即时帮助。</p></div><button className="plain" type="button" onClick={newConversation} disabled={!messages.length || busy}><RotateCcw />清空对话</button></div>
    <section className="ai-assistant-shell settings-panel">
      <aside className="ai-conversation-sidebar"><div className="ai-conversation-head"><b>历史对话</b><button className="icon-btn" type="button" title="新建对话" onClick={newConversation}><MessageSquarePlus /></button></div><button className={`ai-new-conversation ${conversation === null ? "active" : ""}`} type="button" onClick={newConversation}><MessageSquarePlus />新建对话</button><div className="ai-conversation-list">{conversations.map((item) => <div className={`ai-conversation-item ${conversation === item.id ? "active" : ""}`} key={item.id}><button type="button" onClick={() => openConversation(item.id).catch((cause: any) => error(cause.message))}><span>{item.title}</span><small>{item.message_count || 0} 条消息</small></button><button className="icon-btn" type="button" title="删除对话" onClick={() => removeConversation(item.id)}><Trash2 /></button></div>)}{!conversations.length && <p className="ai-history-empty">还没有历史对话</p>}</div></aside>
      <div className="ai-chat-main">
        {configured === false && <div className="ai-config-notice"><Bot /><div><b>AI 助手尚未启用</b><p>请联系 Root 管理员在控制面板配置接口和 API Key。</p></div></div>}
        <div className="ai-chat-history" ref={historyRef}>{!messages.length && <div className="ai-empty"><Sparkles /><b>你好，{user.username}</b><p>可以问我题目思路、算法概念或代码调试建议。</p></div>}{messages.map((message, index) => <article className={`ai-message ${message.role}`} key={`${index}-${message.content.slice(0, 12)}`}><span className="ai-message-icon">{message.role === "assistant" ? <Bot /> : user.username.slice(0, 1).toUpperCase()}</span><div>{message.role === "assistant" ? <Markdown>{message.content}</Markdown> : <p>{message.content}</p>}</div></article>)}{busy && <article className="ai-message assistant"><span className="ai-message-icon"><Bot /></span><div className="ai-thinking"><i /><i /><i /></div></article>}</div>
        <form className="ai-compose" onSubmit={send}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} disabled={busy || configured === false} placeholder={configured === false ? "AI 助手尚未配置" : "输入问题，Enter 发送，Shift + Enter 换行"} rows={3} /><button className="primary" disabled={busy || !input.trim() || configured === false}><Send />{busy ? "思考中..." : "发送"}</button></form>
      </div>
    </section>
  </section>;
}
