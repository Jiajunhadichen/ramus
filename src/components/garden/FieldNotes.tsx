import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Upright } from "@/components/epigraph/Epigraph";

/** The classification line: root › … › parent › idea, following primary parents. */
function lineageOf<T extends { id: string; parents: string[] }>(idea: T, byKey: Map<string, T>): T[] {
  const out: T[] = []; const seen = new Set<string>();
  for (let n: T | undefined = idea; n && !seen.has(n.id); n = n.parents[0] ? byKey.get(n.parents[0]) : undefined) { seen.add(n.id); out.unshift(n); }
  return out;
}
import { toast } from "sonner";
import { addEvidence, editIdea, graftMerge, growBranch, reopenKnot, renameContributor, reviewSuggestion, reviewThought, setIdeaContributor, setKnot, setStatus, setOutcome } from "@/lib/garden.functions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { lifeOf, SETTLED_KINDS, thoughtPhrase, type Thought } from "@/lib/stam/thoughts";
import { MAX_LABEL } from "@/lib/stam/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { evidenceFor, type GardenData, type Idea } from "./model";
import { formatDate, formatTime, NATURES, ROLE_LABEL, ROLE_ORDER, sortEvidence, type EvidenceRole } from "@/lib/stam/evidence";

type Props = {
  data: GardenData; ideas: Idea[]; idea: Idea; currentStep: number;
  onSelect: (key: string) => void; onChanged: () => Promise<unknown>;
  /** opens the bring-in window picking up from this idea (not on the demo garden) */
  onGrowAgain?: ((key: string) => void) | undefined;
};

const selectCls = "h-9 w-full  border border-input bg-sheet px-2 text-ui";

export function FieldNotes({ data, ideas, idea, currentStep, onSelect, onChanged, onGrowAgain }: Props) {
  const [more, setMore] = useState(false);
  const [dialog, setDialog] = useState<null | "grow" | "graft" | "knot" | "reopen" | "edit" | "evidence">(null);
  const status = useServerFn(setStatus);
  const outcomeFn = useServerFn(setOutcome);
  const knotFn = useServerFn(setKnot);
  const reopenFn = useServerFn(reopenKnot);
  const suggestFn = useServerFn(reviewSuggestion);
  const suggested = idea.confirmed === false;
  // the root is the question: it is neither set aside nor an outcome
  const isRoot = !idea.parents.length;
  const stepTitle = data.steps.find((s: any) => s.step === idea.step);
  const byKey = new Map(ideas.map((i) => [i.id, i]));
  const children = ideas.filter((c) => c.parents.includes(idea.id));
  const evidence = sortEvidence(evidenceFor(data, idea));
  const review = useServerFn(reviewThought);
  const byDb = new Map(ideas.map((i) => [i.dbId, i]));
  const people = new Map((data.contributors as any[]).map((c) => [c.id, c]));
  const msgs = new Map(((data.convMessages ?? []) as any[]).map((m) => [m.id, m]));
  const names = { idea: (id: string | null) => (id ? byDb.get(id)?.label ?? null : null), person: (id: string | null) => (id ? people.get(id)?.name ?? null : null) };
  const life = lifeOf((data.thoughts ?? []) as Thought[], idea.dbId);
  const quoteOf = (tid: string) => ((data.thoughtEvidence ?? []) as any[]).filter((e) => e.thought_event_id === tid).map((e) => msgs.get(e.message_id)).find(Boolean);
  const primaryParent = idea.parents[0] ? byKey.get(idea.parents[0]) : undefined;
  const mergeParents = idea.parents.slice(1).map((p) => byKey.get(p)!).filter(Boolean);
  const grewInto = children.filter((c) => c.parents[0] === idea.id);
  const mergedInto = children.filter((c) => c.parents[0] !== idea.id);
  const descendants = (() => { const seen = new Set<string>(); const q = [idea.id]; while (q.length) { const k = q.pop()!; for (const c of ideas) if (c.parents.includes(k) && !seen.has(c.id)) { seen.add(c.id); q.push(c.id); } } return seen.size; })();

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); await onChanged(); toast.success(ok); setDialog(null); return true; }
    catch (e) { toast.error((e as Error).message); return false; }
  }
  const links = (list: Idea[], nature?: (c: Idea) => string | null | undefined) =>
    list.length ? list.map((c) => (
      <span key={c.id}>
        <button type="button" className="underline underline-offset-4 hover:text-[color:var(--person-1)]" onClick={() => onSelect(c.id)}>{c.label}</button>
        {nature?.(c) && <span className="text-muted-foreground"> · {nature(c)}</span>}
      </span>
    )) : <span className="text-muted-foreground">none</span>;

  return (
    <aside className="sticky top-4 grid gap-3  border border-rule bg-sheet p-5" aria-live="polite">
      <p className="eyebrow">Field notes · Step {idea.step}{stepTitle?.title ? ` · ${stepTitle.title}` : ""}{stepTitle?.date ? ` · ${stepTitle.date}` : ""}</p>
      <nav aria-label="Lineage" className="smallcaps flex flex-wrap items-baseline gap-x-1.5 text-note text-muted-foreground">
        {lineageOf(idea, byKey).map((n, i, arr) => (
          <span key={n.id} className="inline-flex items-baseline gap-1.5">
            {i === 0 && <span>{data.garden.title}</span>}
            <span aria-hidden>›</span>
            {i === arr.length - 1 ? <span className="text-foreground"><Upright>{n.label}</Upright></span>
              : <button type="button" className="hover:text-foreground hover:underline" onClick={() => onSelect(n.id)}><Upright>{n.label}</Upright></button>}
          </span>
        ))}
      </nav>
      <h2 className="font-display text-head leading-tight"><Upright>{idea.label}</Upright></h2>
      <div className="flex flex-wrap gap-1.5">
        <AuthorChip data={data} idea={idea} run={run} />
        {isRoot
          ? <span className="chip">The question</span>
          : <span role="radiogroup" aria-label="Is the group still working on it?" className="inline-flex overflow-hidden  border border-ink text-note">
              {(["growing", "dormant"] as const).map((st) => (
                <button key={st} type="button" role="radio" aria-checked={idea.status === st}
                  className={"px-2 py-0.5 " + (idea.status === st ? "bg-ink text-sheet" : "hover:bg-ink/10")}
                  onClick={() => idea.status !== st && run(() => status({ data: { gardenId: data.garden.id, key: idea.id, status: st } }), st === "dormant" ? "Set aside. It stays on the tree, drawn hollow." : "Growing again.")}>
                  {st === "growing" ? "Growing" : "Set aside"}
                </button>
              ))}
            </span>}
        {idea.knot && <span className="chip">Knot</span>}
        {idea.outcome && <span className="smallcaps">Outcome</span>}
        {idea.parents.length > 1 && <span className="chip">Merged {idea.parents.length} lines</span>}
      </div>
      {idea.status === "dormant" && !isRoot && <p className="hand text-ui">Set aside for now: it stays on the tree, drawn hollow, and can grow again.</p>}
      {suggested && (
        <section aria-label="The gardener’s suggestion" className="grid gap-2  border border-rule p-3">
          <p className="eyebrow">The gardener’s suggestion</p>
          <p className="text-ui">{idea.contributorId
            ? <>The gardener read the conversation and thinks <span style={{ color: idea.color }}>{idea.by}</span> raised this here. People decide.</>
            : <>The gardener read the words and thinks this is raised here. No one is named as its author. People decide.</>}</p>
          <Attribution idea={idea} />
          {idea.suggestion?.why && <p className="hand text-ui"><Upright>{idea.suggestion.why}</Upright></p>}
          {idea.suggestion?.knot && <p className="text-ui"><span className="hand text-note">It may have settled · </span><Upright>{idea.suggestion.knot.settled}</Upright></p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => run(() => suggestFn({ data: { gardenId: data.garden.id, key: idea.id, accept: true } }), "Accepted. It is on the tree now.")}>Accept</Button>
            <Button size="sm" variant="ghost" onClick={() => run(() => suggestFn({ data: { gardenId: data.garden.id, key: idea.id, accept: false } }), "Rejected. It stays in the record, off the tree.")}>Reject</Button>
          </div>
          {primaryParent?.confirmed === false && <p className="text-note text-muted-foreground">Accepting it also accepts the suggestion it grows from.</p>}
        </section>
      )}
      {!suggested && idea.suggestion && (
        <section aria-label="Placed by the gardener" className="grid gap-1.5 border-l border-rule pl-3 text-ui">
          <p className="hand text-ui">{idea.contributorId
            ? <>The gardener placed this from what <span style={{ color: idea.color }}>{idea.by}</span> said.</>
            : <>The gardener placed this from words with no known author.</>}{idea.suggestion.why ? <> <Upright>{idea.suggestion.why}</Upright></> : null}</p>
          <Attribution idea={idea} />
          <div><button type="button" className="text-note text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => run(() => suggestFn({ data: { gardenId: data.garden.id, key: idea.id, accept: false } }), "Taken off the tree. It stays in the record.")}>Not right? Take it off the tree</button></div>
        </section>
      )}
      {!suggested && !idea.knot && idea.suggestion?.knot && (
        <section aria-label="A knot the gardener noticed" className="grid gap-2  border border-rule p-3 text-ui">
          <p><span className="hand text-note">The gardener thinks this was settled · </span><Upright>{idea.suggestion.knot.settled}</Upright></p>
          <div><Button size="sm" variant="outline" onClick={() => run(() => knotFn({ data: { gardenId: data.garden.id, key: idea.id, settled: idea.suggestion!.knot!.settled, kind: idea.suggestion!.knot!.kind as "decision" } }), "Knot tied.")}>Tie this knot</Button></div>
        </section>
      )}
      {idea.note && <p className="whitespace-pre-wrap">{idea.note}</p>}
      {idea.knot && idea.settled && <p className="border-l-2 border-ink pl-3 text-ui"><span className="eyebrow block">Settled</span>{idea.settled}</p>}
      <section aria-labelledby="fn-from" className="grid gap-2 border-t border-rule pt-3">
        <h3 id="fn-from" className="eyebrow">Where it came from</h3>
        <dl className="grid grid-cols-[6.5em_1fr] gap-x-2 gap-y-1.5 text-ui">
          <dt className="text-muted-foreground">Grew from</dt><dd className="flex flex-wrap gap-x-2">{links(primaryParent ? [primaryParent] : [], (p) => idea.natures[p.id])}{!primaryParent && <span className="text-muted-foreground"> (the root)</span>}</dd>
          <dt className="text-muted-foreground">Merged lines</dt><dd className="flex flex-wrap gap-x-2">{links(mergeParents, (p) => idea.natures[p.id])}</dd>
        </dl>
        {evidence.length > 0 && (
          <div className="grid gap-2  border border-rule p-3 text-ui">
            <span className="eyebrow">Heard in</span>
            <ol className="grid gap-3">
              {evidence.map((e) => (
                <li key={e.id} className="grid gap-0.5" data-role={e.role}>
                  <span className="smallcaps text-note text-muted-foreground">{ROLE_LABEL[e.role as EvidenceRole] ?? e.role}</span>
                  <blockquote className="hand text-ui">“{e.content}”</blockquote>
                  <span className="text-note">
                    <span style={{ color: e.speaker?.color }}>{e.speaker?.name ?? "Unattributed"}</span>
                    {" · "}{formatTime(e.sentAt, e.precision)}
                    {e.conversation && <> · {e.conversation.title} (happened {formatDate(e.conversation.happened_at)})</>}
                  </span>
                  {e.note && <span className="text-note text-muted-foreground">{e.note}</span>}
                  {e.conversation && <Link to="/g/$id/conversations/$cid" params={{ id: data.garden.id, cid: e.conversation.id }} hash={e.messageId} className="text-note underline underline-offset-4">Read in conversation</Link>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section aria-labelledby="fn-changed" className="grid gap-2 border-t border-rule pt-3">
        <h3 id="fn-changed" className="eyebrow">How it changed</h3>
        {life.length === 0 ? <p className="text-ui text-muted-foreground">Nothing recorded yet.</p> : (
          <ol className="grid gap-0 text-ui" data-testid="life">
            {life.map((t, i) => {
              const gardener = t.origin === "ai";
              const pending = !t.confirmed && !t.rejected_at && !gardener;
              const q = quoteOf(t.id);
              const who = names.person(t.person_id);
              return (
                <li key={t.id} data-type={t.type} data-pending={pending || undefined}
                  className={"relative grid gap-0.5 pb-3 pl-5 " + (t.rejected_at ? "opacity-50 line-through" : "")}>
                  {i < life.length - 1 && <span aria-hidden className="absolute left-[4px] top-[12px] bottom-0 border-l border-ink" />}
                  <span aria-hidden className={"absolute left-0 top-[6px] h-[9px] w-[9px] rounded-full border border-ink " + (pending ? "border-dashed bg-sheet" : "bg-ink")} />
                  <span><Upright>{thoughtPhrase(t, names)}</Upright></span>
                  <span className="text-note text-muted-foreground">
                    {who && <span style={{ color: people.get(t.person_id!)?.color }}>{who} · </span>}
                    {formatTime(t.occurred_at, t.time_precision)}
                    {pending && " · suggested, not yet confirmed"}
                    {gardener && !t.rejected_at && " · the gardener’s reading"}
                    {(t as any).corrects_event_id && " · corrects an earlier entry"}
                    {t.rejected_at && " · rejected"}
                  </span>
                  {t.rationale && <span className="text-note"><Upright>{t.rationale}</Upright></span>}
                  {q && <blockquote className="hand text-note">“{q.content}”</blockquote>}
                  {pending && (
                    <span className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => run(() => review({ data: { id: t.id, confirm: true } }), "Confirmed.")}>Confirm</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => review({ data: { id: t.id, confirm: false } }), "Rejected, still kept in the record.")}>Reject</Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="fn-grew" className="grid gap-2 border-t border-rule pt-3">
        <h3 id="fn-grew" className="eyebrow">What grew from it</h3>
        <dl className="grid grid-cols-[6.5em_1fr] gap-x-2 gap-y-1.5 text-ui">
          <dt className="text-muted-foreground">Grew into</dt><dd className="flex flex-wrap gap-x-2">{links(grewInto, (c) => c.natures[idea.id])}</dd>
          <dt className="text-muted-foreground">Merged into</dt><dd className="flex flex-wrap gap-x-2">{links(mergedInto, (c) => c.natures[idea.id])}</dd>
          <dt className="text-muted-foreground">Descendants</dt><dd data-testid="descendants">{descendants}</dd>
        </dl>
      </section>

      {!suggested && <div className="mt-2 grid grid-cols-2 gap-2 border-t border-rule pt-3">
        {onGrowAgain && <Button variant="outline" size="sm" className="col-span-2" onClick={() => onGrowAgain(idea.id)}>Grow again from here</Button>}
        {(!isRoot || idea.outcome) && <Button size="sm" variant="outline" onClick={() => run(() => outcomeFn({ data: { gardenId: data.garden.id, key: idea.id, outcome: !idea.outcome } }), idea.outcome ? "Outcome unmarked." : "Outcome marked.")}>{idea.outcome ? "Unmark outcome" : "Mark as outcome"}</Button>}
        <Button size="sm" variant="outline" className={isRoot && !idea.outcome ? "col-span-2" : ""} onClick={() => setDialog("edit")}>Edit</Button>
        <Button size="sm" variant="outline" className="col-span-2" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Less" : "More"}</Button>
        {more && <>
          <Button size="sm" variant="outline" onClick={() => setDialog("grow")}>Add a branch by hand</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("graft")} disabled={!idea.parents.length}>Graft a merge</Button>
          {idea.knot
            ? <Button size="sm" variant="outline" onClick={() => setDialog("reopen")}>Reopen knot</Button>
            : <Button size="sm" variant="outline" onClick={() => setDialog("knot")}>Mark as knot</Button>}
          <Button size="sm" variant="outline" onClick={() => setDialog("evidence")} disabled={!(data.convMessages ?? []).length}>Add evidence</Button>
        </>}
      </div>}

      {dialog === "grow" && <GrowDialog {...{ data, idea, currentStep, onSelect, run }} onClose={() => setDialog(null)} />}
      {dialog === "graft" && <GraftDialog {...{ data, ideas, idea, run }} onClose={() => setDialog(null)} />}
      {dialog === "knot" && <KnotDialog onClose={() => setDialog(null)}
        submit={(t, kind) => run(() => knotFn({ data: { gardenId: data.garden.id, key: idea.id, settled: t, kind } }), "Knot tied.")} />}
      {dialog === "reopen" && <TextDialog title="Reopen knot" question="Why does this need reopening?" hint={idea.settled ? `Settled: “${idea.settled}”` : ""}
        action="Reopen" onClose={() => setDialog(null)}
        submit={(t) => run(() => reopenFn({ data: { gardenId: data.garden.id, key: idea.id, reason: t } }), "Knot reopened.")} />}
      {dialog === "evidence" && <EvidenceDialog {...{ data, idea, run }} onClose={() => setDialog(null)} />}
      {dialog === "edit" && <EditDialog {...{ data, idea, run }} onClose={() => setDialog(null)} />}
    </aside>
  );

}

function Shell({ title, desc, children, onClose }: { title: string; desc?: string; children: ReactNode; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          {desc && <DialogDescription>{desc}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

function TextDialog({ title, question, hint, action, submit, onClose }: { title: string; question: string; hint?: string; action: string; submit: (t: string) => Promise<boolean>; onClose: () => void }) {
  const [t, setT] = useState("");
  return (
    <Shell title={title} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(t); }}>
        <Label htmlFor="td">{question}</Label>
        <Textarea id="td" required value={t} onChange={(e) => setT(e.target.value)} />
        {hint && <p className="text-note text-muted-foreground">{hint}</p>}
        <DialogFooter><Button type="submit" disabled={!t.trim()}>{action}</Button></DialogFooter>
      </form>
    </Shell>
  );
}

function GrowDialog({ data, idea, currentStep, onSelect, run, onClose }: { data: GardenData; idea: Idea; currentStep: number; onSelect: (k: string) => void; run: Run; onClose: () => void }) {
  const grow = useServerFn(growBranch);
  const people = data.contributors as any[];
  const [f, setF] = useState({ label: "", note: "", person: people.find((p) => p.kind === "person")?.id ?? people[0]?.id ?? "new", newPerson: "", stepMode: "current", stepTitle: "", stepDate: "", messageId: "", nature: "refines" });
  const len = [...f.label].length;
  return (
    <Shell title="Grow a branch" desc={`A new idea that grew from “${idea.label}”.`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => {
        e.preventDefault();
        let newKey = "";
        run(async () => {
          const r = await grow({ data: {
            gardenId: data.garden.id, parentKey: idea.id, label: f.label, note: f.note,
            contributorId: f.person === "new" ? undefined : f.person, newPerson: f.person === "new" ? f.newPerson : undefined,
            step: currentStep, newStep: f.stepMode === "new" ? { title: f.stepTitle, date: f.stepDate || null } : undefined,
            messageId: f.messageId || null, nature: f.nature,
          } });
          newKey = r.key;
        }, "Branch grown.").then((ok) => ok && newKey && onSelect(newKey));
      }}>
        <div className="grid gap-1.5">
          <Label htmlFor="g-label">Label</Label>
          <Input id="g-label" required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <span className={"text-note " + (len > MAX_LABEL ? "text-destructive" : "text-muted-foreground")}>{len}/{MAX_LABEL}{len > MAX_LABEL ? " — too long; put the rest in the note" : ""}</span>
        </div>
        <NatureSelect id="g-nature" value={f.nature} onChange={(v) => setF({ ...f, nature: v })} />
        <div className="grid gap-1.5"><Label htmlFor="g-note">Note</Label><Textarea id="g-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="g-person">Who said it?</Label>
          <select id="g-person" className={selectCls} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="new">+ Add a person…</option>
          </select>
          {f.person === "new" && <Input aria-label="New person’s name" required placeholder="Name" value={f.newPerson} onChange={(e) => setF({ ...f, newPerson: e.target.value })} />}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="g-step">Step</Label>
          <select id="g-step" className={selectCls} value={f.stepMode} onChange={(e) => setF({ ...f, stepMode: e.target.value })}>
            <option value="current">Current step ({currentStep})</option>
            <option value="new">A new step…</option>
          </select>
          {f.stepMode === "new" && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input aria-label="New step title" required placeholder="Step title" value={f.stepTitle} onChange={(e) => setF({ ...f, stepTitle: e.target.value })} />
              <Input aria-label="New step date" type="date" value={f.stepDate} onChange={(e) => setF({ ...f, stepDate: e.target.value })} />
            </div>
          )}
        </div>
        {(data.convMessages ?? []).length > 0 && (
          <div className="grid gap-1.5">
            <Label htmlFor="g-msg">Origin message (optional)</Label>
            <select id="g-msg" className={selectCls} value={f.messageId} onChange={(e) => setF({ ...f, messageId: e.target.value })}>
              <option value="">— not from a recorded conversation —</option>
              {(data.conversations as any[]).map((c) => (
                <optgroup key={c.id} label={c.title}>
                  {((data.convMessages ?? []) as any[]).filter((m) => m.conversation_id === c.id).map((m) => {
                    const who = people.find((p) => p.id === m.contributor_id)?.name ?? "—";
                    return <option key={m.id} value={m.id}>{who}: {m.content.slice(0, 80)}</option>;
                  })}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <DialogFooter><Button type="submit" disabled={!f.label.trim() || len > MAX_LABEL}>Grow</Button></DialogFooter>
      </form>
    </Shell>
  );
}

function GraftDialog({ data, ideas, idea, run, onClose }: { data: GardenData; ideas: Idea[]; idea: Idea; run: Run; onClose: () => void }) {
  const graft = useServerFn(graftMerge);
  const options = ideas.filter((i) => i.id !== idea.id && !idea.parents.includes(i.id));
  const [p, setP] = useState(options[0]?.id ?? "");
  const [nature, setNature] = useState("combines");
  return (
    <Shell title="Graft a merge" desc={`Pick another idea that “${idea.label}” also grew from.`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => graft({ data: { gardenId: data.garden.id, childKey: idea.id, parentKey: p, nature } }), "Merge grafted."); }}>
        <Label htmlFor="gr">Also grew from</Label>
        <select id="gr" className={selectCls} value={p} onChange={(e) => setP(e.target.value)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label} — {o.by}, step {o.step}</option>)}
        </select>
        <NatureSelect id="gr-nature" value={nature} onChange={setNature} />
        <DialogFooter><Button type="submit" disabled={!p}>Graft</Button></DialogFooter>
      </form>
    </Shell>
  );
}

function EditDialog({ data, idea, run, onClose }: { data: GardenData; idea: Idea; run: Run; onClose: () => void }) {
  const edit = useServerFn(editIdea);
  const [label, setLabel] = useState(idea.label);
  const [note, setNote] = useState(idea.note);
  const len = [...label].length;
  return (
    <Shell title="Edit label and note" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => edit({ data: { gardenId: data.garden.id, key: idea.id, label, note } }), "Saved."); }}>
        <Label htmlFor="e-l">Label</Label>
        <Input id="e-l" value={label} onChange={(e) => setLabel(e.target.value)} />
        <span className={"text-note " + (len > MAX_LABEL ? "text-destructive" : "text-muted-foreground")}>{len}/{MAX_LABEL}</span>
        <Label htmlFor="e-n">Note</Label>
        <Textarea id="e-n" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter><Button type="submit" disabled={!label.trim() || len > MAX_LABEL}>Save</Button></DialogFooter>
      </form>
    </Shell>
  );
}

function NatureSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>How did it grow?</Label>
      <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {NATURES.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}

function EvidenceDialog({ data, idea, run, onClose }: { data: GardenData; idea: Idea; run: Run; onClose: () => void }) {
  const add = useServerFn(addEvidence);
  const people = data.contributors as any[];
  const msgs = (data.convMessages ?? []) as any[];
  const [f, setF] = useState({ messageId: msgs[0]?.id ?? "", role: "supports" as EvidenceRole, note: "" });
  return (
    <Shell title="Add evidence" desc={`Link a message that “${idea.label}” rests on. The message itself is never changed.`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); run(() => add({ data: { gardenId: data.garden.id, key: idea.id, ...f } }), "Evidence added."); }}>
        <Label htmlFor="ev-m">Message</Label>
        <select id="ev-m" className={selectCls} value={f.messageId} onChange={(e) => setF({ ...f, messageId: e.target.value })}>
          {(data.conversations as any[]).map((c) => (
            <optgroup key={c.id} label={c.title}>
              {msgs.filter((m) => m.conversation_id === c.id).map((m) => (
                <option key={m.id} value={m.id}>{people.find((p) => p.id === m.contributor_id)?.name ?? "—"}: {m.content.slice(0, 80)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <Label htmlFor="ev-r">Role</Label>
        <select id="ev-r" className={selectCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as EvidenceRole })}>
          {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <Label htmlFor="ev-n">Note (optional)</Label>
        <Input id="ev-n" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <DialogFooter><Button type="submit" disabled={!f.messageId}>Add</Button></DialogFooter>
      </form>
    </Shell>
  );
}

type Kind = (typeof SETTLED_KINDS)[number][0];
function KnotDialog({ submit, onClose }: { submit: (t: string, kind: Kind) => Promise<boolean>; onClose: () => void }) {
  const [t, setT] = useState("");
  const [kind, setKind] = useState<Kind | "">("");
  return (
    <Shell title="Mark as knot" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (kind) submit(t, kind); }}>
        <Label htmlFor="k-kind">What kind of knot is it?</Label>
        <select id="k-kind" required className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="">Choose…</option>
          {SETTLED_KINDS.map(([v, l]) => <option key={v} value={v}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
        </select>
        <Label htmlFor="td">What is now settled?</Label>
        <Textarea id="td" required value={t} onChange={(e) => setT(e.target.value)} />
        <p className="text-note text-muted-foreground">One sentence. Reopening a knot later needs a reason.</p>
        <DialogFooter><Button type="submit" disabled={!t.trim() || !kind}>Tie the knot</Button></DialogFooter>
      </form>
    </Shell>
  );
}

/** How Ramus knows who said it: never more certain than the source. A probable voice is only a hint and is not coloured. */
const KNOWN_BY: Record<string, string> = {
  source_metadata: "Who said it comes from the source itself.",
  explicit_header: "Who said it is written in the words (a name before the line).",
  user_supplied: "Who said it comes from what you said about the source when bringing it in.",
};
function Attribution({ idea }: { idea: Idea }) {
  if (idea.authorCorrected) return <p className="text-note text-muted-foreground">{idea.contributorId ? "Who said it was corrected by a person." : "A person marked that no one is known to have said it."}</p>;
  const a = idea.suggestion?.attribution;
  if (!a) return null;
  if (idea.contributorId && a.basis === "inferred") return <p className="text-note text-muted-foreground">Ramus read from the words that {idea.by} said this. Not right? Change it above.</p>;
  if (idea.contributorId) return KNOWN_BY[a.basis] ? <p className="text-note text-muted-foreground">{KNOWN_BY[a.basis]}</p> : null;
  return <p className="text-note text-muted-foreground">{a.likely ? `Possibly ${a.likely}, but the words do not say so: it stays unattributed and uncoloured.` : "The words do not say who said it, so Ramus does not guess."}</p>;
}

/**
 * Who this came from, and the way to correct it: anyone in the garden, someone new, or no one known.
 * The branch colour follows the choice everywhere (tree, legend, Story, exports).
 */
function AuthorChip({ data, idea, run }: { data: GardenData; idea: Idea; run: Run }) {
  const change = useServerFn(setIdeaContributor);
  const rename = useServerFn(renameContributor);
  // "one": who said this idea; "all": rename this voice everywhere (or fold it into someone already here)
  const [naming, setNaming] = useState<false | "one" | "all">(false);
  const people = (data.contributors as { id: string; name: string; color: string }[]) ?? [];
  const set = (contributorId: string | null, newName?: string) =>
    run(() => change({ data: { gardenId: data.garden.id, key: idea.id, contributorId, newName: newName ?? null } }),
      newName ? `Now credited to ${newName}.` : contributorId ? `Now credited to ${people.find((p) => p.id === contributorId)?.name ?? "them"}.` : "Now unattributed.");
  if (naming) return (
    <form className="inline-flex items-center gap-1" onSubmit={(e) => {
      e.preventDefault();
      const v = new FormData(e.currentTarget).get("name")?.toString().trim();
      if (!v) return;
      if (naming === "all" && idea.contributorId) void run(() => rename({ data: { gardenId: data.garden.id, contributorId: idea.contributorId!, name: v } }), `${idea.by} is now ${v} everywhere.`).then(() => setNaming(false));
      else void set(null, v).then(() => setNaming(false));
    }}>
      <input name="name" autoFocus maxLength={60} placeholder={naming === "all" ? `Rename ${idea.by}` : "Name"} aria-label={naming === "all" ? `Rename ${idea.by} everywhere` : "Who said it"} className="h-7 w-32 border border-input bg-transparent px-2 text-note" />
      <button type="submit" className="chip">{naming === "all" ? "Rename" : "Credit"}</button>
      <button type="button" className="chip" onClick={() => setNaming(false)}>Cancel</button>
    </form>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="chip" style={{ color: idea.color }} aria-label={`Said by ${idea.contributorId ? idea.by : "no one known"}. Change who said it`}>
          {idea.contributorId ? idea.by : "Unattributed"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {people.map((p) => (
          <DropdownMenuItem key={p.id} disabled={p.id === idea.contributorId} onSelect={() => void set(p.id)}>
            <span aria-hidden className="mr-2 inline-block size-2 rounded-full" style={{ background: p.color }} />{p.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => setNaming("one")}>Someone else…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!idea.contributorId} onSelect={() => void set(null)}>No one known</DropdownMenuItem>
        {idea.contributorId && <DropdownMenuItem onSelect={() => setNaming("all")}>Rename {idea.by} everywhere…</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
