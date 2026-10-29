import { useEffect, useRef } from "react";

const svgNamespace = "http://www.w3.org/2000/svg";
const contentSurfaces = [
  ".card", ".sidebar-card", ".table-wrap", ".recent", ".contest-detail", ".statement", ".submit-panel",
  ".submission-summary", ".submission-code", ".submission-detail", ".submission-private", ".submission-tests",
  ".contest-row", ".discussion article", ".contest-list article", ".manage-list article", ".problem-batch-bar",
  ".create-section", ".setup-section", ".home-ranking", ".rp-board", ".wechat-shell", ".contest-ranking",
  ".oil-hack-panel", ".customize-panel", ".thread-main", ".reply", ".reply-form", ".settings-panel",
  ".about-content", ".legal-document", ".hydro-main:not(.home-dashboard > .hydro-main)", ".hydro-side > section:not(.home-carousel)",
  ".announcement", ".ranking-panel", ".learning-list article", ".learning-editor", ".learning-detail",
  ".control-card", ".operations-card", ".profile-stats", ".profile-posts > article", ".domain-grid > button",
].join(", ");
const overlaySurfaces = ".site-header, .user-dropdown, .auth-modal, .announcement-modal, .modal-bg:not(.modal-page) > .manage-modal, .customize-actions, .control-nav, .site-header > nav.open, #root > footer";
const surfaces = `${overlaySurfaces}, ${contentSurfaces}`;
const maximumDisplacementScale = 84;
const displacementScale = (strength: number) => Math.min(100, Math.max(0, strength)) / 100 * maximumDisplacementScale;

function svgElement(name: string, attributes: Record<string, string>) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function lensMap(width: number, height: number, radius: number) {
  const canvas = document.createElement("canvas");
  const resolution = Math.min(1, 1000 / width, 600 / height);
  canvas.width = Math.max(1, Math.round(width * resolution));
  canvas.height = Math.max(1, Math.round(height * resolution));
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(canvas.width, canvas.height);
  const bevel = Math.min(40, height / 2.5, width / 2.5);
  const r = Math.min(radius, width / 2, height / 2);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const px = (x + .5) / resolution - width / 2;
      const py = (y + .5) / resolution - height / 2;
      const qx = Math.abs(px) - (width / 2 - r);
      const qy = Math.abs(py) - (height / 2 - r);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const depth = -(length + Math.min(Math.max(qx, qy), 0) - r);
      let dx = 0, dy = 0;
      if (depth >= 0 && depth < bevel) {
        const edgeBlend = 1 / (1 + Math.exp((qy - qx) / (bevel / 2)));
        const nx = edgeBlend;
        const ny = 1 - edgeBlend;
        // Zero slope at both ends prevents seams; a bounded derivative prevents image foldover.
        const distance = bevel * .26 * Math.sin(Math.PI * depth / bevel) ** 2;
        dx = -Math.tanh(px / 4) * nx * distance;
        dy = -Math.tanh(py / 4) * ny * distance;
      }
      const index = (y * canvas.width + x) * 4;
      image.data[index] = Math.round(128 + 255 * dx / maximumDisplacementScale);
      image.data[index + 1] = Math.round(128 + 255 * dy / maximumDisplacementScale);
      image.data[index + 2] = 128;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export function LiquidGlassEffects({ enabled, theme, strength }: { enabled: boolean; theme: string; strength: number }) {
  const filterRoot = useRef<Element | null>(null);
  const currentStrength = useRef(strength);
  useEffect(() => {
    currentStrength.current = strength;
    filterRoot.current?.querySelectorAll("feDisplacementMap").forEach((filter) => filter.setAttribute("scale", String(displacementScale(strength))));
  }, [strength]);
  useEffect(() => {
    if (!enabled) return;
    if (typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") return;
    const reducedTransparency = matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)");
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    // WebKit and Gecko accept the CSS syntax but do not render SVG backdrop displacement.
    const canRefract = /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent) && CSS.supports("backdrop-filter", "url(#glass)");
    let dispose = () => {};
    const install = () => {
      dispose();
      if (reducedTransparency.matches) return;
      const svg = svgElement("svg", { width: "0", height: "0", "aria-hidden": "true", focusable: "false" });
      svg.setAttribute("style", "position:absolute;pointer-events:none;overflow:hidden");
      const defs = svgElement("defs", {});
      filterRoot.current = defs;
      svg.append(defs);
      document.body.append(svg);
      const entries = new Map<HTMLElement, { filter: Element; size: string; position: string; visible: boolean }>();
      const dirty = new Set<HTMLElement>();
      let frame = 0, pointerFrame = 0, sceneFrame = 0, serial = 0;
      const wallpaper = !canRefract && theme === "miku" ? new Image() : null;
      const alignWallpaper = () => {
        sceneFrame = 0;
        if (!wallpaper?.naturalWidth) return;
        const viewportWidth = document.documentElement.clientWidth, viewportHeight = document.documentElement.clientHeight;
        const scale = Math.max(viewportWidth / wallpaper.naturalWidth, viewportHeight / wallpaper.naturalHeight);
        const width = wallpaper.naturalWidth * scale, height = wallpaper.naturalHeight * scale;
        for (const [element, entry] of entries) {
          if (!entry.visible) continue;
          const bounds = element.getBoundingClientRect();
          element.style.setProperty("--glass-scene-size", `${width}px ${height}px`);
          element.style.setProperty("--glass-scene-position", `${(viewportWidth - width) / 2 - bounds.left - element.clientLeft}px ${(viewportHeight - height) / 2 - bounds.top - element.clientTop}px`);
        }
      };
      const scheduleScene = () => {
        if (wallpaper && !sceneFrame) sceneFrame = requestAnimationFrame(alignWallpaper);
      };
      if (wallpaper) {
        wallpaper.onload = () => {
          for (const [element, entry] of entries) { entry.size = ""; schedule(element); }
        };
        wallpaper.src = "/assets/miku-wallpaper.jpg";
      }
      const prefix = `ij-glass-${Math.random().toString(36).slice(2)}`;
      const render = () => {
        frame = 0;
        for (const element of dirty) {
          const entry = entries.get(element);
          if (!entry || !element.isConnected || !entry.visible) continue;
          const width = element.offsetWidth, height = element.offsetHeight;
          const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
          const size = `${width}:${height}:${radius}`;
          if (!width || !height || size === entry.size) continue;
          entry.size = size;
          if (!canRefract && !wallpaper?.naturalWidth) { element.dataset.glassOptics = "fallback"; continue; }
          const map = lensMap(width, height, radius);
          if (!map) continue;
          // An 8-bit map encodes zero as 128/255; recenter it to exactly .5 for SVG displacement.
          const neutral = svgElement("feComponentTransfer", { in: "lens", result: "centered-lens" });
          neutral.append(
            svgElement("feFuncR", { type: "linear", slope: "1", intercept: String(-.5 / 255) }),
            svgElement("feFuncG", { type: "linear", slope: "1", intercept: String(-.5 / 255) }),
          );
          entry.filter.replaceChildren(
            svgElement("feImage", { href: map, x: "0", y: "0", width: String(width), height: String(height), preserveAspectRatio: "none", result: "lens" }),
            neutral,
            svgElement("feDisplacementMap", { in: "SourceGraphic", in2: "centered-lens", scale: String(displacementScale(currentStrength.current)), xChannelSelector: "R", yChannelSelector: "G" }),
          );
          element.style.setProperty("--glass-refraction", `url("#${entry.filter.id}") saturate(1.35)`);
          element.dataset.glassOptics = canRefract ? "refractive" : "wallpaper";
        }
        dirty.clear();
        alignWallpaper();
      };
      const schedule = (element: HTMLElement) => {
        dirty.add(element);
        if (!frame) frame = requestAnimationFrame(render);
      };
      const resize = new ResizeObserver((changes) => changes.forEach(({ target }) => schedule(target as HTMLElement)));
      const intersection = new IntersectionObserver((changes) => {
        for (const change of changes) {
          const element = change.target as HTMLElement;
          const entry = entries.get(element);
          if (!entry) continue;
          entry.visible = change.isIntersecting;
          if (entry.visible) { schedule(element); scheduleScene(); }
        }
      }, { rootMargin: "100px" });
      const resetElement = (element: HTMLElement) => {
        const entry = entries.get(element);
        if (entry) element.style.position = entry.position;
        delete element.dataset.glassOptics;
        element.style.removeProperty("--glass-refraction");
        element.style.removeProperty("--glass-light-angle");
        element.style.removeProperty("--glass-scene-size");
        element.style.removeProperty("--glass-scene-position");
      };
      const scan = () => {
        const current = new Set([...document.querySelectorAll<HTMLElement>(surfaces)].filter((element) => element.matches(overlaySurfaces) || !element.parentElement?.closest(contentSurfaces)));
        for (const [element, entry] of entries) {
          if (current.has(element)) { schedule(element); continue; }
          resize.unobserve(element);
          intersection.unobserve(element);
          entry.filter.remove();
          resetElement(element);
          entries.delete(element);
        }
        for (const element of current) {
          if (entries.has(element)) continue;
          const filter = svgElement("filter", { id: `${prefix}-${serial++}`, x: "0", y: "0", width: "100%", height: "100%", "color-interpolation-filters": "sRGB" });
          defs.append(filter);
          entries.set(element, { filter, size: "", position: element.style.position, visible: false });
          if (getComputedStyle(element).position === "static") element.style.position = "relative";
          element.dataset.glassOptics = "fallback";
          resize.observe(element);
          intersection.observe(element);
          schedule(element);
        }
      };
      const observer = new MutationObserver(scan);
      const root = document.getElementById("root");
      if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      scan();
      const move = (event: PointerEvent) => {
        if (reducedMotion.matches || event.pointerType === "touch") return;
        const element = (event.target as Element).closest<HTMLElement>(surfaces);
        if (!element || !entries.has(element)) return;
        cancelAnimationFrame(pointerFrame);
        pointerFrame = requestAnimationFrame(() => {
          const bounds = element.getBoundingClientRect();
          const angle = Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2) * 180 / Math.PI + 90;
          element.style.setProperty("--glass-light-angle", `${angle}deg`);
        });
      };
      document.addEventListener("pointermove", move, { passive: true });
      if (wallpaper) {
        document.addEventListener("scroll", scheduleScene, { passive: true, capture: true });
        window.addEventListener("resize", scheduleScene, { passive: true });
      }
      dispose = () => {
        observer.disconnect();
        resize.disconnect();
        intersection.disconnect();
        cancelAnimationFrame(frame);
        cancelAnimationFrame(pointerFrame);
        cancelAnimationFrame(sceneFrame);
        if (wallpaper) wallpaper.onload = null;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("scroll", scheduleScene, true);
        window.removeEventListener("resize", scheduleScene);
        for (const element of entries.keys()) resetElement(element);
        filterRoot.current = null;
        svg.remove();
      };
    };
    install();
    reducedTransparency.addEventListener("change", install);
    return () => { dispose(); reducedTransparency.removeEventListener("change", install); };
  }, [enabled, theme]);
  return null;
}
