import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StamTree, type MarginNote, type SpecimenInfo, type TreeNode } from "@/components/stam-tree/StamTree";
import { Upright } from "@/components/epigraph/Epigraph";
import { mainLineage, readingDetail, type ReadingLevel } from "@/lib/stam/reading";
import { grewFrom, systema, type SysNode } from "@/lib/stam/systema";
import { StoryEntry } from "./Systema";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const MAX_ENTRIES = 3;

type Node = TreeNode & SysNode & { note?: string | null };
type Slide = { kind: "question" } | { kind: "step"; step: number; n: number } | { kind: "end" };

/**
 * Present: the garden told step by step, full screen. The question first; then each step grows on the tree
 * while the side tells who raised what and how it grew; it ends where the discussion has reached.
 * Arrow keys or space to move, Escape to leave.
 */
export function Present({ title, nodes, steps = {}, level = "form", main: suppliedMain, returns = [], notes = [], specimen, dateOf, onClose }: {
  title: string;
  nodes: Node[];
  steps?: Record<number, string | null | undefined>;
  level?: ReadingLevel;
  main?: Set<string>;
  returns?: { key: string; why: string | null; step: number | null }[];
  notes?: MarginNote[];
  specimen?: SpecimenInfo | null;
  /** when a step happened, if known */
  dateOf?: ((step: number) => string | null) | undefined;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const s = useMemo(() => systema(nodes, steps), [nodes, steps]);
  const main = useMemo(() => {
    const m = suppliedMain ?? mainLineage(nodes);
    return m.size > 1 ? m : mainLineage(nodes.map((n) => ({ ...n, outcome: false })));
  }, [suppliedMain, nodes]);
  const shown = useMemo(() => readingDetail(nodes, level, main, null), [nodes, level, main]);
  const color = useMemo(() => new Map(nodes.map((n) => [n.id, n.color])), [nodes]);
  const label = useMemo(() => new Map(nodes.map((n) => [n.id, n.label])), [nodes]);
  const slides: Slide[] = useMemo(() => [
    { kind: "question" },
    ...s.chapters.map((c, i) => ({ kind: "step" as const, step: c.step, n: i })),
    { kind: "end" },
  ], [s]);
  const [at, setAt] = useState(0);
  const slide = slides[Math.min(at, slides.length - 1)]!;
  const lastStep = s.chapters.at(-1)?.step ?? 1;
  const go = useCallback((d: number) => setAt((i) => Math.max(0, Math.min(slides.length - 1, i + d))), [slides.length]);

  // full screen while presenting; leaving full screen leaves the presentation
  useEffect(() => {
    const el = box.current;
    let entered = false;
    el?.requestFullscreen?.().then(() => { entered = true; }).catch(() => {});
    const onChange = () => { if (entered && !document.fullscreenElement) onClose(); };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === "Home") setAt(0);
      else if (e.key === "End") setAt(slides.length - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, slides.length]);

  const root = s.root;
  const outcomes = nodes.filter((n) => n.outcome);
  const reached = outcomes.length ? outcomes : nodes.filter((n) => main.has(n.id)).sort((a, b) => b.step - a.step).slice(0, 1);
  const treeStep = slide.kind === "step" ? slide.step : lastStep;

  return (
    <div ref={box} role="dialog" aria-modal="true" aria-label={`Presenting ${title}`}
      className="fixed inset-0 z-[60] grid h-svh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
      <header className="flex items-baseline gap-4 px-8 pt-5">
        <p className="eyebrow"><Upright>{title}</Upright></p>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>Leave</Button>
      </header>

      {slide.kind === "question" ? (
        <main className="grid min-h-0 place-content-center gap-5 overflow-y-auto px-8 text-center">
          <p className="eyebrow">The question</p>
          {root && <h2 className="font-display text-title leading-tight sm:text-cover"><Upright>{root.label}</Upright></h2>}
          {root?.note && <p className="mx-auto max-w-[48ch] text-head text-muted-foreground"><Upright>{root.note}</Upright></p>}
          <p className="smallcaps text-head">
            {[...new Map(nodes.map((n) => [n.by, n.color])).entries()].map(([name, c], i) => (
              <span key={name}>{i > 0 && <span className="text-muted-foreground"> · </span>}<span style={{ color: c }}><Upright>{name}</Upright></span></span>
            ))}
          </p>
        </main>
      ) : (
        <main className="grid min-h-0 gap-8 px-8 py-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="present-tree h-full min-h-0 min-w-0">
            <StamTree nodes={nodes} step={treeStep} selected={null} level={level} main={main} notes={notes}
              freshStep={slide.kind === "step" ? slide.step : null} freshKey={at} ariaLabel={title} specimen={specimen ?? null} />
          </div>
          <div className="min-h-0 overflow-y-auto">
          <aside className="grid min-h-full content-center gap-4 py-2" aria-live="polite">
            {slide.kind === "step" ? (() => {
              const ch = s.chapters[slide.n]!;
              const entries = ch.entries.filter((e) => e.id !== root?.id);
              const written = entries.filter((e) => shown.has(e.id));
              const rest = entries.length - Math.min(written.length, MAX_ENTRIES);
              const back = returns.filter((r) => r.step === ch.step && label.has(r.key));
              const when = dateOf?.(ch.step);
              return <>
                <p className="eyebrow border-t border-ink pt-2">{ROMAN[slide.n] ?? slide.n + 1} · step {slide.n + 1} of {s.chapters.length}{when ? ` · ${when}` : ""}</p>
                {ch.title && <h2 className="font-display text-title leading-tight"><Upright>{ch.title}</Upright></h2>}
                {back.map((r) => (
                  <p key={r.key} className="hand text-head">The group went back to “<Upright>{label.get(r.key)!}</Upright>”{r.why ? <>: <Upright>{r.why}</Upright></> : null}, and grew again from there.</p>
                ))}
                <ol className="grid gap-4">
                  {written.slice(0, MAX_ENTRIES).map((e) => (
                    <StoryEntry key={e.id} e={e} large color={color.get(e.id) ?? "var(--ink)"}
                      how={back.some((r) => r.key === e.from[0]?.id) && e.from.length === 1 ? `grows again from ${e.from[0]!.label}` : grewFrom(e, root?.id ?? null)} />
                  ))}
                </ol>
                {rest > 0 && <p className="text-note text-muted-foreground">and {rest} more in this step</p>}
              </>;
            })() : (
              <>
                <p className="eyebrow">Where it has reached</p>
                {root && <p className="hand text-head">From “<Upright>{root.label}</Upright>”</p>}
                {reached.map((n) => (
                  <div key={n.id} className="grid gap-1">
                    <h2 className="font-display text-title leading-tight" style={{ color: n.color }}><Upright>{n.label}</Upright></h2>
                    {n.note && <p className="text-head text-muted-foreground"><Upright>{n.note}</Upright></p>}
                    <p className="smallcaps text-note"><Upright>{n.by}</Upright></p>
                  </div>
                ))}
                <p className="smallcaps text-note text-muted-foreground"><span className="whitespace-nowrap">{nodes.length} ideas</span> · <span className="whitespace-nowrap">{s.chapters.length} steps</span> · <span className="whitespace-nowrap">{new Set(nodes.map((n) => n.by)).size} voices</span></p>
              </>
            )}
          </aside>
          </div>
        </main>
      )}

      <footer className="flex items-center gap-4 px-8 pb-5 pt-2">
        <Button variant="outline" size="sm" onClick={() => go(-1)} disabled={at === 0} aria-label="Back">←</Button>
        <ol className="flex flex-1 flex-wrap items-center justify-center gap-2" aria-label="Steps">
          {slides.map((sl, i) => (
            <li key={i}>
              <button type="button" onClick={() => setAt(i)} aria-current={i === at || undefined}
                aria-label={sl.kind === "question" ? "The question" : sl.kind === "end" ? "Where it has reached" : `Step ${sl.n + 1}`}
                className={"block size-2.5 rounded-full border border-ink " + (i === at ? "bg-ink" : i < at ? "bg-ink/40" : "bg-transparent")} />
            </li>
          ))}
        </ol>
        <Button variant="outline" size="sm" onClick={() => go(1)} disabled={at === slides.length - 1} aria-label="Next">→</Button>
      </footer>
    </div>
  );
}
