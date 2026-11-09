import { useCallback, useEffect, useRef, useState } from "react";

const LINES = [
  "今天也要好好刷题哦～",
  "这道题，看起来能过！",
  "累了就休息一下，我在这儿。",
  "又 AC 了一道？真厉害！",
  "要一起看排行榜吗？",
  "别忘了保存代码呀。",
  "悄悄告诉你：细节决定成败。",
  "加油，马上就到终点了！",
  "不会的题，多试几次就会啦。",
  "别熬夜太久，明天还要评测呢。",
];

const IMAGE = "/mascot/mascot.png";

type Mood = "idle" | "happy";

export function Mascot({ enabled }: { enabled: boolean }) {
  const [line, setLine] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [imageOk, setImageOk] = useState(true);
  const lastLine = useRef(-1);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  const say = useCallback((text: string) => {
    setLine(text);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setLine(null), 5200);
  }, []);

  const pickLine = () => {
    let index = Math.floor(Math.random() * LINES.length);
    if (index === lastLine.current) index = (index + 1) % LINES.length;
    lastLine.current = index;
    return LINES[index];
  };

  const poke = () => {
    if (dragging) return;
    setMood("happy");
    say(pickLine());
    window.setTimeout(() => setMood("idle"), 1400);
  };

  const startDrag = (event: React.PointerEvent) => {
    const figure = event.currentTarget as HTMLElement;
    const box = figure.getBoundingClientRect();
    const offsetX = event.clientX - box.left, offsetY = event.clientY - box.top;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && (Math.abs(e.clientX - box.left - offsetX) > 4 || Math.abs(e.clientY - box.top - offsetY) > 4)) {
        moved = true;
        setDragging(true);
      }
      if (!moved) return;
      setPos({
        x: Math.min(Math.max(0, e.clientX - offsetX), window.innerWidth - box.width),
        y: Math.min(Math.max(0, e.clientY - offsetY), window.innerHeight - box.height),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (!moved) poke();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!enabled) return null;

  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;

  return <div className={`mascot ${mood} ${dragging ? "dragging" : ""}`} style={style}>
    {line && <div className="mascot-bubble" role="status"><span>{line}</span><i /></div>}
    <button type="button" className="mascot-figure" aria-label="点击和看板娘互动" title="点我一下～" onPointerDown={startDrag}>
      {imageOk
        ? <img src={IMAGE} alt="" draggable={false} onError={() => setImageOk(false)} />
        : <span className="mascot-fallback" aria-hidden="true">(・ω・)</span>}
    </button>
  </div>;
}
