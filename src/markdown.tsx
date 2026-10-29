import { useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { api, type User } from "./api";

function remarkUserMentions() {
  return (tree: any, file: any) => {
    const source = String(file.value);
    const walk = (node: any) => {
      if (!node?.children || ["link", "linkReference"].includes(node.type)) return;
      node.children.forEach((child: any, index: number) => {
        const previous = node.children[index - 1];
        if (child.type === "link" && previous?.type === "text" && previous.value.endsWith("@")) {
          // Match the original spelling so escaped examples and reference links stay literal.
          const raw = source.slice(previous.position?.start.offset, child.position?.end.offset);
          const match = raw.match(/(?:^|[^\\])(?:\\\\)*@\[[^\n]*\]\(\/users?\/(\d+)\)$/);
          const uid = Number(match?.[1]);
          if (Number.isSafeInteger(uid) && uid > 0) {
            previous.value = previous.value.slice(0, -1);
            child.url = `/users/${uid}`;
            child.data = { hProperties: { "data-user-mention": uid } };
            child.children = [{ type: "text", value: `@${uid}` }];
          }
        }
        walk(child);
      });
    };
    walk(tree);
  };
}

type MentionUser = Pick<User, "username" | "avatar">;
const pendingUsers = new Map<number, Promise<MentionUser | null>>();

function loadMentionUser(uid: number) {
  let request = pendingUsers.get(uid);
  if (!request) {
    request = api.userProfile(uid).then(
      (user) => { pendingUsers.delete(uid); return { username: user.username, avatar: user.avatar }; },
      () => { pendingUsers.delete(uid); return null; },
    );
    pendingUsers.set(uid, request);
  }
  return request;
}

function UserMention({ uid }: { uid: number }) {
  const [user, setUser] = useState<MentionUser | null>(null);
  const [failedAvatar, setFailedAvatar] = useState(false);
  useEffect(() => {
    let active = true;
    loadMentionUser(uid).then((value) => { if (active) setUser(value); });
    return () => { active = false; };
  }, [uid]);
  return <a className="markdown-user-mention" href={`/users/${uid}`} title={`UID ${uid}`}>
    <span className="markdown-mention-avatar" aria-hidden="true">
      {user?.avatar && !failedAvatar
        ? <img src={user.avatar} alt="" onError={() => setFailedAvatar(true)} />
        : user?.username[0]?.toUpperCase() || "?"}
    </span>
    <span>{user?.username || `@${uid}`}</span>
  </a>;
}

const MarkdownLink: Components["a"] = ({ href = "", children, node, ...props }) => {
  const uid = Number(node?.properties?.["data-user-mention"]);
  if (Number.isSafeInteger(uid) && uid > 0) return <UserMention key={uid} uid={uid} />;
  return <a href={href} target={/^https?:/.test(href) ? "_blank" : undefined} rel={/^https?:/.test(href) ? "noreferrer" : undefined} {...props}>{children}</a>;
};

function remarkHighlight() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (!node?.children || ["code", "inlineCode"].includes(node.type)) return;
      node.children = node.children.flatMap((child: any) => {
        if (child.type !== "text" || !child.value.includes("==")) return [child];
        const parts = child.value.split(/(==[^=\n]+==)/g);
        return parts.filter(Boolean).map((part: string) => part.startsWith("==") && part.endsWith("==")
          ? { type: "emphasis", data: { hName: "mark" }, children: [{ type: "text", value: part.slice(2, -2) }] }
          : { type: "text", value: part });
      });
      node.children.forEach(walk);
    };
    walk(tree);
  };
}

function extensions(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\((\S+)\s+=(\d+)x(\d+)\)/g, "![$1]($2#ij-size=$3x$4)")
    .replace(/@\[video\]\((https?:\/\/[^\s)]+)\)/g, "![__IJ_VIDEO__]($1)");
}

export function Markdown({ children, className = "" }: { children?: string; className?: string }) {
  return <div className={`markdown-body ${className}`.trim()}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkUserMentions, remarkHighlight]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: MarkdownLink,
        img: ({ src = "", alt = "", ...props }) => {
          if (alt === "__IJ_VIDEO__") return <video className="markdown-video" src={src} controls preload="metadata" />;
          const match = src.match(/#ij-size=(\d+)x(\d+)$/);
          const clean = src.replace(/#ij-size=\d+x\d+$/, "");
          return <img src={clean} alt={alt} width={match ? Number(match[1]) : undefined} height={match ? Number(match[2]) : undefined} {...props} />;
        },
      }}
    >{extensions(children || "")}</ReactMarkdown>
  </div>;
}
