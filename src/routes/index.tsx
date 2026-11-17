import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import sample from "../../docs/sample-garden.json";
import { StamTree, type TreeNode } from "@/components/stam-tree/StamTree";
import { useReplay } from "@/components/stam-tree/useReplay";
import { stamToTree } from "@/lib/stam/toTree";
import { maxStep } from "@/lib/stam/layout";
import type { StamGarden } from "@/lib/stam/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ramus — Ideas grow between people" },
      { name: "description", content: "Ramus turns your group's discussions into a living tree: who said what, what grew from it, what got settled, what is resting." },
      { property: "og:title", content: "Ramus — Ideas grow between people" },
      { property: "og:description", content: "Ramus turns your group's discussions into a living tree: who said what, what grew from it, what got settled, what is resting." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const nodes: TreeNode[] = useMemo(() => stamToTree(sample as StamGarden), []);
  const max = maxStep(nodes);
  const r = useReplay(max, { loop: true, autoplay: true });
  const stepTitle = (sample.steps as Record<string, string>)[String(r.step)];
  return (
    <main className="mx-auto grid min-h-screen max-w-[1180px] gap-10 px-5 py-14 lg:grid-cols-[360px_1fr] lg:items-center">
      <section className="grid gap-5">
        <p className="eyebrow">Ramus · the idea garden</p>
        <h1 className="font-display text-6xl font-bold">Ramus</h1>
        <p className="font-display text-2xl">Ideas grow between people.</p>
        <p className="max-w-[46ch] text-muted-foreground">
          Ramus turns your group's discussions into a living tree: who said what, what grew from it, what got settled, what is resting.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg"><Link to="/gardens">Start a garden</Link></Button>
        </div>
      </section>
      <figure className="rounded-md border border-rule bg-sheet">
        <div className="flex items-center gap-3 border-b border-rule px-4 py-2 font-mono text-xs text-muted-foreground">
          <span>STEP {r.step} / {max}</span><span className="truncate">{stepTitle}</span>
          <button type="button" className="ml-auto underline underline-offset-4" onClick={r.play}>{r.playing ? "Pause" : "Play growth"}</button>
        </div>
        <StamTree nodes={nodes} step={r.step} selected={null} freshStep={r.fresh.step} freshKey={r.fresh.key} ariaLabel="The origin of Ramus, replaying" />
        <figcaption className="border-t border-rule px-4 py-2 text-xs text-muted-foreground">Demo garden: “The origin of Ramus”.</figcaption>
      </figure>
    </main>
  );
}
