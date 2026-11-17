import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import sample from "../../docs/sample-garden.json";
import { StamTree, type TreeNode } from "@/components/stam-tree/StamTree";
import { useReplay } from "@/components/stam-tree/useReplay";
import { NightToggle } from "@/components/NightToggle";
import { stamToTree } from "@/lib/stam/toTree";
import { maxStep } from "@/lib/stam/layout";
import type { StamGarden } from "@/lib/stam/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ramus — Ideas grow between people" },
      { name: "description", content: "Ramus turns a group's conversations into a living tree of ideas: who said what, what grew from it, what got settled." },
      { property: "og:title", content: "Ramus — Ideas grow between people" },
      { property: "og:description", content: "Ramus turns a group's conversations into a living tree of ideas: who said what, what grew from it, what got settled." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const nodes: TreeNode[] = useMemo(() => stamToTree(sample as StamGarden), []);
  const max = maxStep(nodes);
  const r = useReplay(max, { loop: true, autoplay: true, interval: 2600 });
  return (
    <main className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1240px] items-center gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="absolute right-5 top-4"><NightToggle /></div>
      <figure className="order-2 lg:order-1" aria-label="The demo garden, slowly replaying">
        <StamTree nodes={nodes} step={r.step} selected={null} freshStep={r.fresh.step} freshKey={r.fresh.key} ariaLabel="The origin of Ramus, replaying" />
        <figcaption className="eyebrow mt-1 text-center">第 {r.step} / {max} 步 · The origin of Ramus</figcaption>
      </figure>
      <section className="order-1 grid gap-6 lg:order-2">
        <h1 className="font-display text-5xl font-bold leading-tight lg:text-6xl">Ideas grow between people.</h1>
        <p className="text-lg text-muted-foreground">Ramus keeps your group's conversations as a living tree: who said what, what grew from it, what got settled.</p>
        <blockquote className="border-l border-rule pl-4 font-display leading-relaxed">
          <p>独学而无友，则孤陋而寡闻。</p>
          <p className="mt-1 text-sm text-muted-foreground">“Learning alone, without friends, one stays narrow and hears little.” — 《礼记·学记》</p>
        </blockquote>
        <div><Link to="/gardens" className="ink-btn inline-block px-5 py-3">Start a garden</Link></div>
      </section>
    </main>
  );
}
