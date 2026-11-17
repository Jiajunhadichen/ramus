// Port of the layout algorithm in docs/tree-prototype.html. Keep it pure.
export const W = 1100, H = 900, CX = W / 2, CY = H - 74;

export type LayoutInput = { id: string; label: string; parents: string[]; step: number; knot?: boolean; status: string };
export type Pt = { x: number; y: number };
export type LNode<T extends LayoutInput = LayoutInput> = T & {
  _i: number; leaves: number; desc: number; depth: number; a: number; sib: number; r: number; x: number; y: number;
  isRoot: boolean; isLeaf: boolean;
  label0: Pt; anchor: "start" | "middle" | "end"; ly: number; leader: boolean;
};

const jitter = (id: string) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h / 9973 - 0.5; };

export function computeLayout<T extends LayoutInput>(input: T[]) {
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
  placeLabels(nodes);
  return { nodes, byId, kids, root, R };
}

/** Approximate text width (the prototype measured with getBBox; this keeps layout pure). */
export function textWidth(s: string, major: boolean) {
  const size = major ? 15 : 13;
  let w = 0;
  for (const ch of s) w += /[\u2E80-\uFFEF]/.test(ch) ? size : /[A-Z0-9]/.test(ch) ? size * 0.66 : size * 0.55;
  return w;
}

function placeLabels(nodes: LNode<any>[]) {
  const items = nodes.map((n) => {
    const right = !n.isRoot && n.x >= CX;
    const x = n.isRoot ? n.x : n.x + (right ? 13 : -13);
    const y = n.isRoot ? n.y + 30 : n.y + 5;
    n.anchor = n.isRoot ? "middle" : right ? "start" : "end";
    n.label0 = { x, y };
    const major = !!n.knot || n.isRoot;
    const w = textWidth(n.label, major), h = major ? 20 : 17;
    const x0 = n.anchor === "start" ? x : n.anchor === "end" ? x - w : x - w / 2;
    return { n, x0: x0 - 3, x1: x0 + w + 3, h, top: y - h * 0.78 - 1, dy: 0 };
  });
  const dots = nodes.map((n) => ({ x: n.x, y: n.y }));
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      const a = items[i]!;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j]!;
        if (a.x1 < b.x0 || b.x1 < a.x0) continue;
        const at = a.top + a.dy, bt = b.top + b.dy;
        const ov = Math.min(at + a.h, bt + b.h) - Math.max(at, bt);
        if (ov > -2) {
          const push = (ov + 2) / 2 + 0.5;
          if (at <= bt) { a.dy -= push; b.dy += push; } else { a.dy += push; b.dy -= push; }
          moved = true;
        }
      }
      for (const d of dots) {
        if (d.x < a.x0 || d.x > a.x1) continue;
        const at = a.top + a.dy;
        if (d.y > at - 5 && d.y < at + a.h + 5 && Math.abs(d.x - a.n.x) + Math.abs(d.y - a.n.y) > 1) {
          a.dy += d.y > at + a.h / 2 ? -1.5 : 1.5;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  items.forEach((it) => {
    it.n.ly = it.n.label0.y + it.dy;
    it.n.leader = Math.abs(it.dy) > 7;
  });
}

export function unit(n: LNode<any>): Pt {
  if (n.isRoot) return { x: 0, y: -1 };
  const dx = n.x - CX, dy = n.y - CY, d = Math.hypot(dx, dy) || 1;
  const ux = (dx / d) * 0.6, uy = (dy / d) * 0.6 - 0.4, m = Math.hypot(ux, uy) || 1;
  return { x: ux / m, y: uy / m };
}
export function mergePath(a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  let px = -dy / len, py = dx / len;
  if (py > 0) { px = -px; py = -py; }
  const bend = Math.min(50, len * 0.12);
  const mx = (a.x + b.x) / 2 + px * bend, my = (a.y + b.y) / 2 + py * bend;
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
