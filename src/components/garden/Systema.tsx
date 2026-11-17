import { Button } from "@/components/ui/button";
import { mainLineage } from "@/lib/stam/reading";
import { useMemo } from "react";
import { systema, type SysEntry, type SysNode } from "@/lib/stam/systema";
import { Epigraph, Upright } from "@/components/epigraph/Epigraph";

/** Systema: the garden as a Linnaean table, in the manner of Systema Naturae (1735). */
export function Systema({ title, nodes, selected, onSelect, main: suppliedMain }: { main?: Set<string>; title: string; nodes: (SysNode & { color: string })[]; selected: string | null; onSelect: (id: string) => void }) {
  const main = suppliedMain ?? mainLineage(nodes.map((n) => ({ ...n, step: 0 })));
  const s = useMemo(() => systema(nodes), [nodes]);
  const color = new Map(nodes.map((n) => [n.id, n.color]));
  const Entry = ({ e, head = false }: { e: SysEntry; head?: boolean }) => (
    <li style={{ paddingLeft: Math.min(e.depth, 8) * 10 }} className={head ? "" : "border-l border-rule"}>
      <Button variant="ghost" onClick={() => onSelect(e.id)} aria-current={selected === e.id || undefined}
        className={"h-auto w-full justify-start whitespace-normal rounded-none py-0.5 pl-2 text-left leading-snug hover:underline " + (selected === e.id ? "underline underline-offset-4" : "") + (e.knot ? " smallcaps" : "") + (main.has(e.id) ? " text-foreground" : " text-muted-foreground") + (head ? " font-display text-[18px]" : " text-[15px]")}>
        <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: e.resting ? "transparent" : color.get(e.id), border: `1px solid ${color.get(e.id)}` }} />
        <Upright>{e.label}</Upright>
        {nodes.find((n) => n.id === e.id)?.outcome && <span className="smallcaps ml-2 text-[13px]">Outcome</span>}
        {e.merges.map((m) => <span key={m} className="ml-1.5 text-[13px] italic text-muted-foreground">× <Upright>{m}</Upright></span>)}
      </Button>
    </li>
  );
  return (
    <div className="grid gap-6 px-5 py-6" aria-label="Systema">
      <Epigraph n={7} className="max-w-[60ch]" />
      {s.root && (
        <div className="grid gap-1 border-b border-rule pb-3 text-center">
          <p className="eyebrow">Systema · {nodes.length} ideas</p>
          <Button variant="ghost" onClick={() => s.root && onSelect(s.root.id)} className={"h-auto whitespace-normal font-display text-[24px] leading-tight hover:underline " + (selected === s.root.id ? "underline" : "")}>
            <Upright>{s.root.label}</Upright>
          </Button>
          <p className="text-[13px] italic text-muted-foreground"><Upright>{title}</Upright></p>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-6">
        {s.columns.map((c, i) => (
          <section key={c.head.id} className="grid min-w-[180px] content-start gap-1 border-t border-ink pt-2" style={{ flex: `${c.entries.length + 1} 1 180px` }}>
            <p className="eyebrow">Ordo {["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][i] ?? i + 1}</p>
            <ul className="grid">
              <Entry e={c.head} head />
              {c.entries.map((e) => <Entry key={e.id} e={e} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
