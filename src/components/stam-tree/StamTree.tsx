import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CX, CY, W, H, computeLayout, curve, mergePath, taper, textWidth, thick, type LayoutInput, type Rect } from "@/lib/stam/layout";
import { lineage, REASONS } from "@/lib/stam/focus";

export type TreeNode = LayoutInput & { by: string; color: string; status: "growing" | "dormant"; confirmed?: boolean };

export type SpecimenInfo = { no: number | string; title: string; collected?: string; collectors: string[] };

type Props = {
  nodes: TreeNode[];
  step: number;
  selected: string | null;
  onSelect?: (id: string | null) => void;
  /** Ideas born in this step grow in (null = none). */
  freshStep?: number | null;
  freshKey?: number;
  ariaLabel?: string;
  /** Specimen label card drawn top-left; the tree and labels keep clear of it. */
  specimen?: SpecimenInfo | null;
  /** Pan, zoom and the Fit button. */
  interactive?: boolean;
};

const CARD: Rect = { x: 16, y: 16, w: 290, h: 128 };
type View = { k: number; x: number; y: number };
const FIT: View = { k: 1, x: 0, y: 0 };

/** Measure label widths from rendered text after the fonts load (as the prototype does). */
function useMeasure(labels: { label: string; major: boolean }[]) {
  const [widths, setWidths] = useState<Map<string, number> | null>(null);
  const key = labels.map((l) => (l.major ? "M" : "m") + l.label).join("|");
  useEffect(() => {
    let alive = true;
    const run = () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "stam-tree");
      svg.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
      document.body.appendChild(svg);
      const m = new Map<string, number>();
      for (const l of labels) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("class", "lbl" + (l.major ? " major" : ""));
        t.textContent = l.label;
        svg.appendChild(t);
        m.set((l.major ? "M" : "m") + l.label, t.getBBox().width);
      }
      svg.remove();
      if (alive) setWidths(m);
    };
    run();
    document.fonts?.ready.then(() => alive && run());
    const onLoad = () => alive && run();
    document.fonts?.addEventListener?.("loadingdone", onLoad);
    return () => { alive = false; document.fonts?.removeEventListener?.("loadingdone", onLoad); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return widths;
}

export function StamTree({ nodes, step, selected, onSelect, freshStep = null, freshKey = 0, ariaLabel = "Idea tree", specimen = null, interactive = false }: Props) {
  const widths = useMeasure(useMemo(() => nodes.map((n) => ({ label: n.label, major: !!n.knot || !n.parents.length })), [nodes]));
  const L = useMemo(() => computeLayout(nodes, {
    obstacle: specimen ? CARD : null,
    measure: (s, major) => widths?.get((major ? "M" : "m") + s) ?? textWidth(s, major),
  }), [nodes, widths, specimen]);
  const focus = useMemo(() => lineage(nodes, selected), [nodes, selected]);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [view, setView] = useState<View>(FIT);
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const vis = (id: string) => (L.byId.get(id)?.step ?? Infinity) <= step;
  const dim = (...ids: string[]) => (focus && !ids.every((i) => focus.has(i)) ? " dim" : "");
  const cls = (id: string, from?: string) => "fade" + (vis(id) && (!from || vis(from)) ? "" : " off") + dim(id, ...(from ? [from] : []));

  // ---- tooltips: hover on pointer devices, long-press on touch
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipAt = (text: string, e: { clientX: number; clientY: number }) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setTip({ text, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const reasonOf = (n: TreeNode) => (n.confirmed === false ? REASONS.unconfirmed : n.knot ? REASONS.knot : n.status === "dormant" ? REASONS.resting : null);
  const tipProps = (text: string | null, id?: string) => ({
    onPointerEnter: (e: React.PointerEvent) => { if (id) setHover(id); if (text && e.pointerType === "mouse") tipAt(text, e); },
    onPointerLeave: () => { setHover(null); setTip(null); if (press.current) clearTimeout(press.current); },
    onPointerDown: (e: React.PointerEvent) => {
      if (!text || e.pointerType === "mouse") return;
      const { clientX, clientY } = e;
      press.current = setTimeout(() => tipAt(text, { clientX, clientY }), 500);
    },
    onPointerUp: () => { if (press.current) clearTimeout(press.current); },
  });

  // ---- pan & zoom (viewBox units)
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
  };
  const zoomAt = (p: { x: number; y: number }, f: number) => setView((v) => {
    const k = Math.min(4, Math.max(0.6, v.k * f));
    const g = k / v.k;
    return { k, x: p.x - (p.x - v.x) * g, y: p.y - (p.y - v.y) * g };
  });
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(toSvg(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; pinch?: number }>({ moved: false });
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { moved: false };
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; drag.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y); }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const next = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, next);
    if (ptrs.current.size === 2 && drag.current.pinch) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomAt(toSvg((a!.x + b!.x) / 2, (a!.y + b!.y) / 2), d / drag.current.pinch);
      drag.current.pinch = d; drag.current.moved = true; return;
    }
    const r = svgRef.current!.getBoundingClientRect();
    const dx = ((next.x - prev.x) / r.width) * W, dy = ((next.y - prev.y) / r.height) * H;
    if (!drag.current.moved && Math.hypot(next.x - prev.x, next.y - prev.y) < 3) { ptrs.current.set(e.pointerId, prev); return; }
    if (!drag.current.moved) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current.moved = true;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); };
  const click = (id: string | null) => { if (drag.current.moved) return; onSelect?.(id); };

  const fresh = (id: string) => freshStep != null && L.byId.get(id)?.step === freshStep;
  const hot = new Set([hover, selected].filter(Boolean) as string[]);
  const merges = L.nodes.flatMap((n) => n.parents.slice(1).map((mid) => ({ n, m: L.byId.get(mid) })).filter((x) => x.m));
  const mergeEl = (n: (typeof L.nodes)[number], m: NonNullable<(typeof merges)[number]["m"]>, front: boolean) => (
    <path key={`m-${m.id}-${n.id}`} d={mergePath(m, n)} fill="none" strokeWidth={front ? 1.6 : 1.2} strokeDasharray="4 5" strokeLinecap="round"
      className={"merge " + cls(n.id, m.id) + (front ? " front" : "")} style={{ stroke: (m as TreeNode).color }}
      {...tipProps(REASONS.merge)} />
  );

  return (
    <div ref={wrap} className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        className={"stam-tree block h-auto w-full select-none" + (interactive ? " touch-none" : "")}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <desc>Each dot is an idea. Branches show what grew from what, dashed lines show ideas recombining, colors show who said it, hollow tips are resting.</desc>
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="transparent" onClick={() => click(null)} />
        <g transform={`translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`}>
          <g>{merges.map(({ n, m }) => (hot.has(n.id) || hot.has(m!.id) ? null : mergeEl(n, m!, false)))}</g>
          <g>
            <line x1={CX - 120} y1={CY + 1} x2={CX + 120} y2={CY + 1} className="ground" />
            {L.nodes.map((n) => {
              if (!n.parents.length) return null;
              const p = L.byId.get(n.parents[0]!);
              if (!p) return null;
              const w1 = Math.max(1.1, thick(n) * 0.85);
              const w0 = Math.min(thick(p), Math.max(w1 * 1.5, w1 + 1));
              const c = curve(p, n, 0.5, 0.3);
              const grow = fresh(n.id);
              const mid = `g-${n.id.replace(/[^\w-]/g, "_")}-${freshKey}`;
              return (
                <g key={`b-${n.id}`}>
                  {grow && (
                    <mask id={mid} maskUnits="userSpaceOnUse">
                      <path d={`M${c[0]!.x} ${c[0]!.y} C${c[1]!.x} ${c[1]!.y} ${c[2]!.x} ${c[2]!.y} ${c[3]!.x} ${c[3]!.y}`} pathLength={1}
                        fill="none" stroke="white" strokeWidth={40} strokeLinecap="round" className="grow-mask" />
                    </mask>
                  )}
                  <path d={taper(c, w0, w1)} mask={grow ? `url(#${mid})` : undefined} className={"branch " + cls(n.id, p.id)}
                    style={{ fill: n.color, opacity: n.status === "dormant" ? 0.3 : 0.9 }} />
                </g>
              );
            })}
          </g>
          <g>{merges.map(({ n, m }) => (hot.has(n.id) || hot.has(m!.id) ? mergeEl(n, m!, true) : null))}</g>
          <g>
            {L.nodes.map((n) =>
              n.leader ? <line key={`l-${n.id}`} x1={n.x} y1={n.y} x2={n.anchor === "end" ? n.label0.x + 2 : n.label0.x - 2} y2={n.ly - 4} className={"leader " + cls(n.id)} /> : null,
            )}
          </g>
          <g>
            {L.nodes.map((n) => {
              const c = n.color;
              const resting = n.status === "dormant";
              return (
                <g key={`n-${n.id}`} className={"node " + cls(n.id)} tabIndex={vis(n.id) ? 0 : -1} role="button" aria-label={n.label}
                  {...tipProps(reasonOf(n), n.id)}
                  onClick={(e) => { e.stopPropagation(); click(n.id); }}
                  onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(n.id); } }}>
                  <circle cx={n.x} cy={n.y} r={14} fill="transparent" />
                  {n.knot && (
                    <g key={fresh(n.id) ? `k-${freshKey}` : "k"} className={fresh(n.id) ? "knot-tighten" : undefined}>
                      <circle cx={n.x} cy={n.y} r={8.5} fill="none" strokeWidth={1.6} style={{ stroke: c }} />
                      <circle cx={n.x} cy={n.y} r={6.2} style={{ fill: "var(--sheet)" }} />
                    </g>
                  )}
                  {!resting && n.isLeaf && <circle cx={n.x} cy={n.y} r={9} className="pulse" style={{ fill: c }} />}
                  <circle cx={n.x} cy={n.y} r={n.isRoot ? 6 : n.isLeaf ? 4.6 : 4} strokeWidth={1.6}
                    strokeDasharray={n.confirmed === false ? "2 2" : undefined}
                    style={{ stroke: c, fill: resting || n.confirmed === false ? "var(--sheet)" : c }} />
                  <circle cx={n.x} cy={n.y} r={13} className="selring" style={{ display: selected === n.id ? undefined : "none" }} />
                </g>
              );
            })}
          </g>
          <g>
            {L.nodes.map((n) => (
              <text key={`t-${n.id}`} x={n.label0.x} y={n.ly} textAnchor={n.anchor} onClick={(e) => { e.stopPropagation(); click(n.id); }}
                {...tipProps(reasonOf(n), n.id)}
                className={"lbl " + cls(n.id) + (n.knot || n.isRoot ? " major" : "") + (n.status === "dormant" ? " dormant" : "") + (selected === n.id ? " sel" : "")}>
                {n.label}
              </text>
            ))}
          </g>
        </g>
        {specimen && <SpecimenLabel {...specimen} nodes={nodes} />}
      </svg>
      {interactive && (view.k !== 1 || view.x !== 0 || view.y !== 0) && (
        <button type="button" className="ink-btn absolute right-3 top-3 px-3 py-1.5 text-xs" onClick={() => setView(FIT)}>Fit</button>
      )}
      {tip && (
        <p role="tooltip" className="pointer-events-none absolute z-10 max-w-[30ch] border border-rule bg-sheet px-2.5 py-1.5 text-xs leading-snug text-muted-foreground"
          style={{ left: tip.x + 12, top: tip.y + 14 }}>{tip.text}</p>
      )}
    </div>
  );
}

/** The herbarium label, drawn inside the sheet so it shares the tree's coordinates. */
function SpecimenLabel({ no, title, collected, collectors, nodes }: SpecimenInfo & { nodes: TreeNode[] }) {
  const merges = nodes.reduce((s, n) => s + Math.max(0, n.parents.length - 1), 0);
  const { x, y, w, h } = CARD;
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  return (
    <g className="specimen" aria-label="Specimen label">
      <rect x={x} y={y} width={w} height={h} style={{ fill: "var(--sheet)", stroke: "var(--ink)" }} strokeWidth={1} />
      <text x={x + 14} y={y + 24} className="sp-mono">标本 Nº {String(no).padStart(3, "0")}</text>
      <line x1={x + 14} x2={x + w - 14} y1={y + 33} y2={y + 33} style={{ stroke: "var(--rule)" }} />
      <text x={x + 14} y={y + 56} className="sp-title">{clip(title, 26)}</text>
      {collected && <text x={x + 14} y={y + 78} className="sp-body">Collected: {clip(collected, 30)}</text>}
      <text x={x + 14} y={y + (collected ? 98 : 78)} className="sp-body">Collectors: {clip(collectors.join(", "), 28)}</text>
      <text x={x + 14} y={y + h - 10} className="sp-mono muted">
        {nodes.length} ideas · {merges} merges · {nodes.filter((n) => n.status === "dormant").length} resting · {nodes.filter((n) => n.knot).length} knots
      </text>
    </g>
  );
}

/** Every empty state is a seed. */
export function Seed({ children }: { children?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-4 py-16 text-center">
      <svg width="60" height="40" aria-hidden="true">
        <line x1="10" y1="30" x2="50" y2="30" style={{ stroke: "var(--ink)" }} strokeWidth="1" />
        <circle cx="30" cy="24" r="6" style={{ fill: "var(--person-1)" }} />
      </svg>
      <p className="font-display text-xl">Every garden starts with one question.</p>
      {children}
    </div>
  );
}

export function Legend({ people }: { people: { name: string; color: string }[] }) {
  const glyphs: [ReactNode, string, string][] = [
    [<circle cx="9" cy="7" r="4.5" strokeWidth="1.5" style={{ fill: "var(--sheet)", stroke: "var(--muted-ink)" }} />, "Resting, but kept", REASONS.resting],
    [<line x1="1" y1="7" x2="17" y2="7" strokeWidth="1.4" strokeDasharray="3 3" style={{ stroke: "var(--muted-ink)" }} />, "Two lines recombined", REASONS.merge],
    [<><circle cx="9" cy="7" r="6" strokeWidth="1.5" style={{ fill: "none", stroke: "var(--muted-ink)" }} /><circle cx="9" cy="7" r="2.6" style={{ fill: "var(--muted-ink)" }} /></>, "Knot: something settled", REASONS.knot],
    [<path d="M1 10 L17 5 L17 8 L1 11Z" style={{ fill: "var(--muted-ink)" }} />, "Thicker = more grew from it", "A branch thickens with everything that grew from it."],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
      {people.map((p) => (
        <span key={p.name} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" style={{ fill: p.color }} /></svg>{p.name}
        </span>
      ))}
      {glyphs.map(([g, t, why]) => (
        <span key={t} title={why} className="inline-flex items-center gap-1.5"><svg width="18" height="14" aria-hidden="true">{g}</svg>{t}</span>
      ))}
    </div>
  );
}
