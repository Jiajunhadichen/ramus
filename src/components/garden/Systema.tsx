import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { mainLineage, readingDetail, type ReadingLevel } from "@/lib/stam/reading";
import { grewFrom, systema, type SysEntry, type SysNode } from "@/lib/stam/systema";
import { Epigraph, Upright } from "@/components/epigraph/Epigraph";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

/**
 * Systema: the garden read step by step, like a naturalist's journal. Each entry: who raised it, what it grew
 * from, and its note. The reading level decides which entries are written out; the rest of a step is named
 * at the end of it, so nothing disappears.
 */
export function Systema({ title, nodes, steps = {}, level = "record", selected, onSelect, main: suppliedMain, returns = [] }: {
  title: string;
  nodes: (SysNode & { color: string })[];
  steps?: Record<number, string | null | undefined>;
  level?: ReadingLevel;
  main?: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  /** where the group went back to an earlier idea, and in which step it grew again */
  returns?: { key: string; why: string | null; step: number | null }[];
}) {
  const s = useMemo(() => systema(nodes, steps), [nodes, steps]);
  // a root marked as the outcome leaves no main line to read; then the newest growth is the main line
  const main = useMemo(() => {
    const m = suppliedMain ?? mainLineage(nodes);
    return m.size > 1 ? m : mainLineage(nodes.map((n) => ({ ...n, outcome: false })));
  }, [suppliedMain, nodes]);
  const shown = useMemo(() => readingDetail(nodes, level, main, selected), [nodes, level, main, selected]);
  const color = new Map(nodes.map((n) => [n.id, n.color]));
  const people = [...new Map(nodes.map((n) => [n.by, n.color])).entries()];
  const rootId = s.root?.id ?? null;
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const how = (e: SysEntry, step: number) =>
    returns.some((r) => r.step === step && r.key === e.from[0]?.id) && e.from.length === 1 ? `grows again from ${e.from[0]!.label}` : grewFrom(e, rootId);

  const Mark = ({ e }: { e: SysEntry }) => (
    <span aria-hidden className="mr-2 inline-block size-2 shrink-0 rounded-full align-middle"
      style={{ background: e.resting ? "transparent" : color.get(e.id), border: `1px solid ${color.get(e.id)}` }} />
  );

  return (
    <div className="grid gap-6 px-5 py-6" aria-label="Systema">
      <Epigraph n={7} className="max-w-[60ch]" />
      {s.root && (
        <header className="grid gap-1 border-b border-rule pb-4 text-center">
          <p className="eyebrow">The story · {nodes.length} ideas · {s.chapters.length} steps</p>
          <Button variant="ghost" onClick={() => onSelect(s.root!.id)}
            className={"mx-auto h-auto whitespace-normal font-display text-[26px] leading-tight hover:underline " + (selected === s.root.id ? "underline" : "")}>
            <Upright>{s.root.label}</Upright>
          </Button>
          {s.root.note && <p className="mx-auto max-w-[56ch] text-[15px] text-muted-foreground"><Upright>{s.root.note}</Upright></p>}
          <p className="text-[13px] italic text-muted-foreground"><Upright>{title}</Upright></p>
          <p className="smallcaps mt-1 text-[13px]" aria-label="People">
            {people.map(([name, c], i) => <span key={name}>{i > 0 && <span className="text-muted-foreground"> · </span>}<span style={{ color: c }}><Upright>{name}</Upright></span></span>)}
          </p>
        </header>
      )}

      <div className="mx-auto grid w-full max-w-[72ch] gap-7">
        {s.chapters.map((ch, i) => {
          const entries = ch.entries.filter((e) => e.id !== rootId);
          const written = entries.filter((e) => shown.has(e.id));
          const named = entries.filter((e) => !shown.has(e.id));
          const back = returns.filter((r) => r.step === ch.step && label.has(r.key));
          if (!entries.length && !back.length) return null;
          return (
            <section key={ch.step} aria-label={`Step ${ch.step}`} className="grid gap-3 border-t border-ink pt-2">
              <h3 className="eyebrow">{ROMAN[i] ?? ch.step} {ch.title ? <>· <Upright>{ch.title}</Upright></> : null}</h3>
              {back.map((r) => (
                <p key={r.key} className="hand text-[16px]">
                  The group went back to{" "}
                  <button type="button" className="underline underline-offset-4" onClick={() => onSelect(r.key)}>“<Upright>{label.get(r.key)!}</Upright>”</button>
                  {r.why ? <>: <Upright>{r.why}</Upright></> : null} and grew again from there.
                </p>
              ))}
              {written.length > 0 && (
                <ol className="grid gap-3">
                  {written.map((e) => (
                    <li key={e.id} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[6.5rem_1fr]">
                      <span className="smallcaps flex items-baseline pt-0.5 text-[14px]" style={{ color: color.get(e.id) }}><Mark e={e} /><Upright>{e.by}</Upright></span>
                      <div className="grid gap-0.5">
                        <p className="leading-snug">
                          <button type="button" onClick={() => onSelect(e.id)} aria-current={selected === e.id || undefined}
                            className={"text-left font-display text-[19px] hover:underline " + (selected === e.id ? "underline underline-offset-4 " : "") + (e.resting ? "text-muted-foreground" : "")}>
                            <Upright>{e.label}</Upright>
                          </button>
                          {e.knot && <span className="smallcaps ml-2 text-[13px]">· knot</span>}
                          {e.outcome && <span className="smallcaps ml-2 text-[13px]">· outcome</span>}
                          {e.resting && <span className="ml-2 text-[13px] italic text-muted-foreground">resting</span>}
                        </p>
                        {how(e, ch.step) && <p className="hand text-[15px]"><Upright>{how(e, ch.step)}</Upright></p>}
                        {e.note && <p className="text-[15px] text-muted-foreground"><Upright>{e.note}</Upright></p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              {named.length > 0 && (
                <p className="text-[14px] text-muted-foreground">
                  {written.length ? "Also in this step: " : "In this step: "}
                  {named.map((e, j) => (
                    <span key={e.id}>{j > 0 && " · "}
                      <button type="button" className="underline-offset-4 hover:underline" onClick={() => onSelect(e.id)}><Upright>{e.label}</Upright></button>
                      {e.resting && <span className="italic"> (resting)</span>}
                    </span>
                  ))}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
