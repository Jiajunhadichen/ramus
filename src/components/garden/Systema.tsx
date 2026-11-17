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

  return (
    <div className="grid gap-6 px-5 py-6" aria-label="Systema">
      <Epigraph n={7} className="max-w-[60ch]" />
      {s.root && (
        <header className="grid gap-1 border-b border-rule pb-4 text-center">
          <p className="eyebrow">The story · <span className="whitespace-nowrap">{nodes.length} ideas</span> · <span className="whitespace-nowrap">{s.chapters.length} steps</span></p>
          <Button variant="ghost" onClick={() => onSelect(s.root!.id)}
            className={"mx-auto h-auto whitespace-normal font-display text-head leading-tight hover:underline " + (selected === s.root.id ? "underline" : "")}>
            <Upright>{s.root.label}</Upright>
          </Button>
          {s.root.note && <p className="mx-auto max-w-[56ch] text-ui text-muted-foreground"><Upright>{s.root.note}</Upright></p>}
          <p className="text-note italic text-muted-foreground"><Upright>{title}</Upright></p>
          <p className="smallcaps mt-1 text-note" aria-label="People">
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
                <p key={r.key} className="hand text-read">
                  The group went back to{" "}
                  <button type="button" className="underline underline-offset-4" onClick={() => onSelect(r.key)}>“<Upright>{label.get(r.key)!}</Upright>”</button>
                  {r.why ? <>: <Upright>{r.why}</Upright></> : null} and grew again from there.
                </p>
              ))}
              {written.length > 0 && (
                <ol className="grid gap-3">
                  {written.map((e) => <StoryEntry key={e.id} e={e} color={color.get(e.id) ?? "var(--ink)"} how={how(e, ch.step)} selected={selected === e.id} onSelect={onSelect} />)}
                </ol>
              )}
              {named.length > 0 && (
                <p className="text-ui text-muted-foreground">
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

/** One idea written out: who raised it (in their color), its name, how it grew, and its note. */
export function StoryEntry({ e, color, how, selected = false, onSelect, large = false }: {
  e: SysEntry; color: string; how: string; selected?: boolean; onSelect?: ((id: string) => void) | undefined; large?: boolean;
}) {
  return (
    <li className={"grid gap-x-4 gap-y-0.5 " + (large ? "sm:grid-cols-[7rem_1fr]" : "sm:grid-cols-[6.5rem_1fr]")}>
      <span className={"smallcaps flex items-baseline pt-0.5 " + (large ? "text-read" : "text-ui")} style={{ color }}>
        <span aria-hidden className="mr-2 inline-block size-2 shrink-0 rounded-full align-middle" style={{ background: e.resting ? "transparent" : color, border: `1px solid ${color}` }} />
        <Upright>{e.by}</Upright>
      </span>
      <div className="grid gap-0.5">
        <p className="leading-snug">
          {onSelect
            ? <button type="button" onClick={() => onSelect(e.id)} aria-current={selected || undefined}
                className={"text-left font-display hover:underline " + (large ? "text-head " : "text-head ") + (selected ? "underline underline-offset-4 " : "") + (e.resting ? "text-muted-foreground" : "")}><Upright>{e.label}</Upright></button>
            : <span className={"font-display " + (large ? "text-head " : "text-head ") + (e.resting ? "text-muted-foreground" : "")}><Upright>{e.label}</Upright></span>}
          {e.knot && <span className="ml-2 text-note italic">· knot</span>}
          {e.outcome && <span className="smallcaps ml-2 text-note">· outcome</span>}
          {e.resting && <span className="ml-2 text-note italic text-muted-foreground">resting</span>}
        </p>
        {how && <p className={"hand " + (large ? "text-read" : "text-ui")}><Upright>{how}</Upright></p>}
        {e.note && <p className={(large ? "text-read " : "text-ui ") + "text-muted-foreground"}><Upright>{e.note}</Upright></p>}
      </div>
    </li>
  );
}
