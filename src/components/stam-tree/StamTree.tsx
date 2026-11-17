import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CX, CY, W, H, computeLayout, curve, mergePath, taper, textWidth, thick, type LayoutInput, type Rect } from "@/lib/stam/layout";
import { mainLineage, readingDetail, type ReadingLevel } from "@/lib/stam/reading";
import { Button } from "@/components/ui/button";
import { lineage, REASONS } from "@/lib/stam/focus";
import { labelSize, settleLabels, wantedLabels } from "@/lib/stam/labels";
import { runs } from "@/lib/epigraphs";
import { Epigraph } from "@/components/epigraph/Epigraph";
import { Upright } from "@/components/epigraph/Epigraph";

const Runs = ({ s }: { s: string }) => <>{runs(s).map((r, i) => (r.cjk ? <tspan key={i} className="cjk">{r.t}</tspan> : r.t))}</>;

export type TreeNode = LayoutInput & { by: string; color: string; status: "growing" | "dormant"; confirmed?: boolean; outcome?: boolean; originQuote?: string };

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
  /** Margin notes in the naturalist's hand, pinned to an idea or a merge. */
  notes?: MarginNote[];
  level?: ReadingLevel;
  main?: Set<string> | undefined;
  /** "zoom": labels appear by zoom and selection (the workspace); "level": by reading level (Present, landing). */
  labels?: "level" | "zoom";
  /** A miniature: no labels, legend, specimen or interaction. */
  thumbnail?: boolean;
  /** Size of the miniature (thumbnail only). */
  thumbClass?: string;
  /** Composed as a poster for export: title, one line, the whole tree, specimen label bottom-right, mark bottom-left. */
  poster?: { title: string; line?: string | null } | null;
};

/** Poster sheet (viewBox units): square, margin 6% of the side. */
export const POSTER = { w: 1600, h: 1600, m: 96 };

export type MarginNote = { text: string; id: string; from?: string };

const CARD: Rect = { x: 16, y: 16, w: 330, h: 128 };
type View = { k: number; x: number; y: number };
const FIT: View = { k: 1, x: 0, y: 0 };

/** Measure label widths from rendered text after the fonts load (as the prototype does). */
function useMeasure(labels: { label: string; major: boolean; dormant?: boolean }[]) {
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
        t.setAttribute("class", "lbl" + (l.major ? " major" : "") + (l.dormant ? " dormant" : ""));
        for (const r of runs(l.label)) {
          const sp = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
          if (r.cjk) sp.setAttribute("class", "cjk");
          sp.textContent = r.t; t.appendChild(sp);
        }
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

export function StamTree(props: Props) {
  return props.thumbnail ? <ThumbTree nodes={props.nodes} ariaLabel={props.ariaLabel} className={props.thumbClass ?? "h-40"} /> : <FullTree {...props} />;
}

function FullTree({ nodes, step, selected, onSelect, freshStep = null, freshKey = 0, ariaLabel = "Idea tree", specimen = null, interactive = false, notes = [], level = "record", main: suppliedMain, labels = "level", poster = null }: Props) {
  if (poster) interactive = false;
  const widths = useMeasure(useMemo(() => nodes.map((n) => ({ label: n.label, major: !!n.knot, dormant: n.status === "dormant" })), [nodes]));
  const L = useMemo(() => computeLayout(nodes, {
    obstacle: specimen && !poster ? CARD : null,
    measure: (s, major) => widths?.get((major ? "M" : "m") + s) ?? textWidth(s, major),
  }), [nodes, widths, specimen]);
  const main = useMemo(() => suppliedMain ?? mainLineage(nodes), [nodes, suppliedMain]);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<View>(FIT);
  const svgRef = useRef<SVGSVGElement>(null);
  const detail = useMemo(() => readingDetail(nodes, level, main, selected), [nodes, level, main, selected]);
  const zoomLabels = labels === "zoom" || !!poster;
  // screen pixels per tree unit at the fitted view, so labels can stay 13–18px at any zoom
  const [scr, setScr] = useState(0.6);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || poster || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w) setScr(w / W); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [poster]);
  const fs = zoomLabels && !poster ? labelSize(view.k, scr) : 15;
  const shownZoom = useMemo(() => {
    if (!zoomLabels) return null;
    const k = poster ? 1 : view.k;
    const r = fs / 15;
    const ln = L.nodes.map((n) => ({ ...n, desc: n.desc, isRoot: n.isRoot }));
    const want = wantedLabels(ln, { k, main, selected, hover });
    return settleLabels(ln, want, (n) => {
      if (!n.box) return null;
      const ax = n.label0.x, ay = n.ly;
      return { x0: ax + (n.box.x0 - ax) * r, x1: ax + (n.box.x1 - ax) * r, top: ay + (n.box.top - ay) * r, h: n.box.h * r };
    }, main, selected, hover);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLabels, poster, view.k, fs, L, main, selected, hover]);
  const labeled = (id: string) => shownZoom ? shownZoom.has(id) : detail.has(id) || hover === id;
  const focus = useMemo(() => lineage(nodes, selected), [nodes, selected]);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const vis = (id: string) => (L.byId.get(id)?.step ?? Infinity) <= step;
  const dim = (...ids: string[]) => (focus && !ids.every((i) => focus.has(i)) ? " dim" : "");
  const cls = (id: string, from?: string) => "fade" + (vis(id) && (!from || vis(from)) ? "" : " off") + dim(id, ...(from ? [from] : []));

  // ---- tooltips: hover on pointer devices, long-press on touch
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipAt = (text: string, e: { clientX: number; clientY: number }) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setTip({ text, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const reasonOf = (n: TreeNode) => level === "record" && n.originQuote ? `“${n.originQuote}”` : !detail.has(n.id) ? n.label : (n.confirmed === false ? REASONS.unconfirmed : n.knot ? REASONS.knot : n.status === "dormant" ? REASONS.resting : null);
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

  const notePos = useMemo(() => placeNotes(notes, L), [notes, L]);
  const inks = useMemo(() => [...new Set(nodes.map((n) => n.color))], [nodes]);
  const fresh = (id: string) => freshStep != null && L.byId.get(id)?.step === freshStep;
  const hot = new Set([hover, selected].filter(Boolean) as string[]);
  const merges = L.nodes.flatMap((n) => n.parents.slice(1).map((mid) => ({ n, m: L.byId.get(mid) })).filter((x) => x.m));
  const mergeEl = (n: (typeof L.nodes)[number], m: NonNullable<(typeof merges)[number]["m"]>, front: boolean) => (
    <path key={`m-${m.id}-${n.id}`} d={mergePath(m, n)} fill="none" strokeWidth={front ? 1.6 : 1.2} strokeDasharray="5 4 3 5 6 4 4 5" strokeLinecap="round"
      className={"merge " + cls(n.id, m.id) + (front ? " front" : "") + (level !== "record" ? " quiet-merge" : "")} style={{ stroke: (m as TreeNode).color }}
      {...tipProps(REASONS.merge)} />
  );

  return (
    <div ref={wrap} className="relative">
      <svg ref={svgRef} viewBox={poster ? `0 0 ${POSTER.w} ${POSTER.h}` : `0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        data-level={level} style={{ ["--lr" as string]: String(fs / 15) }} className={"stam-tree block h-auto w-full select-none" + (interactive ? " touch-none" : "")}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <desc>Each dot is an idea. Branches show what grew from what, dashed lines show ideas recombining, colors show who said it, hollow tips are resting.</desc>
        <defs>
          <filter id="pen" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="0.8" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <pattern id="gen-rules" width="8" height="40" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="39.5" r="0.7" style={{ fill: "var(--rule)" }} />
          </pattern>
          {inks.map((c, i) => (
            <pattern key={c} id={`hatch-${i}`} width="4" height="4" patternUnits="userSpaceOnUse">
              {/* left-handed hatching: top-left to bottom-right */}
              <path d="M-1 -1 L5 5 M-1 3 L1 5 M3 -1 L5 1" strokeWidth="0.6" style={{ stroke: `color-mix(in oklab, ${c} 60%, black)`, opacity: 0.25 }} />
            </pattern>
          ))}
        </defs>
        {poster && <PosterFrame {...poster} />}
        <g transform={poster ? posterMatrix() : undefined}>
        <rect x={0} y={0} width={W} height={H} fill="url(#gen-rules)" pointerEvents="none" />
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="transparent" onClick={() => click(null)} />
        <g transform={`translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`}>
          <g>
          <g>{merges.map(({ n, m }) => (hot.has(n.id) || hot.has(m!.id) ? null : mergeEl(n, m!, false)))}</g>
          <g filter="url(#pen)">
            <line x1={CX - 120} y1={CY + 1} x2={CX + 120} y2={CY + 1} className="ground" />
            {L.nodes.map((n) => {
              if (!n.parents.length) return null;
              const p = L.byId.get(n.parents[0]!);
              if (!p) return null;
              const full = detail.has(n.id);
              const weight = level !== "record" && main.has(n.id) ? 1.3 : 1;
              const w1 = full ? Math.max(1.1, thick(n) * 0.85) * weight : 0.55;
              const w0 = full ? Math.min(thick(p), Math.max(w1 * 1.5, w1 + 1)) * weight : 0.7;
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
                    style={{ fill: n.color, opacity: !full ? 0.25 : n.status === "dormant" && !main.has(n.id) ? 0.3 : 0.9 }} />
                  {w0 > 8 && (
                    <path d={taper(c, w0, w1)} mask={grow ? `url(#${mid})` : undefined} className={"hatch " + cls(n.id, p.id)}
                      fill={`url(#hatch-${inks.indexOf(n.color)})`} pointerEvents="none" />
                  )}
                </g>
              );
            })}
          </g>
          <g>{merges.map(({ n, m }) => (hot.has(n.id) || hot.has(m!.id) ? mergeEl(n, m!, true) : null))}</g>
          </g>
          <g>
            {L.nodes.map((n) =>
              n.leader && labeled(n.id) ? <line key={`l-${n.id}`} x1={n.x} y1={n.y} x2={n.anchor === "end" ? n.label0.x + 2 : n.label0.x - 2} y2={n.ly - 4} className={"leader " + cls(n.id)} /> : null,
            )}
          </g>
          <g>
            {L.nodes.map((n) => {
              const c = n.color;
              const resting = n.status === "dormant";
              const full = detail.has(n.id);
              return (
                <g key={`n-${n.id}`} data-idea={n.id} data-detail={full ? "full" : "bud"} className={"node " + cls(n.id) + (!full ? " bud" : "")} tabIndex={vis(n.id) ? 0 : -1} role="button" aria-label={n.label}
                  {...tipProps(reasonOf(n), n.id)}
                  onClick={(e) => { e.stopPropagation(); click(n.id); }}
                  onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(n.id); } }}>
                  <circle cx={n.x} cy={n.y} r={14} fill="transparent" />
                  {n.knot && full && (
                    <g key={fresh(n.id) ? `k-${freshKey}` : "k"} className={fresh(n.id) ? "knot-tighten" : undefined}>
                      <circle cx={n.x} cy={n.y} r={8.5} fill="none" strokeWidth={1.4} style={{ stroke: c }} />
                      <circle cx={n.x + 0.7} cy={n.y - 0.5} r={8.9} fill="none" strokeWidth={0.8} style={{ stroke: c, opacity: 0.7 }} />
                      <circle cx={n.x} cy={n.y} r={6.2} style={{ fill: "var(--sheet)" }} />
                    </g>
                  )}
                  {full && !resting && n.isLeaf && <circle cx={n.x} cy={n.y} r={9} className="pulse" style={{ fill: c }} />}
                  <circle cx={n.x} cy={n.y} r={!full ? 3 : n.isRoot ? 6 : n.isLeaf ? 4.6 : 4} strokeWidth={1.6}
                    strokeDasharray={n.confirmed === false ? "2 2" : undefined}
                    style={{ stroke: c, fill: resting || n.confirmed === false ? "var(--sheet)" : c }} />
                  <circle cx={n.x} cy={n.y} r={16} className="selring" style={{ display: selected === n.id ? undefined : "none" }} />
                </g>
              );
            })}
          </g>
          <g>
            {L.nodes.map((n) => (
              <text key={`t-${n.id}`} x={n.label0.x} y={n.ly} textAnchor={n.anchor} onClick={(e) => { e.stopPropagation(); click(n.id); }}
                {...tipProps(reasonOf(n), n.id)}
                data-label={n.id} aria-hidden={!labeled(n.id)} className={"lbl " + cls(n.id) + (!labeled(n.id) ? " label-hidden" : "") + (n.knot ? " major" : "") + (n.status === "dormant" ? " dormant" : "") + (selected === n.id ? " sel" : "")}>
                <Runs s={n.label} />
              </text>
            ))}
          </g>
          <g>{notes.map((nt, i) => <Note key={nt.text} note={nt} pos={notePos[i]} />)}</g>
        </g>
        </g>
        {specimen && <SpecimenLabel {...specimen} nodes={nodes} at={poster ? { x: POSTER.w - POSTER.m - CARD.w, y: POSTER.h - POSTER.m - CARD.h } : undefined} />}
      </svg>
      {interactive && (view.k !== 1 || view.x !== 0 || view.y !== 0) && (
        <Button variant="outline" size="sm" className="absolute right-3 top-3" onClick={() => setView(FIT)}>Fit</Button>
      )}
      {tip && (
        <p role="tooltip" className="hand pointer-events-none absolute z-10 max-w-[30ch] border border-rule bg-sheet px-2.5 py-1.5 text-xs leading-snug text-muted-foreground"
          style={{ left: Math.max(0, Math.min(tip.x + 12, (wrap.current?.clientWidth ?? 320) - 220)), top: tip.y + 14 }}><Upright>{tip.text}</Upright></p>
      )}
    </div>
  );
}

/** The herbarium label, drawn inside the sheet so it shares the tree's coordinates. */
function SpecimenLabel({ no, title, collected, collectors, nodes, at }: SpecimenInfo & { nodes: TreeNode[]; at?: { x: number; y: number } | undefined }) {
  const merges = nodes.reduce((s, n) => s + Math.max(0, n.parents.length - 1), 0);
  const { w, h } = CARD;
  const { x, y } = at ?? CARD;
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  return (
    <g className="specimen" aria-label="Specimen label">
      <rect x={x} y={y} width={w} height={h} style={{ fill: "var(--sheet)", stroke: "var(--ink)" }} strokeWidth={1} />
      <g className="stamp" transform={`rotate(-4 ${x + w - 60} ${y + 52})`}>
        <ellipse cx={x + w - 60} cy={y + 52} rx={52} ry={19} fill="none" strokeWidth={1} />
        <ellipse cx={x + w - 60} cy={y + 52} rx={48} ry={15.5} fill="none" strokeWidth={0.5} />
        <text x={x + w - 60} y={y + 50} textAnchor="middle" className="sp-stamp">Ramus</text>
        <text x={x + w - 60} y={y + 60} textAnchor="middle" className="sp-stamp small">herbarium of ideas</text>
      </g>
      <text x={x + 14} y={y + 24} className="sp-mono">Specimen Nº {String(no).padStart(3, "0")}</text>
      <line x1={x + 14} x2={x + w - 14} y1={y + 33} y2={y + 33} style={{ stroke: "var(--rule)" }} />
      <text x={x + 14} y={y + 56} className="sp-title"><Runs s={clip(title, 20)} /></text>
      {collected && <text x={x + 14} y={y + 78} className="sp-body">Collected — {clip(collected, 30)}</text>}
      <text x={x + 14} y={y + (collected ? 98 : 78)} className="sp-body">Collectors — <Runs s={clip(collectors.join(", "), 30)} /></text>
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
      <p className="font-display text-[24px] leading-tight">Every garden starts with one question.</p>
      <Epigraph n={4} className="max-w-[46ch] text-left" />
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

type NotePos = { p: { x: number; y: number }; x: number; y: number; side: number };
/** Place margin notes where the paper is freest, keeping clear of labels, nodes and earlier notes. */
function placeNotes(notes: MarginNote[], L: ReturnType<typeof computeLayout>): (NotePos | null)[] {
  const occupied: { x: number; y: number }[] = L.nodes.flatMap((n) => {
    const x0 = n.box?.x0 ?? n.label0.x - 30, w = n.box ? n.box.x1 - n.box.x0 : 60;
    return [{ x: n.x, y: n.y }, ...Array.from({ length: Math.ceil(w / 16) + 1 }, (_, k) => ({ x: x0 + k * 16, y: n.ly - 5 }))];
  });
  return notes.map((note) => {
    const a = L.byId.get(note.id);
    if (!a) return null;
    const b = note.from ? L.byId.get(note.from) : null;
    const p = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x, y: a.y };
    const w = note.text.length * 6.8;
    let best: NotePos & { s: number } = { p, x: p.x + 80, y: p.y - 50, s: -Infinity, side: 1 };
    for (const dx of [-170, -120, -80, 80, 120, 170]) for (const dy of [-90, -60, -30, 30, 60]) {
      const tx = p.x + dx, ty = p.y + dy, x0 = dx > 0 ? tx : tx - w;
      if (x0 < 8 || x0 + w > W - 8 || ty < 160 || ty > H - 20) continue;
      const pts = Array.from({ length: Math.ceil(w / 14) + 1 }, (_, k) => ({ x: x0 + k * 14, y: ty - 5 }));
      const s = Math.min(...pts.flatMap((q) => occupied.map((o) => Math.hypot((o.x - q.x) / 1.5, o.y - q.y))));
      if (s > best.s) best = { p, x: tx, y: ty, s, side: dx > 0 ? 1 : -1 };
    }
    const x0 = best.side > 0 ? best.x : best.x - w;
    for (let k = 0; k * 10 <= w; k++) occupied.push({ x: x0 + k * 10, y: best.y - 5 });
    return best;
  });
}

function Note({ note, pos }: { note: MarginNote; pos: NotePos | null | undefined }) {
  if (!pos) return null;
  const { p, x, y, side } = pos;
  return (
    <g className="note">
      <path d={`M${p.x} ${p.y} Q${(p.x + x) / 2} ${y + 6} ${x - side * 4} ${y - 4}`} className="note-leader" fill="none" />
      <circle cx={p.x} cy={p.y} r={1.6} className="note-dot" />
      <text x={x} y={y} textAnchor={side > 0 ? "start" : "end"} className="note-text">{note.text}</text>
    </g>
  );
}

/** Where the tree sits on the poster: below the title, above the specimen label, centred. */
function posterMatrix() {
  const { w, h, m } = POSTER;
  const top = m + 110, bottom = h - m - CARD.h - 12;
  const k = Math.min((w - 2 * m) / W, (bottom - top) / H);
  const x = (w - W * k) / 2, y = top + (bottom - top - H * k) / 2;
  return `matrix(${k.toFixed(4)} 0 0 ${k.toFixed(4)} ${x.toFixed(1)} ${y.toFixed(1)})`;
}

function PosterFrame({ title, line }: { title: string; line?: string | null }) {
  const { w, h, m } = POSTER;
  const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  return (
    <g className="poster">
      <rect x={0} y={0} width={w} height={h} style={{ fill: "var(--paper)" }} />
      <text x={m} y={m + 34} className="poster-title"><Runs s={clip(title, 60)} /></text>
      {line && <text x={m} y={m + 74} className="poster-line"><Runs s={clip(line, 90)} /></text>}
      <text x={m} y={h - m} className="poster-mark">grown with Ramus</text>
    </g>
  );
}

/** A miniature of the tree for a garden's plate: branches and buds in their people's colours, nothing else. */
function ThumbTree({ nodes, ariaLabel = "Idea tree", className }: { nodes: TreeNode[]; ariaLabel?: string | undefined; className: string }) {
  const L = useMemo(() => computeLayout(nodes), [nodes]);
  if (!L.nodes.length) return null;
  const xs = L.nodes.map((n) => n.x), ys = L.nodes.map((n) => n.y);
  const pad = 24;
  const x0 = Math.min(...xs, CX - 120) - pad, x1 = Math.max(...xs, CX + 120) + pad, y0 = Math.min(...ys) - pad, y1 = CY + 6;
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ariaLabel} className={"stam-thumb block w-full " + className}>
      <line x1={CX - 120} y1={CY + 1} x2={CX + 120} y2={CY + 1} strokeWidth={2} style={{ stroke: "var(--rule)" }} />
      {L.nodes.flatMap((n) => n.parents.slice(1).map((mid) => {
        const m = L.byId.get(mid);
        return m ? <path key={`m-${mid}-${n.id}`} d={mergePath(m, n)} fill="none" strokeWidth={3} strokeDasharray="12 10" style={{ stroke: (m as TreeNode).color, opacity: 0.7 }} /> : null;
      }))}
      {L.nodes.map((n) => {
        const p = n.parents.length ? L.byId.get(n.parents[0]!) : null;
        if (!p) return null;
        const w1 = Math.max(2.4, thick(n) * 0.85), w0 = Math.min(thick(p), Math.max(w1 * 1.5, w1 + 1));
        return <path key={`b-${n.id}`} d={taper(curve(p, n, 0.5, 0.3), w0 * 1.4, w1 * 1.4)} style={{ fill: n.color, opacity: n.status === "dormant" ? 0.35 : 0.9 }} />;
      })}
      {L.nodes.map((n) => (
        <circle key={`n-${n.id}`} cx={n.x} cy={n.y} r={n.isRoot ? 10 : 7} strokeWidth={3}
          style={{ stroke: n.color, fill: n.status === "dormant" ? "var(--sheet)" : n.color }} />
      ))}
    </svg>
  );
}
