import { useMemo, type ReactNode } from "react";
import { CX, CY, W, H, computeLayout, curve, mergePath, taper, thick, type LayoutInput } from "@/lib/stam/layout";

export type TreeNode = LayoutInput & { by: string; color: string; status: "growing" | "dormant" };

type Props = {
  nodes: TreeNode[];
  step: number;
  selected: string | null;
  onSelect?: (id: string) => void;
  /** Ideas born in this step get a one-time ring (null = none). */
  freshStep?: number | null;
  /** Changes to replay the ring animation. */
  freshKey?: number;
  ariaLabel?: string;
};

export function StamTree({ nodes, step, selected, onSelect, freshStep = null, freshKey = 0, ariaLabel = "Idea tree" }: Props) {
  const L = useMemo(() => computeLayout(nodes), [nodes]);
  const vis = (id: string) => (L.byId.get(id)?.step ?? Infinity) <= step;
  const cls = (id: string, from?: string) => "fade" + (vis(id) && (!from || vis(from)) ? "" : " off");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="stam-tree block h-auto w-full">
      <desc>Each dot is an idea. Branches show what grew from what, dashed lines show ideas recombining, colors show who said it, faded branches are resting.</desc>
      <g>
        {L.nodes.flatMap((n) =>
          n.parents.slice(1).map((mid) => {
            const m = L.byId.get(mid);
            if (!m) return null;
            return (
              <path key={`m-${mid}-${n.id}`} d={mergePath(m, n)} fill="none" strokeWidth={1.2} strokeDasharray="4 5" strokeLinecap="round"
                className={cls(n.id, m.id)} style={{ stroke: (m as TreeNode).color, opacity: 0.6 }} />
            );
          }),
        )}
      </g>
      <g>
        <line x1={CX - 120} y1={CY + 1} x2={CX + 120} y2={CY + 1} className="ground" />
        {L.nodes.map((n) => {
          if (!n.parents.length) return null;
          const p = L.byId.get(n.parents[0]!);
          if (!p) return null;
          const w1 = Math.max(1.1, thick(n) * 0.85);
          const w0 = Math.min(thick(p), Math.max(w1 * 1.5, w1 + 1));
          return (
            <path key={`b-${n.id}`} d={taper(curve(p, n, 0.5, 0.3), w0, w1)} className={cls(n.id, p.id)}
              style={{ fill: n.color, opacity: n.status === "dormant" ? 0.3 : 0.9 }} />
          );
        })}
      </g>
      <g>
        {L.nodes.map((n) =>
          n.leader ? <line key={`l-${n.id}`} x1={n.x} y1={n.y} x2={n.label0.x} y2={n.ly - 4} className={"leader " + cls(n.id)} /> : null,
        )}
      </g>
      <g>
        {L.nodes.map((n) => {
          const c = n.color;
          const fresh = freshStep != null && n.step === freshStep;
          return (
            <g key={`n-${n.id}`} className={"node " + cls(n.id)} tabIndex={vis(n.id) ? 0 : -1} role="button" aria-label={n.label}
              style={{ opacity: n.status === "dormant" ? 0.75 : undefined }}
              onClick={() => onSelect?.(n.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(n.id); } }}>
              {n.knot && (<>
                <circle cx={n.x} cy={n.y} r={8.5} fill="none" strokeWidth={1.6} style={{ stroke: c }} />
                <circle cx={n.x} cy={n.y} r={6.2} style={{ fill: "var(--sheet)" }} />
              </>)}
              {n.status === "growing" && n.isLeaf && <circle cx={n.x} cy={n.y} r={9} className="pulse" style={{ fill: c }} />}
              <circle cx={n.x} cy={n.y} r={n.isRoot ? 6 : n.isLeaf ? 4.6 : 4} strokeWidth={1.6}
                style={{ stroke: c, fill: n.status === "dormant" ? "var(--sheet)" : c }} />
              <circle cx={n.x} cy={n.y} r={13} className="selring" style={{ display: selected === n.id ? undefined : "none" }} />
              {fresh && <circle key={`f-${freshKey}`} cx={n.x} cy={n.y} r={11} fill="none" strokeWidth={1.4} className="fresh-ring" style={{ stroke: c }} />}
            </g>
          );
        })}
      </g>
      <g>
        {L.nodes.map((n) => (
          <text key={`t-${n.id}`} x={n.label0.x} y={n.ly} textAnchor={n.anchor} onClick={() => onSelect?.(n.id)}
            className={"lbl " + cls(n.id) + (n.knot || n.isRoot ? " major" : "") + (n.status === "dormant" ? " dormant" : "") + (selected === n.id ? " sel" : "")}>
            {n.label}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function SpecimenCard({ no, title, collected, collectors, nodes }: { no: number | string; title: string; collected?: string; collectors: string[]; nodes: TreeNode[] }) {
  const merges = nodes.reduce((s, n) => s + Math.max(0, n.parents.length - 1), 0);
  return (
    <div className="w-[252px] border border-ink bg-sheet px-3 py-2.5 text-xs leading-relaxed">
      <p className="border-b border-rule pb-1 mb-1 font-mono tracking-wider">SPECIMEN Nº {String(no).padStart(3, "0")}</p>
      <p className="font-display text-[15px] font-bold">{title}</p>
      {collected && <p>Collected: {collected}</p>}
      <p>Collectors: {collectors.join(", ")}</p>
      <p className="mt-1 font-mono text-muted-foreground">
        {nodes.length} ideas · {merges} merges · {nodes.filter((n) => n.status === "dormant").length} dormant · {nodes.filter((n) => n.knot).length} knots
      </p>
    </div>
  );
}

export function Legend({ people }: { people: { name: string; color: string }[] }) {
  const glyphs: [ReactNode, string][] = [
    [<circle cx="9" cy="7" r="4.5" strokeWidth="1.5" style={{ fill: "var(--sheet)", stroke: "var(--muted-ink)" }} />, "Resting, but kept"],
    [<line x1="1" y1="7" x2="17" y2="7" strokeWidth="1.4" strokeDasharray="3 3" style={{ stroke: "var(--muted-ink)" }} />, "Two lines recombined"],
    [<><circle cx="9" cy="7" r="6" strokeWidth="1.5" style={{ fill: "none", stroke: "var(--muted-ink)" }} /><circle cx="9" cy="7" r="2.6" style={{ fill: "var(--muted-ink)" }} /></>, "Knot: something settled"],
    [<path d="M1 10 L17 5 L17 8 L1 11Z" style={{ fill: "var(--muted-ink)" }} />, "Thicker = more grew from it"],
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
      {people.map((p) => (
        <span key={p.name} className="inline-flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" style={{ fill: p.color }} /></svg>{p.name}
        </span>
      ))}
      {glyphs.map(([g, t]) => (
        <span key={t} className="inline-flex items-center gap-1.5"><svg width="18" height="14" aria-hidden="true">{g}</svg>{t}</span>
      ))}
    </div>
  );
}
