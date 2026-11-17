import { SiteHeader } from "@/components/SiteHeader";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import sample from "../../docs/sample-garden.json";
import { StamTree, Legend } from "@/components/stam-tree/StamTree";
import { Systema } from "@/components/garden/Systema";
import { Present } from "@/components/garden/Present";
import { DownloadTree } from "@/components/garden/DownloadTree";
import { Button } from "@/components/ui/button";
import { Upright } from "@/components/epigraph/Epigraph";
import { stamToTree } from "@/lib/stam/toTree";
import { mainLineage } from "@/lib/stam/reading";
import { DEMO_COLLECTED, DEMO_STEPS, demoInEnglish } from "@/lib/stam/demo-labels";
import type { StamGarden } from "@/lib/stam/types";

export const Route = createFileRoute("/genesis")({
  head: () => ({ meta: [
    { title: "The origin of Ramus — how one question grew" },
    { name: "description", content: "Read the historical discussion that grew into Ramus, from its first question to trust in people." },
    { property: "og:title", content: "The origin of Ramus — how one question grew" },
    { property: "og:description", content: "Every idea kept, from the first question to trust in people." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Genesis,
});

const GENESIS_SPECIMEN = { no: "001", title: "The origin of Ramus", collected: DEMO_COLLECTED, collectors: ["Founder", "ChatGPT", "Claude"] };

function Genesis() {
  const [selected, setSelected] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const steps = DEMO_STEPS;
  const withNotes = useMemo(() => stamToTree(sample as StamGarden).map((n) => demoInEnglish({ ...n, note: sample.nodes.find((o) => o.id === n.id)?.note ?? "" })), []);
  const nodes = useMemo(() => stamToTree(sample as StamGarden).map((n) => demoInEnglish(n)), []);
  const main = useMemo(() => mainLineage(nodes, sample.focus), [nodes]);
  const ideaBlock = (id: string, heading: string) => {
    const n = nodes.find((n) => n.id === id);
    const original = withNotes.find((n) => n.id === id);
    return <section className="min-w-0"><p className="eyebrow">{heading}</p>{n && <Button variant="ghost" className="h-auto whitespace-normal p-0 text-left font-serif text-head font-normal" onClick={() => setSelected(n.id)}><Upright>{n.label}</Upright></Button>}<p className="mt-1 text-muted-foreground"><Upright>{String(original?.note ?? "")}</Upright></p>{id === "humans" && <p className="smallcaps mt-1 text-note text-muted-foreground">Step 10 · {DEMO_STEPS[10]}</p>}</section>;
  };
  return <><SiteHeader /><main className="page grid gap-6 py-8">
    <h1 className="font-display text-title">The origin of Ramus</h1>
    <div className="grid gap-6 border-y border-rule py-5 sm:grid-cols-2">{ideaBlock("root", "The question")}{ideaBlock("humans", "Where it has reached")}</div>
    <div className="flex flex-wrap items-center gap-4"><div role="tablist" aria-label="View">{[false, true].map((v) => <Button key={String(v)} variant="ghost" role="tab" aria-selected={table === v} onClick={() => setTable(v)} className={table === v ? "smallcaps underline" : "smallcaps text-muted-foreground"}>{v ? "Story" : "Tree"}</Button>)}</div><Button variant="outline" size="sm" onClick={() => setPresenting(true)}>Present</Button>{!table && <DownloadTree poster={() => ({ nodes, title: "The origin of Ramus", line: nodes.find((n) => n.id === "humans")?.label ?? null, selected, main, specimen: GENESIS_SPECIMEN })} />}</div>
    {table ? <Systema nodes={withNotes} steps={steps} level="record" main={main} title="The origin of Ramus" selected={selected} onSelect={setSelected} /> : <div><StamTree nodes={nodes} labels="zoom" main={main} step={10} selected={selected} onSelect={setSelected} interactive specimen={GENESIS_SPECIMEN} /></div>}
    {presenting && <Present title="The origin of Ramus" nodes={withNotes} steps={steps} main={main} specimen={GENESIS_SPECIMEN} onClose={() => setPresenting(false)} />}
    <Legend people={[...new Map(nodes.map((n) => [n.by, { name: n.by, color: n.color }])).values()]} />
  </main></>;
}