import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { checkOverlap, getAccessionContext, receiveBatch } from "@/lib/garden.functions";
import { prepare, resolveVoices, FORMAT_LABEL, type Draft, type Format, type PrepareInput, type PrepareOptions, type Voice } from "@/lib/intake";
import { takeHandOver } from "@/lib/intake/handover";
import { openFiles, type IncomingFile } from "@/lib/intake/files";
import { HIDDEN_NOTE, browserDateOrder, formatOffset, formatWhen, lineOwners } from "@/lib/intake/display";
import { toLines } from "@/lib/intake/util";
import { PERSON_COLORS } from "@/lib/stam/palette";
import { supabase } from "@/integrations/supabase/client";
import { AccessionStamp, stampLine } from "@/components/garden/AccessionStamp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";

const ctxQuery = (id: string) => queryOptions({ queryKey: ["accession", id], queryFn: () => getAccessionContext({ data: { gardenId: id } }) });

export const Route = createFileRoute("/_authenticated/g/$id_/accession")({
  head: () => ({
    meta: [
      { title: "Accession — Ramus" },
      { name: "description", content: "Bring a discussion into the archive: keep the original, prepare who spoke and when, never change the words." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Accession — Ramus" },
      { property: "og:description", content: "Keep the original. Prepare the structure. Never change the words." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { into?: string } => (typeof s["into"] === "string" && s["into"] ? { into: s["into"] } : {}),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(ctxQuery(params.id)),
  component: AccessionPage,
});

type Received = { input: PrepareInput; file: File | null; name: string | null; from: string | null };
const selectCls = "h-9 rounded-md border border-input bg-sheet px-2 text-sm";
const SELF = new Set<Format>(["chatgpt", "claude", "notes"]);

/** Open received files (zip, docx, text, json); the original kept is what the opener chose, never a whole export. */
async function readFiles(files: File[]): Promise<{ received: Received | null; rest: File[]; refusal: string | null }> {
  if (!files.length) return { received: null, rest: [], refusal: null };
  const incoming: IncomingFile[] = await Promise.all(files.map(async (f, i) => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    // PDFs are read with pdf.js, loaded only now; only the first file is opened right away
    let text: string | undefined;
    if (!import.meta.env.SSR && i === 0 && /\.pdf$/i.test(name)) { try { text = await (await import("@/lib/intake/pdf")).pdfText(bytes); } catch { text = undefined; } }
    return text === undefined ? { name, type: f.type, bytes } : { name, type: f.type, bytes, text };
  }));
  const o = openFiles(incoming);
  if (!o) return { received: null, rest: [], refusal: null };
  // several .json files are read together (Slack); otherwise the first file is opened and the others wait
  const rest = o.ok && o.input.files ? [] : files.slice(1);
  if (!o.ok) return { received: null, rest, refusal: o.reason };
  const keep = o.keep ? new File([new Uint8Array(o.keep.bytes)], o.keep.name, { type: o.keep.type }) : null;
  return { received: { input: o.input, file: keep, name: files[0]!.name, from: o.from }, rest, refusal: null };
}

function AccessionPage() {
  const { id } = Route.useParams();
  const { into } = Route.useSearch();
  const qc = useQueryClient();
  const { data: ctx } = useSuspenseQuery(ctxQuery(id));
  const keep = useServerFn(receiveBatch);
  const overlapFn = useServerFn(checkOverlap);
  const isMobile = useIsMobile();
  const [received, setReceived] = useState<Received | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [paste, setPaste] = useState("");
  const [options, setOptions] = useState<PrepareOptions>({});
  const [fields, setFields] = useState({ title: "", happened: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const [overlap, setOverlap] = useState<{ conversationId: string; kept: number }[]>([]);
  const [target, setTarget] = useState<string | "new">(into ?? "new");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pasted, setPasted] = useState(false);
  const [allVoices, setAllVoices] = useState(false);
  const [kept, setKept] = useState<null | { no: number; line: string; conversationId: string; added: number; already: number }>(null);
  const touched = useRef({ title: false, happened: false });

  // defaults from the browser: timezone and date order
  useEffect(() => {
    setOptions((o) => ({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", dateOrder: browserDateOrder(), ...o }));
    const h = takeHandOver(id);
    if (h?.files?.length) void receiveFiles(h.files);
    else if (h?.text) { receiveText(h.text); setPasted(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function reset() {
    setOptions((o) => ({ timeZone: o.timeZone, dateOrder: o.dateOrder }));
    touched.current = { title: false, happened: false };
    setConsent(false); setKept(null); setOverlap([]); setTarget(into ?? "new"); setRefusal(null);
  }
  function startOver() { reset(); setReceived(null); setPaste(""); setQueue([]); setPasted(false); }
  function receiveText(t: string) { reset(); setPaste(t); setReceived(t.trim() ? { input: { kind: "text", text: t }, file: null, name: null, from: null } : null); }
  async function receiveFiles(list: FileList | File[]) {
    reset();
    try {
      const { received, rest, refusal } = await readFiles([...list]);
      setReceived(received); setQueue(rest); setPaste(""); setRefusal(refusal);
    } catch (e) { setReceived(null); setRefusal(`This file could not be opened: ${(e as Error).message}`); }
  }

  const pctx = useMemo(() => ({ contributors: ctx.contributors, aliases: ctx.aliases, importerContributorId: ctx.importerContributorId, importerName: ctx.importerName }), [ctx]);
  const draft: Draft | null = useMemo(() => (received ? prepare(received.input, options, pctx) : null), [received, options, pctx]);

  useEffect(() => {
    if (!draft) return;
    if (!touched.current.title) setFields((f) => ({ ...f, title: draft.title ?? "" }));
    if (!touched.current.happened) setFields((f) => ({ ...f, happened: draft.happened ?? "" }));
  }, [draft]);

  const idsKey = draft ? draft.kept.map((m) => m.externalId).join(",") : "";
  useEffect(() => {
    if (!draft || !draft.kept.length) { setOverlap([]); return; }
    const t = setTimeout(() => {
      overlapFn({ data: { gardenId: id, externalIds: draft.kept.map((m) => m.externalId) } }).then((o) => {
        setOverlap(o);
        if (!into) setTarget(o[0] ? o[0].conversationId : "new");
      }).catch(() => setOverlap([]));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, id]);

  const voices = draft ? resolveVoices(draft, options) : new Map();
  const people = ctx.contributors;
  const colorOf = (label: string | null) => {
    const v = label === null ? (draft?.format === "notes" ? voices.get("") : undefined) : voices.get(label);
    if (!v || v.type === "none") return "var(--rule)";
    if (v.type === "person") return people.find((p) => p.id === v.id)?.color ?? "var(--rule)";
    const i = draft!.speakers.findIndex((s) => s.label === label);
    return PERSON_COLORS[(people.length + Math.max(0, i)) % PERSON_COLORS.length]!;
  };
  const nameOf = (label: string | null) => {
    const key = label ?? (draft?.format === "notes" ? "" : null);
    const v = key === null ? undefined : voices.get(key);
    if (!v) return "Unattributed";
    if (v.type === "person") return people.find((p) => p.id === v.id)?.name ?? label ?? "";
    if (v.type === "new") return v.name;
    if (v.type === "anon") return v.anonName ?? "Voice";
    return `${label} (not a person)`;
  };
  const setVoice = (label: string, v: Voice) => setOptions((o) => ({ ...o, voices: { ...o.voices, [label]: v } }));

  async function submit() {
    if (!draft || !received) return;
    if (!consent) { toast.error(SELF.has(draft.format) ? "Confirm that this is your own conversation or notes." : "Confirm that everyone agreed to have it recorded."); return; }
    setBusy(true);
    try {
      let originalFilePath: string | null = null;
      const uploadable = received.file && !options.mask && !["chatgpt", "claude", "slack"].includes(draft.format);
      if (uploadable) {
        const path = `${id}/${crypto.randomUUID()}-${received.file!.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await supabase.storage.from("conversation-originals").upload(path, received.file!);
        if (up.error) throw new Error("Could not keep the original file: " + up.error.message);
        originalFilePath = path;
      }
      const json = ["chatgpt", "claude", "slack"].includes(draft.format);
      const r = await keep({ data: {
        gardenId: id, conversationId: target === "new" ? null : target,
        newConversation: target === "new" ? { title: fields.title, happenedAt: fields.happened || null } : null,
        input: { kind: json ? "json" : "text", text: draft.sendable, fileName: received.name ?? undefined },
        options, consent, originalFilePath,
      } });
      setKept({ no: r.accessionNo, conversationId: r.conversationId, added: r.added, already: r.alreadyKept, line: stampLine({ receivedAt: new Date().toISOString(), format: r.format, voices: r.voices, messages: r.messages }) });
      qc.invalidateQueries({ queryKey: ["garden", id] });
      qc.invalidateQueries({ queryKey: ["accession", id] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  if (kept) {
    return (
      <main className="mx-auto grid max-w-3xl justify-items-center gap-5 px-5 py-16 text-center">
        <p className="eyebrow">Kept in the archive</p>
        <AccessionStamp no={kept.no} line={kept.line} />
        <p className="text-[15px]">{kept.added === 0 ? "0 new messages: everything here was already kept." : `${kept.added} new message${kept.added === 1 ? "" : "s"}`}{kept.already > 0 && kept.added > 0 ? ` · ${kept.already} already kept` : ""}</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/g/$id/conversations/$cid" params={{ id, cid: kept.conversationId }} className="underline underline-offset-4">Read the conversation</Link>
          <Link to="/g/$id" params={{ id }} search={{ idea: undefined }} className="underline underline-offset-4">Back to the garden</Link>
          {queue.length > 0 && <button type="button" className="underline underline-offset-4" onClick={() => { const [n, ...rest] = queue; reset(); setQueue(rest); void readFiles([n!]).then((x) => { setReceived(x.received); setRefusal(x.refusal); }); }}>Bring in the next file: {queue[0]!.name}</button>}
        </div>
      </main>
    );
  }

  const over = overlap.find((o) => o.conversationId === into) ?? overlap[0];
  const overTitle = over ? ctx.conversations.find((c) => c.id === over.conversationId)?.title : null;
  const intoTitle = into ? ctx.conversations.find((c) => c.id === into)?.title ?? null : null;
  const remaining = over ? draft!.kept.length - over.kept : 0;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-5 py-8">
      <div>
        <Link to="/g/$id" params={{ id }} search={{ idea: undefined }} className="eyebrow hover:underline">← {ctx.garden.title}</Link>
        <h1 className="mt-2 font-display text-[40px] leading-[1.1]">Accession</h1>
        <p className="hand mt-1 text-[18px]">Keep the original. Prepare the structure. Never change the words.</p>
      </div>

      <section aria-label="Receive" className="grid gap-2">
        {received && (received.name || pasted) ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[15px]">
            <span className="eyebrow">Received</span>
            <span>{received.name ?? `pasted text, ${paste.split(/\r?\n/).filter((l) => l.trim()).length} lines`}</span>
            <button type="button" className="text-sm underline underline-offset-4" onClick={startOver}>Start over</button>
            {queue.length > 0 && <span className="text-sm text-muted-foreground">Next: {queue.map((f) => f.name).join(", ")}</span>}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-ink/40 bg-sheet p-3"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) void receiveFiles(e.dataTransfer.files); }}>
            <textarea aria-label="Paste anything" className="min-h-[160px] w-full resize-y bg-transparent text-[15px] outline-none"
              placeholder="Paste or drop anything here" value={paste}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void receiveFiles([...e.clipboardData.files]); } else setPasted(true); }}
              onChange={(e) => receiveText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer text-sm underline underline-offset-4">or choose a file<input type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files) void receiveFiles(e.target.files); e.target.value = ""; }} /></label>
              {(received || refusal) && <button type="button" className="text-sm underline underline-offset-4" onClick={startOver}>Start over</button>}
            </div>
          </div>
        )}
        {received?.from && received.from !== received.name && <p className="hand text-[16px]">{received.from}</p>}
        {refusal && <p role="alert" className="rounded-md border border-rule bg-sheet px-3 py-2 text-[15px]">{refusal}</p>}
      </section>

      {draft && (
        <section aria-label="Prepare" className="grid gap-6">
          <div className="rounded-md border border-rule bg-sheet p-4">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[15px]">
              <span>Read as</span>
              <select aria-label="Read as" className="border-0 border-b border-dotted border-ink bg-transparent text-[15px]" value={draft.format}
                onChange={(e) => setOptions((o) => ({ ...o, readAs: e.target.value as Format }))} disabled={!draft.readAs.some((r) => ["whatsapp", "vtt", "srt", "transcript", "lines", "notes"].includes(r.format))}>
                {(draft.readAs.some((r) => r.format === draft.format) ? draft.readAs : [{ format: draft.format, confidence: 1 }, ...draft.readAs]).map((r) => <option key={r.format} value={r.format}>{FORMAT_LABEL[r.format]}</option>)}
                {["whatsapp", "vtt", "srt", "transcript", "lines", "notes"].includes(draft.format) && (["lines", "notes"] as Format[]).filter((f) => !draft.readAs.some((r) => r.format === f)).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
              </select>
              <span>· {draft.speakers.length} voice{draft.speakers.length === 1 ? "" : "s"} · {draft.kept.length} message{draft.kept.length === 1 ? "" : "s"}</span>
              {draft.report.firstAt && <span>· {formatWhen(draft.report.firstAt, options.timeZone)} – {formatWhen(draft.report.lastAt, options.timeZone)}</span>}
              <span>· {Object.values(draft.report.setAside).reduce((a, b) => a + b, 0)} lines set aside</span>
              {draft.report.otherBranches > 0 && <span>· {draft.report.otherBranches} other branches kept in the original</span>}
              <span>· times read as {options.timeZone}</span>
              {draft.report.recordingStated && (
                <span className="flex items-baseline gap-1">· recording started
                  <input type="datetime-local" step={1} aria-label="Recording started at" className="border-0 border-b border-dotted border-ink bg-transparent text-[15px]"
                    value={draft.report.recordingStated} onChange={(e) => setOptions((o) => ({ ...o, recordingStart: e.target.value || null }))} />
                  <span className="hand">as the transcript states</span>
                </span>
              )}
            </div>
            <div className="rule-dotted mt-3 pt-2 text-sm text-muted-foreground">Parser {draft.report.parser}{draft.report.masked.phone + draft.report.masked.email > 0 ? ` · masked ${draft.report.masked.phone} phone, ${draft.report.masked.email} email` : ""}</div>
          </div>

          <LookFirst draft={draft} options={options} setOptions={setOptions} />

          {draft.speakers.length > 0 && (
            <div className="grid gap-2">
              <h2 className="eyebrow">Voices · {draft.speakers.length}</h2>
              {(allVoices ? draft.speakers : draft.speakers.slice(0, 6)).map((s) => {
                const v = options.voices?.[s.label] ?? s.suggested;
                const sel = v.type === "person" ? v.id : v.type;
                return (
                  <div key={s.label} className="grid gap-2 rounded border border-rule p-3 md:grid-cols-[14em_1fr_18em]">
                    <div><span className="font-medium" style={{ color: colorOf(s.label || null) }}>{s.label || "Whose notes"}</span> <span className="smallcaps text-[13px] text-muted-foreground">{s.count}</span>{s.remembered && <span className="hand ml-2">remembered</span>}</div>
                    <div className="grid gap-0.5 text-sm text-muted-foreground">{s.samples.map((x, i) => <span key={i} className="truncate">“{x}”</span>)}</div>
                    <div className="flex gap-2">
                      <select aria-label={`Who is ${s.label || "the author"}`} className={selectCls + " min-w-0 flex-1"} value={sel}
                        onChange={(e) => { const x = e.target.value; setVoice(s.label, x === "new" ? { type: "new", name: s.label.replace(/^~\s*/, "").trim() || ctx.importerName } : x === "anon" ? { type: "anon" } : x === "none" ? { type: "none" } : { type: "person", id: x }); }}>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        <option value="new">A new person…</option>
                        <option value="anon">Anonymous</option>
                        <option value="none">Not a person</option>
                      </select>
                      {v.type === "new" && <Input aria-label={`New name for ${s.label}`} className="w-36" value={v.name} onChange={(e) => setVoice(s.label, { ...v, name: e.target.value })} />}
                    </div>
                  </div>
                );
              })}
              {draft.speakers.length > 6 && !allVoices && <button type="button" className="justify-self-start text-sm underline underline-offset-4" onClick={() => setAllVoices(true)}>Show all {draft.speakers.length} voices</button>}
            </div>
          )}

          {isMobile ? (
            <Tabs defaultValue="prepared">
              <TabsList><TabsTrigger value="original">Original</TabsTrigger><TabsTrigger value="prepared">Prepared</TabsTrigger></TabsList>
              <TabsContent value="original"><Original draft={draft} lit={lit} setLit={setLit} /></TabsContent>
              <TabsContent value="prepared"><Prepared draft={draft} lit={lit} setLit={setLit} colorOf={colorOf} nameOf={nameOf} tz={options.timeZone} /></TabsContent>
            </Tabs>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div><h2 className="eyebrow mb-2">Original</h2><Original draft={draft} lit={lit} setLit={setLit} /></div>
              <div><h2 className="eyebrow mb-2">Prepared</h2><Prepared draft={draft} lit={lit} setLit={setLit} colorOf={colorOf} nameOf={nameOf} tz={options.timeZone} /></div>
            </div>
          )}

          <div className="grid gap-3 rounded-md border border-rule bg-sheet p-4">
            {(intoTitle || (over && overTitle)) && (
              <div className="grid gap-1 text-[15px]">
                {intoTitle && into && <label className="flex items-center gap-2"><input type="radio" name="target" checked={target === into} onChange={() => setTarget(into)} />Add to “{intoTitle}”{over?.conversationId === into ? `: ${remaining} new, ${over.kept} already kept` : ""}</label>}
                {over && overTitle && over.conversationId !== into && <label className="flex items-center gap-2"><input type="radio" name="target" checked={target === over.conversationId} onChange={() => setTarget(over.conversationId)} />Add to “{overTitle}”: {remaining} new, {over.kept} already kept</label>}
                <label className="flex items-center gap-2"><input type="radio" name="target" checked={target === "new"} onChange={() => setTarget("new")} />Keep as a new conversation</label>
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              {target === "new" && <div className="grid gap-1.5"><Label htmlFor="a-t">Title</Label><Input id="a-t" value={fields.title} onChange={(e) => { touched.current.title = true; setFields({ ...fields, title: e.target.value }); }} /></div>}
              {target === "new" && <div className="grid gap-1.5"><Label htmlFor="a-h">Happened</Label><Input id="a-h" type="date" value={fields.happened} onChange={(e) => { touched.current.happened = true; setFields({ ...fields, happened: e.target.value }); }} /></div>}
              <div className="grid gap-1.5"><Label htmlFor="a-z">Timezone</Label><Input id="a-z" list="tzs" value={options.timeZone ?? ""} onChange={(e) => setOptions((o) => ({ ...o, timeZone: e.target.value }))} /></div>
            </div>
            <datalist id="tzs">{(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []).map((z) => <option key={z} value={z} />)}</datalist>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" aria-label="Consent" />
              <span>{SELF.has(draft.format) ? "This is my own conversation / my own notes." : "Everyone in this conversation agreed to have it recorded here."}</span>
            </label>
            <div><Button onClick={submit} disabled={!consent || busy || !draft.kept.length}>Keep in the archive</Button></div>
          </div>
        </section>
      )}
    </main>
  );
}

function LookFirst({ draft, options, setOptions }: { draft: Draft; options: PrepareOptions; setOptions: React.Dispatch<React.SetStateAction<PrepareOptions>> }) {
  const qs = draft.questions.slice(0, 5);
  const toggle = (key: "arePeople" | "notAPerson", label: string) => setOptions((o) => ({ ...o, arePeople: (o.arePeople ?? []).filter((x) => x !== label), notAPerson: (o.notAPerson ?? []).filter((x) => x !== label), [key]: [...(o[key] ?? []).filter((x) => x !== label), label] }));
  return (
    <div className="grid gap-2">
      <h2 className="eyebrow">Look at these first</h2>
      {!qs.length && <p className="hand text-[18px]">Nothing needs your eye.</p>}
      <ol className="grid gap-2">
        {qs.map((q, i) => (
          <li key={q.kind + i} className="grid gap-2 rounded border border-rule p-3 text-[15px]">
            <span>{q.text}</span>
            {q.kind === "date-order" && (
              <div className="flex flex-wrap gap-4">
                {(["DMY", "MDY"] as const).map((o) => <label key={o} className="flex items-center gap-2"><input type="radio" name="dateorder" checked={(options.dateOrder ?? "DMY") === o} onChange={() => setOptions((x) => ({ ...x, dateOrder: o }))} />{q.sample[o]}</label>)}
              </div>
            )}
            {q.kind === "not-a-person" && (
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name={"np" + q.label} onChange={() => toggle("arePeople", q.label)} />Yes, a person</label>
                <label className="flex items-center gap-2"><input type="radio" name={"np" + q.label} defaultChecked onChange={() => toggle("notAPerson", q.label)} />No, its lines join the previous message</label>
              </div>
            )}
            {q.kind === "segments" && (
              <div className="grid gap-1">
                {draft.segments.map((s) => {
                  const on = !options.segments || options.segments.includes(s.index);
                  return <label key={s.index} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={() => setOptions((o) => {
                    const cur = o.segments ?? draft.segments.map((x) => x.index);
                    return { ...o, segments: on ? cur.filter((x) => x !== s.index) : [...cur, s.index].sort((a, b) => a - b) };
                  })} />{formatWhen(s.from, options.timeZone)} – {formatWhen(s.to, options.timeZone)} · {s.count} messages</label>;
                })}
              </div>
            )}
            {q.kind === "pick-conversations" && null}
            {q.kind === "recording-start" && <Input type="datetime-local" step={1} aria-label="Recording started at" className="w-64" value={options.recordingStart ?? ""} onChange={(e) => setOptions((o) => ({ ...o, recordingStart: e.target.value || null }))} />}
            {q.kind === "conversation-date" && <Input type="date" aria-label="Conversation date" className="w-48" value={options.conversationDate ?? ""} onChange={(e) => setOptions((o) => ({ ...o, conversationDate: e.target.value || null }))} />}
            {q.kind === "privacy" && (
              <div className="grid gap-1">
                <Button size="sm" variant="outline" className="w-fit" onClick={() => setOptions((o) => ({ ...o, mask: "all" }))}>Mask before keeping</Button>
                {q.matches.map((m) => (
                  <label key={m.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Array.isArray(options.mask) && options.mask.includes(m.value)}
                    onChange={(e) => setOptions((o) => { const cur = Array.isArray(o.mask) ? o.mask : []; const next = e.target.checked ? [...cur, m.value] : cur.filter((x) => x !== m.value); return { ...o, mask: next.length ? next : undefined }; })} />{m.kind}: {m.value}</label>
                ))}
              </div>
            )}
            {q.kind === "unknown-voice" && <span className="hand">Choose under Voices below.</span>}
          </li>
        ))}
      </ol>
      {options.mask && <p className="hand">Masked before keeping{options.mask === "all" ? ": all phone numbers and emails" : ""}. The original file will not be uploaded. <button type="button" className="underline" onClick={() => setOptions((o) => ({ ...o, mask: undefined }))}>Undo</button></p>}
      {draft.conversations.length > 1 && (
        <div className="grid gap-1 rounded border border-rule p-3">
          <span className="eyebrow">Conversations in this export</span>
          {draft.conversations.map((c) => {
            const on = options.conversations?.includes(c.id) ?? false;
            return <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} aria-label={c.title}
              onChange={() => setOptions((o) => ({ ...o, conversations: on ? (o.conversations ?? []).filter((x) => x !== c.id) : [...(o.conversations ?? []), c.id] }))} />{c.title} <span className="smallcaps text-[13px] text-muted-foreground">{c.date ? c.date.slice(0, 10) : "time unknown"} · {c.count}</span></label>;
          })}
        </div>
      )}
    </div>
  );
}

/** Highlight the rows of one message without re-rendering thousands of rows on every hover. */
function useLit(box: React.RefObject<HTMLElement | null>, lit: number | null, cls: string) {
  useEffect(() => {
    const el = box.current;
    if (!el || lit == null) return;
    const rows = [...el.querySelectorAll<HTMLElement>(`[data-o="${lit}"]`)];
    rows.forEach((r) => r.classList.add(...cls.split(" ")));
    rows[0]?.scrollIntoView({ block: "nearest" });
    return () => rows.forEach((r) => r.classList.remove(...cls.split(" ")));
  }, [box, lit, cls]);
}

function Original({ draft, lit, setLit }: { draft: Draft; lit: number | null; setLit: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useLit(box, lit, "lit");
  const body = useMemo(() => {
    if (draft.received) {
      return draft.received.map((r, i) => {
        const m = draft.messages[i];
        return (
          <div key={i} data-o={i} className={m?.hidden ? "aside" : undefined} onMouseEnter={() => setLit(i)} onMouseLeave={() => setLit(null)}>
            <span className="ln mr-2">{r.role}</span><span className="whitespace-pre-wrap">{r.text}</span>
            {m?.hidden && <span className="hand ml-2 text-sm">{HIDDEN_NOTE[m.hidden]}</span>}
          </div>
        );
      });
    }
    const all = toLines(draft.raw);
    const lines = all.slice(0, 4000);
    const owners = lineOwners(lines, draft.messages);
    return (
      <>
        {lines.map((l, n) => {
          const i = owners[n]!;
          const m = i >= 0 ? draft.messages[i] : undefined;
          const first = i >= 0 && owners[n - 1] !== i;
          return (
            <div key={n} data-o={i >= 0 ? i : undefined} tabIndex={first ? 0 : -1}
              className={"grid grid-cols-[2.5em_1fr]" + (m?.hidden || (i < 0 && l.text.trim()) ? " aside" : "")}
              onMouseEnter={() => i >= 0 && setLit(i)} onMouseLeave={() => setLit(null)} onFocus={() => i >= 0 && setLit(i)}>
              <span className="ln pt-1 text-right pr-2">{n + 1}</span>
              <span className="whitespace-pre-wrap break-words">{l.text || " "}{first && m?.hidden && <span className="hand ml-2 text-sm">{HIDDEN_NOTE[m.hidden]}</span>}</span>
            </div>
          );
        })}
        {all.length > 4000 && <p className="hand">… the rest of the original is kept in full.</p>}
      </>
    );
  }, [draft, setLit]);
  return <div ref={box} className="original-sample max-h-[60vh] overflow-y-auto rounded-md border border-rule bg-sheet p-3 text-[15px]">{body}</div>;
}

function Prepared({ draft, lit, setLit, colorOf, nameOf, tz }: { draft: Draft; lit: number | null; setLit: (i: number | null) => void; colorOf: (l: string | null) => string; nameOf: (l: string | null) => string; tz: string | undefined }) {
  const box = useRef<HTMLOListElement>(null);
  useLit(box, lit, "lit-card");
  const keptSet = new Set(draft.kept);
  return (
    <ol ref={box} className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
      {draft.messages.slice(0, 2000).map((m, i) => {
        if (!keptSet.has(m)) return null;
        return (
          <li key={m.externalId} data-o={i} tabIndex={0} onMouseEnter={() => setLit(i)} onMouseLeave={() => setLit(null)} onFocus={() => setLit(i)} onBlur={() => setLit(null)}
            className={"rounded-md border border-rule bg-sheet p-3" + (m.hidden ? " opacity-50" : "")}
            style={{ borderLeftWidth: 4, borderLeftColor: colorOf(m.speakerLabel) }}>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-medium" style={{ color: colorOf(m.speakerLabel) }}>{nameOf(m.speakerLabel)}</span>
              <span className="smallcaps text-[13px] text-muted-foreground">{m.sentAt ? formatWhen(m.sentAt, tz) : m.offsetMs != null ? formatOffset(m.offsetMs) : "time unknown"}</span>
              {m.hidden && <span className="hand text-sm">{HIDDEN_NOTE[m.hidden]}</span>}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[15px]">{m.content}</p>
          </li>
        );
      })}
      {draft.messages.length > 2000 && <li className="hand">… and {draft.messages.length - 2000} more.</li>}
    </ol>
  );
}
