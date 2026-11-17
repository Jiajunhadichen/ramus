/**
 * The tree as a file: a standalone SVG (fonts embedded, colors resolved) or a high-resolution PNG.
 * Browser only. Downloads pass a poster-composed StamTree (see DownloadTree); the same fonts and canvas text
 * drawing keep the file identical to the screen, without hover rings, tooltips or running animations.
 */
import { facesFor, familiesOf, parseFontFaces } from "./fonts";

const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "opacity", "display", "visibility", "paint-order", "font-family", "font-size", "font-style", "font-weight", "letter-spacing",
  "text-decoration", "font-variant-numeric", "text-anchor", "dominant-baseline",
] as const;
const COLOR_PROPS = new Set(["fill", "stroke"]);
const SVG_NS = "http://www.w3.org/2000/svg";

/** Any CSS color (oklch, color-mix, var-resolved) as plain rgb(), so every program can open the file. */
function rgbOf(color: string, cache: Map<string, string>, ctx: CanvasRenderingContext2D): string {
  if (!color || color === "none" || color.startsWith("url(")) return color;
  const hit = cache.get(color);
  if (hit) return hit;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const out = a === 255 ? `rgb(${r}, ${g}, ${b})` : a === 0 ? "none" : `rgba(${r}, ${g}, ${b}, ${(a! / 255).toFixed(3)})`;
  cache.set(color, out);
  return out;
}

async function dataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** The page's @font-face rules, each with the address its file paths are relative to (fonts are served by Ramus). */
async function pageFontFaces() {
  const out: ReturnType<typeof parseFontFaces> = [];
  const walk = (rules: CSSRuleList, base: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) out.push(...parseFontFaces(rule.cssText, base));
      else if (rule instanceof CSSImportRule && rule.styleSheet) { try { walk(rule.styleSheet.cssRules, rule.styleSheet.href ?? base); } catch { /* not readable */ } }
      else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, base);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    const base = sheet.href ?? location.href;
    try { walk(sheet.cssRules, base); }
    catch { if (sheet.href) { try { out.push(...parseFontFaces(await (await fetch(sheet.href)).text(), sheet.href)); } catch { /* left out */ } } }
  }
  return out;
}

export type ExportOptions = { title: string; mark?: string; embedFonts?: boolean };

/** A standalone SVG string of the tree as it is drawn now. */
export async function treeSvg(svg: SVGSVGElement, { title, mark = "grown with Ramus", embedFonts = true }: ExportOptions): Promise<{ text: string; width: number; height: number }> {
  await document.fonts?.ready;
  const box = svg.viewBox.baseVal;
  const width = box?.width || svg.clientWidth, height = box?.height || svg.clientHeight;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const colors = new Map<string, string>();
  const used = new Map<string, Set<number>>();

  // copy what the stylesheet decides onto every element, so the file needs no stylesheet
  const src = [svg, ...Array.from(svg.querySelectorAll("*"))];
  const dst = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const drop: Element[] = [];
  src.forEach((el, i) => {
    const out = dst[i] as SVGElement | undefined;
    if (!out) return;
    const cs = getComputedStyle(el);
    if (el !== svg && (cs.display === "none" || cs.opacity === "0" || el.classList.contains("pulse") || el.classList.contains("selring"))) { drop.push(out); return; }
    const style: string[] = [];
    for (const p of STYLE_PROPS) {
      let v = cs.getPropertyValue(p);
      if (!v) continue;
      if (COLOR_PROPS.has(p)) v = rgbOf(v, colors, ctx);
      style.push(`${p}:${v}`);
    }
    out.setAttribute("style", style.join(";"));
    out.removeAttribute("class");
    out.removeAttribute("tabindex");
    out.removeAttribute("role");
    if (out.hasAttribute("mask")) out.removeAttribute("mask");
    // which characters each font family draws, to embed only the font slices needed
    if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
      const text = el.childNodes.length && Array.from(el.childNodes).every((n) => n.nodeType === Node.TEXT_NODE) ? el.textContent ?? "" : Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("");
      for (const f of familiesOf(cs.fontFamily)) {
        const set = used.get(f) ?? new Set<number>();
        for (const ch of text) set.add(ch.codePointAt(0)!);
        used.set(f, set);
      }
    }
  });
  for (const el of drop) el.remove();
  clone.querySelectorAll("mask, desc, title").forEach((el) => el.remove());

  // fitted to the sheet: no pan or zoom
  const view = Array.from(clone.children).find((c) => c.tagName === "g" && /translate\(/.test(c.getAttribute("transform") ?? ""));
  view?.setAttribute("transform", "translate(0 0) scale(1)");
  // the transparent click catcher reaches far beyond the sheet
  clone.querySelectorAll("rect").forEach((r) => { if (Number(r.getAttribute("x")) < 0 && r.getAttribute("fill") === "transparent") r.remove(); });

  // paper underneath, and a small mark in the naturalist's hand
  const paper = rgbOf(getComputedStyle(svg.closest("section") ?? document.body).backgroundColor || getComputedStyle(document.body).backgroundColor, colors, ctx);
  const sheet = document.createElementNS(SVG_NS, "rect");
  Object.entries({ x: "0", y: "0", width: String(width), height: String(height), fill: paper === "none" ? "#f3f1ea" : paper }).forEach(([k, v]) => sheet.setAttribute(k, v));
  clone.insertBefore(sheet, clone.firstChild);
  if (mark) {
  const sig = document.createElementNS(SVG_NS, "text");
  const handFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "IM Fell English, serif";
  Object.entries({ x: String(width - 18), y: String(height - 16), "text-anchor": "end" }).forEach(([k, v]) => sig.setAttribute(k, v));
  const sepia = getComputedStyle(document.documentElement).getPropertyValue("--sepia").trim() || "rgb(110, 88, 60)";
  sig.setAttribute("style", `font-family:${handFamily};font-style:italic;font-size:13px;fill:${rgbOf(sepia, colors, ctx)};opacity:0.85`);
  sig.textContent = mark;
  clone.appendChild(sig);
  for (const f of familiesOf(handFamily)) { const set = used.get(f) ?? new Set<number>(); for (const ch of mark) set.add(ch.codePointAt(0)!); used.set(f, set); }
  }

  // fonts, embedded: the very files the page draws with
  const faces = embedFonts ? facesFor(await pageFontFaces(), used) : [];
  if (embedFonts && !faces.length) throw new Error("the fonts could not be read");
  const rules = (await Promise.all(faces.map(async (f) => {
    const data = await dataUrl(f.url);
    // the unicode-range must travel too: without it a digits-only face or one slice of a CJK font would claim every character
    return data ? `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url(${data})${f.format ? ` format("${f.format}")` : ""};${f.range ? `unicode-range:${f.range};` : ""}}` : "";
  }))).join("\n");
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = rules;
  const defs = clone.querySelector("defs") ?? clone.insertBefore(document.createElementNS(SVG_NS, "defs"), clone.firstChild);
  defs.appendChild(style);
  const t = document.createElementNS(SVG_NS, "title");
  t.textContent = title;
  clone.insertBefore(t, clone.firstChild);

  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("aria-label");
  return { text: new XMLSerializer().serializeToString(clone), width, height };
}

/**
 * A PNG of the tree at `scale` times the sheet's size. A browser draws an SVG image before its fonts load,
 * so the shapes are drawn as an image and the words are drawn on top with the page's own loaded fonts,
 * at the exact places the browser laid them out.
 */
export async function treePng(svg: SVGSVGElement, opts: ExportOptions & { scale?: number }): Promise<Blob> {
  const { text, width, height } = await treeSvg(svg, { ...opts, embedFonts: false });
  const scale = opts.scale ?? 3;
  // lay the export out off screen at one pixel per unit, so positions can be measured
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = `position:fixed;left:-${width * 2 + 1000}px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  holder.innerHTML = text;
  document.body.appendChild(holder);
  try {
    const laid = holder.querySelector("svg")!;
    await document.fonts?.ready;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;

    // 1. everything but the words
    const shapes = laid.cloneNode(true) as SVGSVGElement;
    shapes.querySelectorAll("text").forEach((t) => t.remove());
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(shapes)], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally { URL.revokeObjectURL(url); }

    // 2. the words, run by run, where the browser put them
    const base = new DOMMatrix([scale, 0, 0, scale, 0, 0]);
    for (const t of Array.from(laid.querySelectorAll("text"))) {
      const tcs = getComputedStyle(t);
      if (tcs.display === "none" || tcs.visibility === "hidden") continue;
      let alpha = 1;
      for (let el: Element | null = t; el && el !== laid; el = el.parentElement) alpha *= Number(getComputedStyle(el).opacity || 1);
      const ctm = t.getCTM();
      if (!ctm) continue;
      const runs: { node: Text; from: number }[] = [];
      let at = 0;
      const walk = (n: Node) => n.childNodes.forEach((c) => { if (c.nodeType === Node.TEXT_NODE) { runs.push({ node: c as Text, from: at }); at += (c as Text).data.length; } else walk(c); });
      walk(t);
      const total = t.getNumberOfChars();
      for (const { node, from } of runs) {
        const str = node.data;
        if (!str.trim() || from >= total) continue;
        const el = node.parentElement!;
        const cs = getComputedStyle(el);
        const p = t.getStartPositionOfChar(from);
        ctx.setTransform(base.multiply(ctm));
        ctx.globalAlpha = alpha * Number(cs.opacity || 1);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const stroke = cs.stroke, sw = parseFloat(cs.strokeWidth);
        if (stroke && stroke !== "none" && sw > 0 && cs.paintOrder.startsWith("stroke")) {
          ctx.lineJoin = "round";
          ctx.lineWidth = sw;
          ctx.strokeStyle = stroke;
          ctx.strokeText(str, p.x, p.y);
        }
        if (cs.fill && cs.fill !== "none") { ctx.fillStyle = cs.fill; ctx.fillText(str, p.x, p.y); }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image could not be made."))), "image/png"));
  } finally {
    holder.remove();
  }
}

export function saveFile(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const fileName = (title: string, ext: string) => `${(title.trim() || "Ramus tree").replace(/[\\/:*?"<>|]+/g, "").slice(0, 80)}.${ext}`;
