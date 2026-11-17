import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getGarden } from "@/lib/garden.functions";
import { StamTree, SpecimenCard, Legend } from "@/components/stam-tree/StamTree";
import { useReplay } from "@/components/stam-tree/useReplay";
import { FieldNotes } from "@/components/garden/FieldNotes";
import { AddConversationDialog } from "@/components/garden/AddConversationDialog";
import { stepDate, toIdeas, toStam } from "@/components/garden/model";
import { maxStep, selectionAt } from "@/lib/stam/layout";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export const gardenQuery = (id: string) => queryOptions({ queryKey: ["garden", id], queryFn: () => getGarden({ data: { id } }) });

export const Route = createFileRoute("/_authenticated/g/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ idea: typeof s["idea"] === "string" ? (s["idea"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Garden — Ramus" },
      { name: "description", content: "A living tree of a group's ideas: who said what, what grew from it." },
      { property: "og:title", content: "Garden — Ramus" },
      { property: "og:description", content: "A living tree of a group's ideas: who said what, what grew from it." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(gardenQuery(params.id)),
  component: GardenPage,
});

function GardenPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(gardenQuery(id));
  const ideas = useMemo(() => toIdeas(data), [data]);
  const max = maxStep(ideas);
  const r = useReplay(max);
  const [convOpen, setConvOpen] = useState(false);

  const focusKey = data.ideas.find((i: any) => i.id === data.garden.focus_idea_id)?.key;
  const newest = [...ideas].sort((a, b) => b.step - a.step || ideas.indexOf(b) - ideas.indexOf(a))[0]?.id;
  const [selected, setSelected] = useState<string | null>(search.idea ?? focusKey ?? newest ?? null);
  useEffect(() => { if (search.idea) { setSelected(search.idea); r.setStep(max); } /* eslint-disable-next-line */ }, [search.idea]);
  // replay keeps the selection, or moves it to a visible idea
  useEffect(() => { setSelected((s) => selectionAt(ideas, r.step, s)); }, [r.step, ideas]);

  const idea = ideas.find((i) => i.id === selected) ?? ideas[0];
  const stepInfo = data.steps.find((s: any) => s.step === r.step);
  const people = (data.contributors as any[]).filter((c) => ideas.some((i) => i.contributorId === c.id));

  function select(key: string) {
    const target = ideas.find((i) => i.id === key);
    if (target && target.step > r.step) r.setStep(max);
    setSelected(key);
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["garden", id] });

  function exportJson() {
    const blob = new Blob([JSON.stringify(toStam(data, ideas), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.garden.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "garden"}.stam.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="mx-auto grid max-w-[1400px] gap-5 px-5 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/gardens" className="eyebrow hover:underline">← My gardens</Link>
        <h1 className="font-display text-2xl font-bold">{data.garden.title}</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {data.conversations.length > 0 && (
            <select aria-label="Read a conversation" className="h-9 rounded-md border border-input bg-sheet px-2 text-sm" value=""
              onChange={(e) => e.target.value && navigate({ to: "/g/$id/conversations/$cid", params: { id, cid: e.target.value } })}>
              <option value="">Conversations ({data.conversations.length})…</option>
              {(data.conversations as any[]).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={() => setConvOpen(true)}>Add a conversation</Button>
          <Button variant="outline" size="sm" onClick={exportJson}>Export Stam JSON</Button>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-md border border-rule bg-sheet" aria-label="Idea tree">
          <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-3">
            <Button size="sm" variant="outline" onClick={r.play}>{r.playing ? "Pause" : "Play growth"}</Button>
            <Slider className="min-w-[180px] flex-1" min={1} max={max} step={1} value={[r.step]} onValueChange={(v) => r.setStep(v[0] ?? 1)} aria-label="Step" />
            <span className="min-w-[16em] text-sm tabular-nums" aria-live="polite">
              <b className="font-mono font-medium">Step {r.step} / {max}</b>
              {stepInfo?.title ? `  ${stepInfo.title}` : ""}
              <span className="font-mono text-xs text-muted-foreground"> · {stepDate(data, ideas, r.step) ?? "time unknown"}</span>
            </span>
          </div>
          <div className="relative overflow-x-auto">
            <div className="min-w-[760px]">
              <StamTree nodes={ideas} step={r.step} selected={selected} onSelect={select} freshStep={r.fresh.step} freshKey={r.fresh.key} ariaLabel={data.garden.title} />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-5 border-t border-rule px-4 py-3">
            <SpecimenCard no={data.garden.specimen_no} title={data.garden.title} collected={data.garden.collected} collectors={people.map((p) => p.name)} nodes={ideas} />
            <div className="flex-1 pt-1"><Legend people={people.map((p) => ({ name: p.name, color: p.color }))} /></div>
          </div>
        </section>
        {idea && <FieldNotes data={data} ideas={ideas} idea={idea} currentStep={r.step} onSelect={select} onChanged={refresh} />}
      </div>
      <AddConversationDialog data={data} open={convOpen} onOpenChange={setConvOpen} onSaved={refresh} />
    </main>
  );
}
