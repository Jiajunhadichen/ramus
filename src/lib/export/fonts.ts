/**
 * Picking the web fonts an exported tree needs. Pure: no network.
 * A Google Fonts stylesheet splits each family into many @font-face slices by unicode-range;
 * an export embeds only the slices that cover characters actually drawn in that family.
 */
export type FontFace = { family: string; style: string; weight: string; ranges: [number, number][] | null; url: string; format: string | null };

export function parseFontFaces(css: string, base = ""): FontFace[] {
  const out: FontFace[] = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const prop = (name: string) => block.match(new RegExp(`${name}\\s*:\\s*([^;]+);?`, "i"))?.[1]?.trim() ?? null;
    const family = (prop("font-family") ?? "").replace(/^['"]|['"]$/g, "");
    const src = prop("src") ?? "";
    const m = src.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)(?:\s*format\(\s*['"]?([^'")]+)['"]?\s*\))?/i);
    if (!family || !m) continue;
    const url = /^(https?:|data:)/i.test(m[1]!) ? m[1]! : new URL(m[1]!, base || "http://localhost/").href;
    const range = prop("unicode-range");
    out.push({ family, style: prop("font-style") ?? "normal", weight: prop("font-weight") ?? "400", ranges: range ? parseRanges(range) : null, url, format: m[2] ?? null });
  }
  return out;
}

export function parseRanges(s: string): [number, number][] {
  return s.split(",").map((r) => r.trim().replace(/^U\+/i, "")).flatMap((r): [number, number][] => {
    if (r.includes("?")) return [[parseInt(r.replace(/\?/g, "0"), 16), parseInt(r.replace(/\?/g, "F"), 16)]];
    const [a, b] = r.split("-");
    const lo = parseInt(a!, 16), hi = b ? parseInt(b, 16) : lo;
    return Number.isNaN(lo) || Number.isNaN(hi) ? [] : [[lo, hi]];
  });
}

/** The faces to embed: one family's face is needed when it covers a character drawn in that family. */
export function facesFor(faces: FontFace[], used: Map<string, Set<number>>): FontFace[] {
  const norm = (f: string) => f.toLowerCase().replace(/^['"]|['"]$/g, "").trim();
  const byFamily = new Map<string, Set<number>>();
  for (const [family, chars] of used) byFamily.set(norm(family), chars);
  return faces.filter((f) => {
    const chars = byFamily.get(norm(f.family));
    if (!chars?.size) return false;
    if (!f.ranges) return true;
    for (const c of chars) if (f.ranges.some(([lo, hi]) => c >= lo && c <= hi)) return true;
    return false;
  });
}

/** The families in a computed font-family list, without generic names. */
export function familiesOf(fontFamily: string): string[] {
  return fontFamily.split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, "")).filter((f) => f && !/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif)$/i.test(f));
}
