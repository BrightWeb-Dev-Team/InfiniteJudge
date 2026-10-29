import { useEffect, useRef, useState } from "react";

// Native Unicode emoji only: they travel as plain text, so the iOS app, the website and
// the chat client all render them without any extra assets.
const EMOJI_GROUPS: Array<{ name: string; items: string[] }> = [
  { name: "常用", items: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😜", "🤪", "😎", "🤔", "😴", "😭", "😅", "🙄", "😤", "🥳", "🤗", "😇", "😮", "😱", "🤯", "😳"] },
  { name: "手势", items: ["👍", "👎", "👌", "✌️", "🤞", "🤝", "👏", "🙏", "💪", "👋", "🤙", "👊", "👀", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "🔥", "✨", "🎉", "🎁", "⭐", "☀️", "🌙", "☕"] },
  { name: "表情", items: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐤", "🦄", "🐝", "🌻", "🌈", "🍀", "🍎", "🍓", "🍉", "🍕", "🍔", "🍰", "🍺", "⚽", "🚀"] },
];

type Props = {
  onPick: (emoji: string) => void;
  disabled?: boolean;
};

/// Emoji picker button meant for the chat composer toolbar.
export function EmojiPicker({ onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div className="emoji-picker" ref={wrap}>
    <button type="button" className="icon" title="表情" aria-label="表情" disabled={disabled} onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" /><path d="M9 9.5h.01M15 9.5h.01" /></svg>
    </button>
    {open && <div className="emoji-panel" role="dialog" aria-label="选择表情">
      <div className="emoji-tabs">{EMOJI_GROUPS.map((entry, index) => <button type="button" key={entry.name} className={index === group ? "active" : ""} onClick={() => setGroup(index)}>{entry.name}</button>)}</div>
      <div className="emoji-grid">{EMOJI_GROUPS[group].items.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} title={emoji} onClick={() => onPick(emoji)}>{emoji}</button>)}</div>
    </div>}
  </div>;
}

/// Inserts text at the caret of a textarea and keeps the caret after the inserted text.
export function insertAtCaret(textarea: HTMLTextAreaElement | null, value: string, insert: string, update: (next: string) => void) {
  if (!textarea) {
    update(value + insert);
    return;
  }
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insert + value.slice(end);
  update(next.slice(0, 4000));
  requestAnimationFrame(() => {
    const caret = start + insert.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
}
