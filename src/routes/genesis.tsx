import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import sample from "../../docs/sample-garden.json";
import { StamTree, Legend } from "@/components/stam-tree/StamTree";
import { ReadingSwitch } from "@/components/garden/ReadingSwitch";
import { Systema } from "@/components/garden/Systema";
import { Button } from "@/components/ui/button";
import { Upright } from "@/components/epigraph/Epigraph";
import { stamToTree } from "@/lib/stam/toTree";
import { mainLineage, type ReadingLevel } from "@/lib/stam/reading";
import { DEMO_LABELS } from "@/lib/stam/demo-labels";
import type { StamGarden } from "@/lib/stam/types";

export const Route = createFileRoute("/genesis")({
  head: () => ({ meta: [
    { title: "The origin of Ramus — Form · Lineage · Record" },
    { name: "description", content: "Read the historical discussion that grew into Ramus, from its first question to trust in people." },
    { property: "og:title", content: "The origin of Ramus — Form · Lineage · Record" },
    { property: "og:description", content: "Every idea kept, from the first question to trust in people." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Genesis,
});

function Genesis() {
  const [level, setLevel] = useState<ReadingLevel>("form");
  const [en, setEn] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const nodes = useMemo(() => stamToTree(sample as StamGarden).map((n) => ({ ...n, label: en ? DEMO_LABELS[n.id] ?? n.label : n.label })), [en]);
  const main = useMemo(() => mainLineage(nodes, sample.focus), [nodes]);
  const ideaBlock = (id: string, heading: string) => {
    const n = nodes.find((n) => n.id === id);
    const original = sample.nodes.find((n) => n.id === id);
    return <section className="min-w-0"><p className="eyebrow">{heading}</p>{n && <Button variant="ghost" className="h-auto whitespace-normal p-0 text-left font-serif text-[24px] font-normal" onClick={() => setSelected(n.id)}><Upright>{n.label}</Upright></Button>}<p className="mt-1 text-muted-foreground"><Upright>{original?.note ?? ""}</Upright></p>{id === "humans" && <p className="smallcaps mt-1 text-[13px] text-muted-foreground">Step 10 · <Upright>{sample.steps["10"]}</Upright></p>}</section>;
  };
  return <main className="mx-auto grid max-w-[1100px] gap-6 px-5 py-8">
    <h1 className="font-display text-[40px]">The origin of Ramus</h1>
    <div className="grid gap-6 border-y border-rule py-5 sm:grid-cols-2">{ideaBlock("root", "The question")}{ideaBlock("humans", "Where it has reached")}</div>
    <div className="flex flex-wrap items-center gap-4"><div role="tablist" aria-label="View">{[false, true].map((v) => <Button key={String(v)} variant="ghost" role="tab" aria-selected={table === v} onClick={() => setTable(v)} className={table === v ? "smallcaps underline" : "smallcaps text-muted-foreground"}>{v ? "Systema" : "Tree"}</Button>)}</div><ReadingSwitch value={level} onChange={setLevel} /><Button variant="ghost" className="smallcaps ml-auto" onClick={() => setEn(!en)}>{en ? "中文" : "EN"}</Button></div>
    {table ? <Systema nodes={nodes.map((n) => ({ ...n, note: sample.nodes.find((o) => o.id === n.id)?.note ?? "" }))} steps={Object.fromEntries(Object.entries(sample.steps).map(([k, v]) => [Number(k), v]))} level={level} main={main} title="The origin of Ramus" selected={selected} onSelect={setSelected} /> : <StamTree nodes={nodes} level={level} main={main} step={10} selected={selected} onSelect={setSelected} interactive specimen={{ no: "001", title: "The origin of Ramus", collectors: ["你", "ChatGPT", "Claude"] }} />}
    <Legend people={[...new Map(nodes.map((n) => [n.by, { name: n.by, color: n.color }])).values()]} />
  </main>;
}