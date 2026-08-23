import type { KeyboardEvent } from "react";

const INDENT = "    ";
const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
};
const CLOSING = new Set(Object.values(PAIRS));

export function handleEditorTab(
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (value: string) => void,
) {
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  const restoreSelection = (selectionStart: number, selectionEnd: number) => {
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  if (event.nativeEvent.isComposing) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    document.execCommand(event.shiftKey ? "redo" : "undo");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    document.execCommand("redo");
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineBeforeCaret = value.slice(lineStart, start);
    const baseIndent = lineBeforeCaret.match(/^[\t ]*/)?.[0] ?? "";
    const previous = value[start - 1];
    const next = value[end];
    const opensBlock = previous === "{" || previous === "[" || previous === "(" || /:\s*$/.test(lineBeforeCaret);
    const closesBlock = PAIRS[previous] === next;
    const innerIndent = baseIndent + (opensBlock ? INDENT : "");
    const insertion = closesBlock
      ? `\n${innerIndent}\n${baseIndent}`
      : `\n${innerIndent}`;
    setValue(`${value.slice(0, start)}${insertion}${value.slice(end)}`);
    const caret = start + 1 + innerIndent.length;
    restoreSelection(caret, caret);
    return;
  }

  if (event.key === "Backspace" && start === end && PAIRS[value[start - 1]] === value[start]) {
    event.preventDefault();
    setValue(`${value.slice(0, start - 1)}${value.slice(start + 1)}`);
    restoreSelection(start - 1, start - 1);
    return;
  }

  if (CLOSING.has(event.key) && start === end && value[start] === event.key) {
    event.preventDefault();
    restoreSelection(start + 1, start + 1);
    return;
  }

  const closing = PAIRS[event.key];
  if (closing) {
    event.preventDefault();
    const selected = value.slice(start, end);
    setValue(`${value.slice(0, start)}${event.key}${selected}${closing}${value.slice(end)}`);
    if (start === end) restoreSelection(start + 1, start + 1);
    else restoreSelection(start + 1, end + 1);
    return;
  }

  if (event.key !== "Tab") return;

  event.preventDefault();

  if (!event.shiftKey && start === end) {
    setValue(`${value.slice(0, start)}${INDENT}${value.slice(end)}`);
    restoreSelection(start + INDENT.length, start + INDENT.length);
    return;
  }

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const selectionEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextNewline = value.indexOf("\n", selectionEnd);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const lines = value.slice(lineStart, lineEnd).split("\n");

  if (event.shiftKey) {
    const removed = lines.map((line) => {
      if (line.startsWith("\t")) return 1;
      return Math.min(line.match(/^ */)?.[0].length ?? 0, INDENT.length);
    });
    const replacement = lines.map((line, index) => line.slice(removed[index])).join("\n");
    const removedTotal = removed.reduce((total, count) => total + count, 0);
    const nextStart = Math.max(lineStart, start - removed[0]);
    const nextEnd = Math.max(nextStart, end - removedTotal);

    setValue(`${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`);
    restoreSelection(nextStart, nextEnd);
    return;
  }

  const replacement = lines.map((line) => `${INDENT}${line}`).join("\n");
  setValue(`${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`);
  restoreSelection(start + INDENT.length, end + INDENT.length * lines.length);
}
