import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

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
    .replace(/@\[video\]\((https?:\/\/[^\s)]+)\)/g, "![__IJ_VIDEO__]($1)")
    .replace(/@\[\]\(\/users?\/(\d+)\)/g, "[@$1](/users/$1)");
}

export function Markdown({ children, className = "" }: { children?: string; className?: string }) {
  return <div className={`markdown-body ${className}`.trim()}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkHighlight]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ href = "", children, ...props }) => <a href={href} target={/^https?:/.test(href) ? "_blank" : undefined} rel={/^https?:/.test(href) ? "noreferrer" : undefined} {...props}>{children}</a>,
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
