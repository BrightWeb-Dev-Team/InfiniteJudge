import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Mascot } from "./mascot";
import "./style.css";

const THEMES = ["light", "dark", "meteor", "miku"] as const;

function Preview() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("light");
  document.documentElement.dataset.theme = theme;
  return <>
    <section className="page">
      <div className="page-title">
        <span className="kicker">MASCOT PREVIEW</span>
        <h1>看板娘预览</h1>
        <p>点一下看板娘会出现台词，可以拖动她换位置。切换下面的主题看配色。</p>
      </div>
      <div className="theme-switcher" style={{ marginTop: 12 }}>
        {THEMES.map((item) => <button key={item} className={theme === item ? "active" : ""} onClick={() => setTheme(item)}>
          {{ light: "亮色", dark: "暗色", meteor: "流星雨", miku: "初音" }[item]}
        </button>)}
      </div>
      <div className="settings-panel" style={{ marginTop: 24, padding: 24 }}>
        <h2>说明</h2>
        <p>这是用立绘图片做的看板娘，图片已抠成透明底，不依赖 Live2D Cubism 运行时与任何外部库。</p>
        <p>待机时会轻微上下呼吸浮动；鼠标移上去会抬起；点击会弹一下并冒出随机台词；也可以直接拖动她换位置。</p>
      </div>
    </section>
    <Mascot enabled />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Preview /></StrictMode>);
