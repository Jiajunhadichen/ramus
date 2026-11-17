import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import sample from "../../docs/sample-garden.json";
import { StamTree, type MarginNote, type TreeNode } from "@/components/stam-tree/StamTree";
import { useReplay } from "@/components/stam-tree/useReplay";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Epigraph } from "@/components/epigraph/Epigraph";
import { stamToTree } from "@/lib/stam/toTree";
import { demoInEnglish } from "@/lib/stam/demo-labels";
import { maxStep } from "@/lib/stam/layout";
import type { StamGarden } from "@/lib/stam/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ramus — Ideas grow between people" },
      { name: "description", content: "Ideas grow between people. Ramus remembers who planted every branch, and what grew from it." },
      { property: "og:title", content: "Ramus — Ideas grow between people" },
      { property: "og:description", content: "Ramus remembers who planted every branch, and what grew from it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

/** The three margin notes, pinned to the first knot, resting branch and merge in the demo garden. */
export function pickNotes(nodes: TreeNode[]): MarginNote[] {
  const knot = nodes.find((n) => n.knot && n.parents.length);
  const rest = nodes.find((n) => n.status === "dormant");
  const merge = nodes.find((n) => n.parents.length > 1);
  return [
    knot && { id: knot.id, text: "a click: something got settled" },
    rest && { id: rest.id, text: "resting, not deleted" },
    merge && { id: merge.id, from: merge.parents[1], text: "two lines of thought meet here" },
  ].filter(Boolean) as MarginNote[];
}

function Landing() {
  const nodes: TreeNode[] = useMemo(() => stamToTree(sample as StamGarden).map(demoInEnglish), []);
  const all = useMemo(() => pickNotes(nodes), [nodes]);
  const max = maxStep(nodes);
  const r = useReplay(max, { autoplay: true, interval: 600 });
  const [shown, setShown] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = r.step === max && !r.playing;
  useEffect(() => {
    timers.current.forEach(clearTimeout);
    if (!done) { setShown(0); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(all.length); return; }
    timers.current = all.map((_, i) => setTimeout(() => setShown(i + 1), 700 + i * 1100));
    return () => timers.current.forEach(clearTimeout);
  }, [done, all]);

  return (
    <>
    <SiteHeader bare />
    <main className="page relative grid items-center gap-6 pb-8 pt-2 lg:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
      <figure className="mx-auto w-full" style={{ maxWidth: "calc(85vh * 1100 / 900)" }} aria-label="The demo garden, growing from a seed">
        <StamTree level="form" nodes={nodes} step={r.step} selected={null} freshStep={r.fresh.step} freshKey={r.fresh.key}
          notes={all.slice(0, shown)} ariaLabel="The origin of Ramus, growing from a seed" />
        <figcaption className="mt-1 flex flex-wrap items-baseline justify-center gap-x-4">
          <span className="eyebrow">Step {r.step} of {max} · The origin of Ramus</span>
          {done && <button type="button" className="text-ui italic text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => r.play()}>Grow again</button>}
        </figcaption>
      </figure>
      <section className="grid gap-5">
        <h1 className="font-display text-title font-normal leading-[1.1] xl:text-cover">Ideas grow <em>between</em> people.</h1>
        <p className="font-display text-head leading-snug xl:text-head">Ramus remembers who planted every branch, and what grew from it.</p>
        <Epigraph n={2} />
        <div><Button asChild><Link to="/auth" search={{ mode: "up" }}>Start a garden</Link></Button></div>
      </section>
    </main>
    </>
  );
}
