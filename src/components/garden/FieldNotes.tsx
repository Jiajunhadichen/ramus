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
import { addEvidence, editIdea, graftMerge, growBranch, reopenKnot, setKnot, setStatus } from "@/lib/garden.functions";
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
};

const selectCls = "h-9 w-full rounded-md border border-input bg-sheet px-2 text-sm";

export function FieldNotes({ data, ideas, idea, currentStep, onSelect, onChanged }: Props) {
  const [dialog, setDialog] = useState<null | "grow" | "graft" | "knot" | "reopen" | "edit" | "evidence">(null);
  const status = useServerFn(setStatus);
  const knotFn = useServerFn(setKnot);
  const reopenFn = useServerFn(reopenKnot);
  const stepTitle = data.steps.find((s: any) => s.step === idea.step);
  const byKey = new Map(ideas.map((i) => [i.id, i]));
  const children = ideas.filter((c) => c.parents.includes(idea.id));
  const evidence = sortEvidence(evidenceFor(data, idea));

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
    <aside className="sticky top-4 grid gap-3 rounded-md border border-rule bg-sheet p-5" aria-live="polite">
      <p className="eyebrow">Field notes · Step {idea.step}{stepTitle?.title ? ` · ${stepTitle.title}` : ""}{stepTitle?.date ? ` · ${stepTitle.date}` : ""}</p>
      <nav aria-label="Lineage" className="smallcaps flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-muted-foreground">
        {lineageOf(idea, byKey).map((n, i, arr) => (
          <span key={n.id} className="inline-flex items-baseline gap-1.5">
            {i === 0 && <span>{data.garden.title}</span>}
            <span aria-hidden>›</span>
            {i === arr.length - 1 ? <span className="text-foreground"><Upright>{n.label}</Upright></span>
              : <button type="button" className="hover:text-foreground hover:underline" onClick={() => onSelect(n.id)}><Upright>{n.label}</Upright></button>}
          </span>
        ))}
      </nav>
      <h2 className="font-display text-[24px] leading-tight"><Upright>{idea.label}</Upright></h2>
      <div className="flex flex-wrap gap-1.5">
        <span className="chip" style={{ color: idea.color }}>{idea.by}</span>
        <span className="chip">{idea.status === "dormant" ? "Resting, but kept" : "Growing"}</span>
        {idea.knot && <span className="chip">Knot</span>}
        {idea.parents.length > 1 && <span className="chip">Merged {idea.parents.length} lines</span>}
      </div>
      {idea.note && <p className="whitespace-pre-wrap">{idea.note}</p>}
      {idea.knot && idea.settled && <p className="border-l-2 border-ink pl-3 text-sm"><span className="eyebrow block">Settled</span>{idea.settled}</p>}
      {evidence.length > 0 && (
        <div className="grid gap-2 rounded border border-rule p-3 text-sm">
          <span className="eyebrow">Heard in</span>
          <ol className="grid gap-3">
            {evidence.map((e) => (
              <li key={e.id} className="grid gap-0.5" data-role={e.role}>
                <span className="smallcaps text-[13px] text-muted-foreground">{ROLE_LABEL[e.role as EvidenceRole] ?? e.role}</span>
                <blockquote className="hand text-[15px]">“{e.content}”</blockquote>
                <span className="text-xs">
                  <span style={{ color: e.speaker?.color }}>{e.speaker?.name ?? "Unattributed"}</span>
                  {" · "}{formatTime(e.sentAt, e.precision)}
                  {e.conversation && <> · {e.conversation.title} (happened {formatDate(e.conversation.happened_at)})</>}
                </span>
                {e.note && <span className="text-xs text-muted-foreground">{e.note}</span>}
                {e.conversation && <Link to="/g/$id/conversations/$cid" params={{ id: data.garden.id, cid: e.conversation.id }} hash={e.messageId} className="text-xs underline underline-offset-4">Read in conversation</Link>}
              </li>
            ))}
          </ol>
        </div>
      )}
      <dl className="grid grid-cols-[5.5em_1fr] gap-x-2 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Grew from</dt><dd className="flex flex-wrap gap-x-2">{links(idea.parents.map((p) => byKey.get(p)!).filter(Boolean), (p) => idea.natures[p.id])}</dd>
        <dt className="text-muted-foreground">Grew into</dt><dd className="flex flex-wrap gap-x-2">{links(children, (c) => c.natures[idea.id])}</dd>
      </dl>

      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-rule pt-3">
        <Button size="sm" onClick={() => setDialog("grow")}>Grow a branch</Button>
        <Button size="sm" variant="outline" onClick={() => setDialog("graft")} disabled={!idea.parents.length}>Graft a merge</Button>
        {idea.status === "growing"
          ? <Button size="sm" variant="outline" onClick={() => run(() => status({ data: { gardenId: data.garden.id, key: idea.id, status: "dormant" } }), "Resting now, still on the tree.")}>Let it rest</Button>
          : <Button size="sm" variant="outline" onClick={() => run(() => status({ data: { gardenId: data.garden.id, key: idea.id, status: "growing" } }), "Growing again.")}>Revive</Button>}
        {idea.knot
          ? <Button size="sm" variant="outline" onClick={() => setDialog("reopen")}>Reopen knot</Button>
          : <Button size="sm" variant="outline" onClick={() => setDialog("knot")}>Mark as knot</Button>}
        <Button size="sm" variant="ghost" onClick={() => setDialog("edit")}>Edit label and note</Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog("evidence")} disabled={!(data.convMessages ?? []).length}>Add evidence</Button>
      </div>

      {dialog === "grow" && <GrowDialog {...{ data, idea, currentStep, onSelect, run }} onClose={() => setDialog(null)} />}
      {dialog === "graft" && <GraftDialog {...{ data, ideas, idea, run }} onClose={() => setDialog(null)} />}
      {dialog === "knot" && <TextDialog title="Mark as knot" question="What is now settled?" hint="One sentence. Reopening a knot later needs a reason."
        action="Tie the knot" onClose={() => setDialog(null)}
        submit={(t) => run(() => knotFn({ data: { gardenId: data.garden.id, key: idea.id, settled: t } }), "Knot tied.")} />}
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
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
          <span className={"text-xs " + (len > MAX_LABEL ? "text-destructive" : "text-muted-foreground")}>{len}/{MAX_LABEL}{len > MAX_LABEL ? " — too long; put the rest in the note" : ""}</span>
        </div>
        <NatureSelect id="g-nature" value={f.nature} onChange={(v) => setF({ ...f, nature: v })} />
        <div className="grid gap-1.5"><Label htmlFor="g-note">Note</Label><Textarea id="g-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        <div className="grid gap-1.5">
          <Label htmlFor="g-person">Who said it?</Label>
          <select id="g-person" className={selectCls} value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="new">+ Add a person…</option>
          </select>
          {f.person === "new" && <Input aria-label="New person's name" required placeholder="Name" value={f.newPerson} onChange={(e) => setF({ ...f, newPerson: e.target.value })} />}
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
        <span className={"text-xs " + (len > MAX_LABEL ? "text-destructive" : "text-muted-foreground")}>{len}/{MAX_LABEL}</span>
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
