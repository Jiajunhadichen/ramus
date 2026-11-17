/**
 * Which labels the tree writes out (v2.7): chosen by zoom and selection, never by a reading switch.
 * Pure, so the priority rule is tested. Boxes are in the tree's own units.
 */
export type LabelNode = { id: string; parents: string[]; outcome?: boolean; knot?: boolean; isRoot?: boolean; desc?: number };
export type Box = { x0: number; x1: number; top: number; h: number };

/** Fully written out at this zoom (k = 1 is the fitted view). */
export const ALL_LABELS_AT = 2.5;

/** Lower is more important: selected, root, outcome, knot, main lineage, more descendants, others. */
export function labelRank(n: LabelNode, main: Set<string>, selected: string | null): number[] {
  const tier = n.id === selected ? 0 : n.isRoot || !n.parents.length ? 1 : n.outcome ? 2 : n.knot ? 3 : main.has(n.id) ? 4 : 5;
  return [tier, -(n.desc ?? 0)];
}

export function byPriority<T extends LabelNode>(nodes: T[], main: Set<string>, selected: string | null): T[] {
  return [...nodes].sort((a, b) => {
    const ra = labelRank(a, main, selected), rb = labelRank(b, main, selected);
    return ra[0]! - rb[0]! || ra[1]! - rb[1]! || nodes.indexOf(a) - nodes.indexOf(b);
  });
}

/** Wanted before overlaps are settled. */
export function wantedLabels(nodes: LabelNode[], { k, main, selected, hover }: { k: number; main: Set<string>; selected: string | null; hover?: string | null }): Set<string> {
  const hasKids = new Set(nodes.flatMap((n) => n.parents.slice(0, 1)));
  const base = nodes.filter((n) => !n.parents.length || n.isRoot || main.has(n.id) || n.outcome || n.knot || hasKids.has(n.id));
  const want = new Set(base.map((n) => n.id));
  // zooming in writes out the rest, the most important first
  const rest = byPriority(nodes.filter((n) => !want.has(n.id)), main, selected);
  const share = Math.max(0, Math.min(1, (k - 1) / (ALL_LABELS_AT - 1)));
  rest.slice(0, Math.round(rest.length * share + 1e-9)).forEach((n) => want.add(n.id));
  if (selected) {
    const s = nodes.find((n) => n.id === selected);
    if (s) { want.add(s.id); s.parents.forEach((p) => want.add(p)); nodes.forEach((n) => { if (n.parents.includes(selected)) want.add(n.id); }); }
  }
  if (hover) want.add(hover);
  return want;
}

const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.top < b.top + b.h && b.top < a.top + a.h;

/** When two labels overlap, the less important one is hidden. A hovered label always shows. */
export function settleLabels<T extends LabelNode>(nodes: T[], want: Set<string>, boxOf: (n: T) => Box | null, main: Set<string>, selected: string | null, hover?: string | null): Set<string> {
  const kept: Box[] = [];
  const out = new Set<string>();
  const order = byPriority(nodes.filter((n) => want.has(n.id)), main, selected);
  if (hover) order.sort((a, b) => Number(b.id === hover) - Number(a.id === hover));
  for (const n of order) {
    const b = boxOf(n);
    if (!b) { out.add(n.id); continue; }
    if (n.id !== hover && kept.some((o) => hit(o, b))) continue;
    kept.push(b); out.add(n.id);
  }
  return out;
}

/** Font size in tree units so that labels read 13–18px on screen; `s` is screen px per tree unit at fit. */
export function labelSize(k: number, s: number, base = 15): number {
  const screen = Math.max(13, Math.min(18, base * s * k));
  return screen / (s * k);
}
