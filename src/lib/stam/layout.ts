// Port of the layout algorithm in docs/tree-prototype.html. Keep it pure.
export const W = 1100, H = 900, CX = W / 2, CY = H - 74;

export type LayoutInput = { id: string; label: string; parents: string[]; step: number; knot?: boolean; status: string };
export type Pt = { x: number; y: number };
export type LNode<T extends LayoutInput = LayoutInput> = T & {
  _i: number; leaves: number; desc: number; depth: number; a: number; sib: number; r: number; x: number; y: number;
  isRoot: boolean; isLeaf: boolean;
  label0: Pt; anchor: "start" | "middle" | "end"; ly: number; leader: boolean; box?: LabelBox;
};

const jitter = (id: string) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h / 9973 - 0.5; };

export type Rect = { x: number; y: number; w: number; h: number };
export type LayoutOpts = {
  /** Rectangle (viewBox units) the tree and labels must keep clear of, e.g. the specimen card. */
  obstacle?: Rect | null;
  /** Rendered text width; defaults to an estimate so the layout stays pure in tests. */
  measure?: (label: string, major: boolean) => number;
};

export function computeLayout<T extends LayoutInput>(input: T[], opts: LayoutOpts = {}) {
  const nodes = input.map((n, i) => ({ ...n, _i: i, leaves: 0, desc: 0, depth: 0, a: 0, sib: 0, r: 0, x: 0, y: 0, isRoot: false, isLeaf: false, label0: { x: 0, y: 0 }, anchor: "start", ly: 0, leader: false })) as LNode<T>[];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, LNode<T>[]>(nodes.map((n) => [n.id, []]));
  let root = nodes[0]!;
  nodes.forEach((n) => { if (!n.parents.length) root = n; else kids.get(n.parents[0]!)?.push(n); });
  root.isRoot = true;
  const leaves = (n: LNode<T>): number => (n.leaves = kids.get(n.id)!.length ? kids.get(n.id)!.reduce((s, c) => s + leaves(c), 0) : 1);
  const desc = (n: LNode<T>): number => (n.desc = kids.get(n.id)!.reduce((s, c) => s + 1 + desc(c), 0));
  leaves(root); desc(root);
  let maxDepth = 1;
  const depth = (n: LNode<T>, d: number) => { n.depth = d; maxDepth = Math.max(maxDepth, d); kids.get(n.id)!.forEach((c) => depth(c, d + 1)); };
  depth(root, 0);
  const arrange = (arr: LNode<T>[], d: number) => {
    const s = [...arr].sort((a, b) => b.leaves - a.leaves || a._i - b._i);
    const out: LNode<T>[] = [];
    s.forEach((c, i) => ((i + d) % 2 === 0 ? out.push(c) : out.unshift(c)));
    return out;
  };
  const SPAN = 1.4;
  const place = (n: LNode<T>, a0: number, a1: number) => {
    const width = a1 - a0;
    n.a = n === root ? 0 : (a0 + a1) / 2 + jitter(n.id) * Math.min(0.06, width * 0.25);
    let a = a0;
    arrange(kids.get(n.id)!, n.depth).forEach((c, idx) => {
      const w = (width * c.leaves) / n.leaves;
      c.sib = idx;
      place(c, a, a + w);
      a += w;
    });
  };
  place(root, -SPAN, SPAN);
  const R = (CY - 64) / maxDepth;
  nodes.forEach((n) => {
    n.isLeaf = n !== root && !kids.get(n.id)!.length;
    let r = n.depth * R;
    if (n.isLeaf) {
      const extra = Math.min(2.2, (maxDepth - n.depth) * 0.2);
      r = (n.depth + extra + (n.sib % 2) * 0.45) * R;
    }
    n.r = r;
    n.x = CX + r * Math.sin(n.a) * 0.9;
    n.y = CY - r * (0.3 + 0.7 * Math.cos(n.a));
  });
  const xs = nodes.map((n) => n.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const fit = Math.min(1, (CX - 190) / Math.max(1, CX - minX), (W - 210 - CX) / Math.max(1, maxX - CX));
  nodes.forEach((n) => { n.x = CX + (n.x - CX) * fit; });
  const ob = opts.obstacle;
  if (ob) {
    // shrink the tree toward its root until no node sits under the card
    const pad = 18;
    const inside = () => nodes.some((n) => n.x > ob.x - pad && n.x < ob.x + ob.w + pad && n.y > ob.y - pad && n.y < ob.y + ob.h + pad);
    for (let k = 0; k < 30 && inside(); k++) nodes.forEach((n) => { n.x = CX + (n.x - CX) * 0.97; n.y = CY + (n.y - CY) * 0.97; });
  }
  placeLabels(nodes, opts);
  return { nodes, byId, kids, root, R };
}

/** Approximate text width (the prototype measured with getBBox; this keeps layout pure). */
export function textWidth(s: string, major: boolean) {
  const size = major ? 15 : 13;
  let w = 0;
  for (const ch of s) w += /[\u2E80-\uFFEF]/.test(ch) ? size : /[A-Z0-9]/.test(ch) ? size * 0.66 : size * 0.55;
  return w;
}

export type LabelBox = { x0: number; x1: number; top: number; h: number };

/** Points sampled along every branch and merge line, used as obstacles for labels. */
export function pathSamples(nodes: LNode<any>[], byId: Map<string, LNode<any>>) {
  const pts: (Pt & { a: string; b: string })[] = [];
  for (const n of nodes) {
    n.parents.forEach((pid: string, i: number) => {
      const p = byId.get(pid);
      if (!p) return;
      const c = i === 0 ? curve(p, n, 0.5, 0.3) : quad(p, n);
      for (let t = 0.04; t < 0.97; t += 0.04) pts.push({ ...bez(c, t), a: p.id, b: n.id });
    });
  }
  return pts;
}
function quad(a: Pt, b: Pt): Pt[] {
  // the merge path's quadratic, written as an equivalent cubic
  const m = mergeCtrl(a, b);
  return [a, { x: a.x + (2 / 3) * (m.x - a.x), y: a.y + (2 / 3) * (m.y - a.y) }, { x: b.x + (2 / 3) * (m.x - b.x), y: b.y + (2 / 3) * (m.y - b.y) }, b];
}

export function boxOverlap(a: LabelBox, b: LabelBox, gap = 2) {
  return !(a.x1 + gap <= b.x0 || b.x1 + gap <= a.x0 || a.top + a.h + gap <= b.top || b.top + b.h + gap <= a.top);
}
const hitPt = (b: LabelBox, p: Pt, pad = 3) => p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.top - pad && p.y < b.top + b.h + pad;
const hitRect = (b: LabelBox, r: Rect) => b.x1 > r.x && b.x0 < r.x + r.w && b.top + b.h > r.y && b.top < r.y + r.h;

function placeLabels(nodes: LNode<any>[], opts: LayoutOpts) {
  const measure = opts.measure ?? textWidth;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const samples = pathSamples(nodes, byId);
  const dots = nodes.map((n) => ({ x: n.x, y: n.y, id: n.id }));
  const ob = opts.obstacle ?? null;
  const own = (n: LNode<any>, p: { a?: string; b?: string; id?: string }) => p.id === n.id || p.a === n.id || p.b === n.id;
  const boxFor = (n: LNode<any>, side: "start" | "end" | "middle", w: number, h: number) => {
    const x = side === "middle" ? n.x : n.x + (side === "start" ? 13 : -13);
    const y = side === "middle" ? n.y + 30 : n.y + 5;
    const x0 = side === "start" ? x : side === "end" ? x - w : x - w / 2;
    return { x, y, box: { x0: x0 - 3, x1: x0 + w + 3, top: y - h * 0.78 - 1, h } };
  };
  const cost = (n: LNode<any>, b: LabelBox) => {
    let c = 0;
    for (const p of samples) if (!own(n, p) && hitPt(b, p)) c++;
    for (const d of dots) if (d.id !== n.id && hitPt(b, d, 6)) c += 4;
    if (ob && hitRect(b, ob)) c += 20;
    if (b.x0 < 4 || b.x1 > W - 4) c += 20;
    return c;
  };
  // Greedy search: important labels first, each takes the freest spot near its node
  // (either side, nudged up or down), scored against everything already placed.
  const order = [...nodes].sort((x, y) => Number(!!y.isRoot) - Number(!!x.isRoot) || Number(!!y.knot) - Number(!!x.knot) || x.depth - y.depth || x._i - y._i);
  const placed: LabelBox[] = [];
  const OFFS = [0, -6, 6, -12, 12, -18, 18, -24, 24, -32, 32, -40, 40, -50, 50, -62, 62];
  for (const n of order) {
    const major = !!n.knot || n.isRoot;
    const w = measure(n.label, major), h = major ? 20 : 17;
    const pref: "start" | "end" | "middle" = n.isRoot ? "middle" : n.x >= CX ? "start" : "end";
    const sides: ("start" | "end" | "middle")[] = n.isRoot ? ["middle"] : [pref, pref === "start" ? "end" : "start"];
    let best: { score: number; side: "start" | "end" | "middle"; x: number; y: number; dy: number; box: LabelBox } | null = null;
    for (const side of sides) for (const dy of OFFS) {
      const c = boxFor(n, side, w, h);
      const box = { ...c.box, top: c.box.top + dy };
      let score = cost(n, box) * 10 + Math.abs(dy) * 0.15 + (side === pref ? 0 : 1.5);
      for (const q of placed) if (boxOverlap(box, q)) score += 100;
      if (!best || score < best.score) best = { score, side, x: c.x, y: c.y, dy, box };
    }
    placed.push(best!.box);
    n.anchor = best!.side;
    n.label0 = { x: best!.x, y: best!.y };
    n.ly = best!.y + best!.dy;
    n.leader = Math.abs(best!.dy) > 7;
    n.box = best!.box;
  }
}

export function unit(n: LNode<any>): Pt {
  if (n.isRoot) return { x: 0, y: -1 };
  const dx = n.x - CX, dy = n.y - CY, d = Math.hypot(dx, dy) || 1;
  const ux = (dx / d) * 0.6, uy = (dy / d) * 0.6 - 0.4, m = Math.hypot(ux, uy) || 1;
  return { x: ux / m, y: uy / m };
}
function mergeCtrl(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let px = -dy / len, py = dx / len;
  if (py > 0) { px = -px; py = -py; }
  const bend = Math.min(50, len * 0.12);
  return { x: (a.x + b.x) / 2 + px * bend, y: (a.y + b.y) / 2 + py * bend };
}
export function mergePath(a: Pt, b: Pt) {
  const { x: mx, y: my } = mergeCtrl(a, b);
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
export function bez(p: Pt[], t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p[0]!.x + 3 * u * u * t * p[1]!.x + 3 * u * t * t * p[2]!.x + t * t * t * p[3]!.x,
    y: u * u * u * p[0]!.y + 3 * u * u * t * p[1]!.y + 3 * u * t * t * p[2]!.y + t * t * t * p[3]!.y,
  };
}
export function curve(a: LNode<any>, b: LNode<any>, k1: number, k2: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ua = unit(a), ub = unit(b);
  return [
    { x: a.x, y: a.y },
    { x: a.x + ua.x * len * k1, y: a.y + ua.y * len * k1 },
    { x: b.x - ub.x * len * k2, y: b.y - ub.y * len * k2 },
    { x: b.x, y: b.y },
  ];
}
export function taper(p: Pt[], w0: number, w1: number) {
  const N = 20, left: string[] = [], right: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const q = bez(p, t), a = bez(p, Math.max(0, t - 0.02)), b = bez(p, Math.min(1, t + 0.02));
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const half = (w0 + (w1 - w0) * t) / 2;
    left.push(`${(q.x - (dy / d) * half).toFixed(1)} ${(q.y + (dx / d) * half).toFixed(1)}`);
    right.push(`${(q.x + (dy / d) * half).toFixed(1)} ${(q.y - (dx / d) * half).toFixed(1)}`);
  }
  return "M" + left.join(" L") + " L" + right.reverse().join(" L") + "Z";
}
export const thick = (n: { desc: number }) => Math.min(13, 1.3 + 1.55 * Math.sqrt(n.desc + 1));

export const maxStep = (nodes: { step: number }[]) => Math.max(1, ...nodes.map((n) => n.step));

/** Which ideas are visible when the tree is shown as it was at `step`. */
export function visibleAt(nodes: { id: string; step: number }[], step: number) {
  return new Set(nodes.filter((n) => n.step <= step).map((n) => n.id));
}
/** Keep the selection if visible, else move to the newest visible idea. */
export function selectionAt(nodes: { id: string; step: number }[], step: number, selected: string | null) {
  const vis = visibleAt(nodes, step);
  if (selected && vis.has(selected)) return selected;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const last = nodes.filter((n) => n.step <= step).sort((a, b) => b.step - a.step || idx.get(b.id)! - idx.get(a.id)!)[0];
  return last?.id ?? null;
}
