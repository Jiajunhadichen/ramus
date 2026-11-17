import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { replayOrder, thoughtSentence, type Thought } from "@/lib/stam/thoughts";
import { getGarden } from "@/lib/garden.functions";
import { StamTree, Legend, Seed } from "@/components/stam-tree/StamTree";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReplay } from "@/components/stam-tree/useReplay";
import { FieldNotes } from "@/components/garden/FieldNotes";
import { useBringIn } from "@/hooks/use-bring-in";
import { BringInWindow, type Incoming } from "@/components/garden/BringInWindow";
import { GardenerPanel } from "@/components/garden/Gardener";
import { stepDate, toIdeas, toStam } from "@/components/garden/model";
import { maxStep, selectionAt } from "@/lib/stam/layout";
import { Button } from "@/components/ui/button";
import { mainLineage } from "@/lib/stam/reading";
import { DEMO_COLLECTED, DEMO_LABELS, DEMO_NOTES, DEMO_PEOPLE, DEMO_STEPS } from "@/lib/stam/demo-labels";
import { Upright } from "@/components/epigraph/Epigraph";
import { Systema } from "@/components/garden/Systema";
import { Present } from "@/components/garden/Present";
import { DownloadTree } from "@/components/garden/DownloadTree";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const gardenQuery = (id: string) => queryOptions({ queryKey: ["garden", id], queryFn: () => getGarden({ data: { id } }) });

export const Route = createFileRoute("/_authenticated/g/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ idea: typeof s["idea"] === "string" ? (s["idea"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Garden — Ramus" },
      { name: "description", content: "A living tree of ideas: who planted every branch, and what grew from it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Garden — Ramus" },
      { property: "og:description", content: "A living tree of ideas: who planted every branch, and what grew from it." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(gardenQuery(params.id)),
  component: GardenPage,
  errorComponent: ({ error }) => (
    <main className="page grid gap-3 py-16">
      <h1 className="font-display text-title">No garden here</h1>
      <p>{String((error as Error)?.message).includes("cannot see") ? (error as Error).message : "This garden could not be opened."}</p>
      <Link to="/gardens" className="underline underline-offset-4">Back to my gardens</Link>
    </main>
  ),
});

function GardenPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stored } = useSuspenseQuery(gardenQuery(id));
  // the historical demo is read in English; the stored records (and the Ramus file export) stay the original
  const data = useMemo(() => (stored.garden.is_demo ? inEnglish(stored) : stored), [stored]);
  const ideas = useMemo(() => toIdeas(data), [data]);
  // Field notes can be put away; the choice stays on this device
  const [notesHidden, setNotesHidden] = useState(false);
  useEffect(() => { try { setNotesHidden(localStorage.getItem("ramus-notes-hidden") === "1"); } catch { /* storage unavailable */ } }, []);
  const hideNotes = (hidden: boolean) => { setNotesHidden(hidden); try { localStorage.setItem("ramus-notes-hidden", hidden ? "1" : "0"); } catch { /* storage unavailable */ } };
  const max = maxStep(ideas);
  const r = useReplay(max);
  const [bringOpen, setBringOpen] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  // the idea the discussion goes back to, when someone chose "Grow again from here"
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const bringIn = () => { setResumeKey(null); setBringOpen(true); };
  // Pasting a discussion (no field focused) or dropping files anywhere on the garden opens the window with it.
  useBringIn((got) => { setIncoming(got); setBringOpen(true); });
  const fresh = data.conversations.length === 0 && data.ideas.length <= 1;
  const [view, setView] = useState<"tree" | "systema">("tree");
  const [presenting, setPresenting] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<"steps" | "events">("steps");
  const events = useMemo(() => replayOrder((data.thoughts ?? []) as Thought[]), [data.thoughts]);
  const byDb = useMemo(() => new Map(ideas.map((i) => [i.dbId, i])), [ideas]);
  const [evIdx, setEvIdx] = useState<number | null>(null);
  const [evPlaying, setEvPlaying] = useState(false);
  const evTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopEv = () => { if (evTimer.current) clearInterval(evTimer.current); evTimer.current = null; setEvPlaying(false); };
  function showEvent(i: number) {
    const ev = events[i]; if (!ev) return;
    // the tree shows every idea seen up to this event, so the event's idea is always visible
    const seen = events.slice(0, i + 1).map((e) => byDb.get(e.idea_id)?.step ?? 1);
    r.setStep(Math.max(1, ...seen));
    setEvIdx(i);
    const k = byDb.get(ev.idea_id)?.id; if (k) setSelected(k);
  }
  const evIdxRef = useRef<number | null>(null); evIdxRef.current = evIdx;
  function playEvents() {
    if (evTimer.current) return stopEv();
    if (!events.length) return;
    const start = evIdxRef.current == null || evIdxRef.current >= events.length - 1 ? 0 : evIdxRef.current + 1;
    showEvent(start); setEvPlaying(true);
    evTimer.current = setInterval(() => {
      const n = (evIdxRef.current ?? -1) + 1;
      if (n >= events.length) { stopEv(); return; }
      showEvent(n);
    }, 1600);
  }
  useEffect(() => () => stopEv(), []);
  const currentEvent = evIdx != null ? events[evIdx] : null;
  const evNames = { idea: (x: string | null) => (x ? byDb.get(x)?.label ?? null : null), person: (x: string | null) => (x ? (data.contributors as any[]).find((c) => c.id === x)?.name ?? null : null) };

  const focusKey = data.ideas.find((i: any) => i.id === data.garden.focus_idea_id)?.key;
  const main = useMemo(() => mainLineage(ideas, focusKey), [ideas, focusKey]);
  const root = ideas.find((i) => !i.parents.length);
  const outcomes = ideas.filter((i) => i.outcome);
  const [selected, setSelected] = useState<string | null>(search.idea ?? null);
  useEffect(() => { if (search.idea) { setSelected(search.idea); r.setStep(max); } /* eslint-disable-next-line */ }, [search.idea]);
  // replay keeps the selection, or moves it to a visible idea
  useEffect(() => { setSelected((s) => s ? selectionAt(ideas, r.step, s) : null); }, [r.step, ideas]);

  const idea = ideas.find((i) => i.id === selected) ?? ideas[0];
  const collectedOn = data.garden.collected ?? stepDate(data, ideas, 1);
  const stepInfo = data.steps.find((s: any) => s.step === r.step);
  const people = (data.contributors as any[]).filter((c) => ideas.some((i) => i.contributorId === c.id));
  const specimen = { no: data.garden.specimen_no, title: data.garden.title, collected: collectedOn ?? undefined, collectors: people.map((p) => p.name) };

  const isMobile = useIsMobile();
  const [notesOpen, setNotesOpen] = useState(false);
  function select(key: string | null) {
    if (!key) { setSelected(null); setNotesOpen(false); return; }
    // a collapsed panel stays collapsed
    if (!notesHidden) setNotesOpen(true);
    const target = ideas.find((i) => i.id === key);
    if (target && target.step > r.step) r.setStep(max);
    setSelected(key);
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ["garden", id] });

  function exportJson() {
    const blob = new Blob([JSON.stringify(toStam(stored, toIdeas(stored)), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.garden.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "garden"}.stam.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const growAgain = data.garden.is_demo ? undefined : (key: string) => { setResumeKey(key); setBringOpen(true); };
  // a margin note where the group went back and grew again
  const returnNotes = ((data.returns ?? []) as { key: string; why: string | null }[])
    .filter((x, i, all) => ideas.some((n) => n.id === x.key) && all.findIndex((y) => y.key === x.key) === i)
    .map((x) => ({ id: x.key, text: `went back here${x.why ? ` · ${x.why.length > 44 ? x.why.slice(0, 43) + "…" : x.why}` : ""}` }));
  const notes = idea && !notesHidden ? <FieldNotes data={data} ideas={ideas} idea={idea} currentStep={r.step} onSelect={select} onChanged={refresh} onGrowAgain={growAgain} /> : null;
  return (
    <main className="page grid gap-6 py-8">
      <header className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <p className="eyebrow"><Link to="/gardens" className="hover:underline">My gardens</Link> · Specimen Nº {String(data.garden.specimen_no).padStart(3, "0")}</p>
          <h1 className="font-display text-title leading-[1.1]">{data.garden.title}</h1>

        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {data.conversations.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Conversations ({data.conversations.length})</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[60vh] overflow-y-auto">
                {(data.conversations as { id: string; title: string }[]).map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => navigate({ to: "/g/$id/conversations/$cid", params: { id, cid: c.id } })}><Upright>{c.title}</Upright></DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!data.garden.is_demo && <Button variant="outline" size="sm" onClick={bringIn}>{fresh ? "Bring in conversations" : "Add more"}</Button>}
          <Button variant="outline" size="sm" onClick={exportJson}>Export as Ramus file</Button>
        </div>
      </header>
      {data.conversations.length === 0 && !data.garden.is_demo && (
        <section aria-label="Bring in the first conversations" className="flex flex-wrap items-center gap-x-6 gap-y-2  border border-rule bg-sheet px-4 py-3">
          <p className="font-display text-read">Nothing has been said here yet.</p>
          <Button size="sm" onClick={bringIn}>Bring in conversations</Button>
        </section>
      )}
      <BringInWindow open={bringOpen} onOpenChange={setBringOpen} target={{ kind: "more", gardenId: id, fresh, resumeFrom: resumeKey ? { key: resumeKey, label: ideas.find((i) => i.id === resumeKey)?.label ?? resumeKey } : null }} onClearResume={() => setResumeKey(null)} incoming={incoming} onIncomingTaken={() => setIncoming(null)} onGrown={() => refresh()} />
      {data.conversations.length > 0 && !data.garden.is_demo && (
        <GardenerPanel gardenId={id} conversations={data.conversations as { id: string; title: string }[]}
          suggested={ideas.filter((i) => i.confirmed === false).length}
          readConversationIds={new Set(data.readConversationIds ?? [])} />
      )}
      <div className="grid gap-6 border-y border-rule py-5 sm:grid-cols-2">
        <section className="min-w-0" aria-label="The question">
          <p className="eyebrow">The question</p>
          {root && <><Button variant="ghost" onClick={() => select(root.id)} className="h-auto whitespace-normal p-0 text-left font-serif text-head font-normal"><Upright>{root.label}</Upright></Button><p className="mt-1 text-muted-foreground"><Upright>{root.note}</Upright></p></>}
        </section>
        <section className="grid min-w-0 content-start gap-3" aria-label="Where it has reached">
          <p className="eyebrow">Where it has reached</p>
          {outcomes.length ? outcomes.map((n) => <div key={n.id}><Button variant="ghost" onClick={() => select(n.id)} className="h-auto whitespace-normal p-0 text-left font-serif text-head font-normal"><Upright>{n.label}</Upright></Button><p className="mt-1 text-muted-foreground"><Upright>{n.note}</Upright></p><p className="smallcaps mt-1 text-note text-muted-foreground">Step {n.step}{data.steps.find((s: any) => s.step === n.step)?.title ? <> · <Upright>{data.steps.find((s: any) => s.step === n.step)?.title}</Upright></> : null}</p></div>) : <p className="text-muted-foreground">No outcome marked yet.</p>}
        </section>
      </div>
      <div className={"grid items-start gap-5" + (notesHidden ? "" : " lg:grid-cols-[minmax(0,1fr)_340px]")}>
        <section ref={sheet} className=" border border-rule bg-sheet" aria-label="Specimen sheet">
          <div className="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-3">
            <Button variant="outline" onClick={mode === "steps" ? r.play : playEvents}>{(mode === "steps" ? r.playing : evPlaying) ? "Pause" : "Play growth"}</Button>
            <Button variant="outline" onClick={() => { r.stop(); stopEv(); setPresenting(true); }}>Present</Button>
            <div role="radiogroup" aria-label="Replay by" className="flex gap-2 text-ui">
              {(["steps", "events"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { r.stop(); stopEv(); setMode(m); setEvIdx(null); }}
                  className={mode === m ? "text-foreground underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>By {m}</button>
              ))}
            </div>
            <input type="range" className="range-green min-w-[160px] flex-1" min={1} max={max} step={1} value={r.step}
              onChange={(e) => { stopEv(); setEvIdx(null); r.setStep(Number(e.target.value)); }} aria-label="Step" />
            <div role="tablist" aria-label="View" className="ml-auto flex gap-3 text-ui order-first basis-full sm:basis-auto sm:order-none">
              {(["tree", "systema"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)}
                  className={view === v ? "text-foreground underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>{v === "tree" ? "Tree" : "Story"}</button>
              ))}
            </div>
            {view === "tree" && <DownloadTree size="default" poster={() => ({ nodes: ideas, title: data.garden.title, line: (outcomes[0] ?? root)?.label ?? null, selected, main, notes: returnNotes, specimen })} />}
            {notesHidden && <button type="button" className="text-ui text-muted-foreground hover:text-foreground" onClick={() => hideNotes(false)}>Notes</button>}
            <span className="text-ui" aria-live="polite">
              <span className="smallcaps">Step {r.step} of {max}</span>
              {stepInfo?.title ? <span className="ml-2">{stepInfo.title}</span> : null}
              <span className="eyebrow ml-2">{stepDate(data, ideas, r.step) ?? "time unknown"}</span>
            </span>
          </div>
          {mode === "events" && (
            <p className="border-b border-rule px-4 py-2 text-ui" aria-live="polite" data-testid="event-line">
              {currentEvent
                ? <><span className="smallcaps mr-2 text-note text-muted-foreground">Event {(evIdx ?? 0) + 1} of {events.length}</span>{thoughtSentence(currentEvent, evNames)}</>
                : <span className="text-muted-foreground">{events.length} events. Play growth to step through what happened to each idea.</span>}
            </p>
          )}
          {ideas.length === 0 ? <Seed /> : view === "systema" ? (
            <Systema returns={(data.returns ?? []) as { key: string; why: string | null; step: number | null }[]} main={main} level="record" title={data.garden.title} nodes={ideas} steps={Object.fromEntries(data.steps.map((st: { step: number; title: string | null }) => [st.step, st.title]))} selected={selected} onSelect={(k) => { select(k); }} />
          ) : (
            <StamTree notes={returnNotes} labels="zoom" main={main} nodes={ideas} step={r.step} selected={selected} onSelect={select} freshStep={r.fresh.step} freshKey={r.fresh.key}
              ariaLabel={data.garden.title} interactive
              specimen={specimen} />
          )}
          <div className="border-t border-rule px-4 py-3"><Legend people={people.map((p) => ({ name: p.name, color: p.color }))} /></div>
        </section>
        {isMobile ? (
          <Sheet open={notesOpen && !!idea} onOpenChange={setNotesOpen}>
            <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto bg-sheet p-0">
              <SheetTitle className="sr-only">Field notes</SheetTitle>
              {notes}
            </SheetContent>
          </Sheet>
        ) : notes && (
          <div className="grid gap-0">
            <button type="button" className="justify-self-end pb-1 text-ui text-muted-foreground hover:text-foreground" onClick={() => hideNotes(true)}>Hide notes</button>
            {notes}
          </div>
        )}
      </div>
      {presenting && (
        <Present title={data.garden.title} nodes={ideas} main={main} notes={returnNotes}
          steps={Object.fromEntries(data.steps.map((st: { step: number; title: string | null }) => [st.step, st.title]))}
          returns={(data.returns ?? []) as { key: string; why: string | null; step: number | null }[]}
          specimen={{ no: data.garden.specimen_no, title: data.garden.title, collected: collectedOn ?? undefined, collectors: people.map((p) => p.name) }}
          dateOf={(st) => stepDate(data, ideas, st)} onClose={() => setPresenting(false)} />
      )}
    </main>
  );
}

/** Display-time English for the demo garden: labels, notes, step titles, people, the specimen line. */
function inEnglish<D extends { garden: any; ideas: any[]; steps: any[]; contributors: any[] }>(d: D): D {
  return {
    ...d,
    garden: { ...d.garden, collected: d.garden.collected ? DEMO_COLLECTED : d.garden.collected },
    ideas: d.ideas.map((i) => ({ ...i, label: DEMO_LABELS[i.key] ?? i.label, note: DEMO_NOTES[i.key] ?? i.note })),
    steps: d.steps.map((st) => ({ ...st, title: DEMO_STEPS[st.step] ?? st.title })),
    contributors: d.contributors.map((c) => ({ ...c, name: DEMO_PEOPLE[c.name] ?? c.name })),
  };
}
