import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { openFiles, type IncomingFile } from "@/lib/intake/files";
import { KIND_LABEL, gardenTitle, prepareAuto, timeLine, type Auto, type AutoExtra } from "@/lib/intake/auto";
import { browserDateOrder, formatWhen } from "@/lib/intake/display";
import type { PrepareContext, PrepareInput } from "@/lib/intake";
import { shorten } from "@/lib/gardener/harvest";
import { checkOverlap, createGarden, getAccessionContext, receiveBatch, whoAmI } from "@/lib/garden.functions";
import { supabase } from "@/integrations/supabase/client";
import { grownLine, useGrow, type GrowProgress } from "./Gardener";
import { Upright } from "@/components/epigraph/Epigraph";

/**
 * One window for bringing words in: drop or paste everything that belongs together, then grow the tree.
 * Nothing to choose and nothing to confirm but "that's everything": Ramus reads each item, puts them in the
 * order things were said, keeps them, and the gardener grows the tree. Later, the same window adds more.
 */
export type Incoming = { text?: string; files?: File[] };
export type BringInTarget =
  | { kind: "new" }
  | {
      kind: "more"; gardenId: string;
      /** nothing has been said in the garden yet (only changes the wording) */
      fresh: boolean;
      /** the idea the discussion goes back to, chosen on the tree */
      resumeFrom?: { key: string; label: string } | null | undefined;
    };

type Item = {
  id: string; name: string; fileName: string | null; input: PrepareInput | null; file: File | null;
  error: string | null; opening: boolean; extra: AutoExtra;
  /** set once it is kept, so trying again never keeps it twice */
  kept?: { batchId: string | null };
};
type Phase =
  | { kind: "collecting" }
  | { kind: "keeping"; n: number; of: number }
  | { kind: "reading"; progress: GrowProgress }
  | { kind: "failed"; message: string };

const JSON_FORMATS = new Set(["chatgpt", "claude", "slack"]);
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const env = () => ({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", dateOrder: browserDateOrder() });

async function toIncoming(f: File): Promise<IncomingFile> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const name = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  // PDFs are read with pdf.js, loaded only when one arrives (never on the server)
  if (!import.meta.env.SSR && /\.pdf$/i.test(name)) {
    try { return { name, type: f.type, bytes, text: await (await import("@/lib/intake/pdf")).pdfText(bytes) }; } catch { /* read as bytes below */ }
  }
  return { name, type: f.type, bytes };
}

export function BringInWindow({ open, onOpenChange, target, incoming, onIncomingTaken, onGrown, onClearResume }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: BringInTarget;
  /** words pasted or dropped on the page; taken into the list when the window opens */
  incoming?: Incoming | null | undefined;
  onIncomingTaken?: (() => void) | undefined;
  onGrown: (gardenId: string) => void;
  onClearResume?: (() => void) | undefined;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [typed, setTyped] = useState("");
  // what the people want the gardener to know, in their words (only when adding to a tree)
  const [told, setTold] = useState("");
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "collecting" });
  const [ctx, setCtx] = useState<PrepareContext>({ contributors: [], aliases: [], importerContributorId: null, importerName: "Me" });
  const [plantedId, setPlantedId] = useState<string | null>(null);
  // parts the gardener has already read, so trying again picks up where it stopped
  const [partsDone, setPartsDone] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const who = useServerFn(whoAmI);
  const accessionCtx = useServerFn(getAccessionContext);
  const create = useServerFn(createGarden);
  const keep = useServerFn(receiveBatch);
  const overlap = useServerFn(checkOverlap);
  const gardenId = target.kind === "more" ? target.gardenId : plantedId;
  const grow = useGrow();

  // who is bringing it in, and who is already in the garden, so voices are recognised as they will be when kept
  useEffect(() => {
    if (!open) return;
    if (target.kind === "more") accessionCtx({ data: { gardenId: target.gardenId } }).then((c) => setCtx({ contributors: c.contributors, aliases: c.aliases, importerContributorId: c.importerContributorId, importerName: c.importerName })).catch(() => {});
    else who().then((w) => setCtx((c) => ({ ...c, importerName: w.name }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target.kind === "more" ? target.gardenId : ""]);

  useEffect(() => {
    if (!open || !incoming) return;
    if (incoming.files?.length) void addFiles(incoming.files);
    else if (incoming.text) addText(incoming.text);
    onIncomingTaken?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, incoming]);

  function addText(t: string) {
    if (!t.trim()) return;
    const lines = t.split(/\r?\n/).filter((l) => l.trim()).length;
    setItems((xs) => [...xs, { id: uid(), name: `Pasted text · ${lines} line${lines === 1 ? "" : "s"}`, fileName: null, input: { kind: "text", text: t }, file: null, error: null, opening: false, extra: {} }]);
  }
  async function addFiles(files: File[]) {
    // a folder of .json files is one Slack export; anything else is one item per file
    const groups = files.length > 1 && files.every((f) => /\.json$/i.test(f.name)) ? [files] : files.map((f) => [f]);
    for (const g of groups) {
      const id = uid();
      setItems((xs) => [...xs, { id, name: g.length > 1 ? `${g.length} files` : g[0]!.name, fileName: g[0]!.name, input: null, file: null, error: null, opening: true, extra: {} }]);
      let patch: Partial<Item>;
      try {
        const o = openFiles(await Promise.all(g.map(toIncoming)));
        if (!o) patch = { error: "Nothing could be read from this." };
        else if (!o.ok) patch = { error: o.reason };
        else patch = { input: o.input, file: o.keep ? new File([new Uint8Array(o.keep.bytes)], o.keep.name, { type: o.keep.type }) : null };
      } catch (e) { patch = { error: `This could not be opened: ${(e as Error).message}` }; }
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch, opening: false } : x)));
    }
  }
  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  const setExtra = (id: string, extra: AutoExtra) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, extra: { ...x.extra, ...extra } } : x)));

  // every item prepared the way the server will prepare it
  const prepared = useMemo(() => {
    const e = env();
    const out = new Map<string, Auto | string>();
    for (const it of items) {
      if (!it.input) continue;
      try { out.set(it.id, prepareAuto(it.input, e, ctx, it.extra)); } catch (err) { out.set(it.id, (err as Error).message); }
    }
    return out;
  }, [items, ctx]);
  const ready = items.filter((it) => { const a = prepared.get(it.id); return typeof a === "object" && a.draft.kept.some((m) => !m.hidden); });
  const busy = phase.kind === "keeping" || phase.kind === "reading";

  function reset() { setItems([]); setTyped(""); setTold(""); setPhase({ kind: "collecting" }); setPlantedId(null); setPartsDone(0); }

  async function go() {
    if (!ready.length) return;
    try {
      let gid = gardenId;
      let nameGarden = false;
      if (!gid) {
        const t = gardenTitle(ready[0]!.fileName, (prepared.get(ready[0]!.id) as Auto).draft);
        const r = await create({ data: { title: t.title, rootLabel: shorten(t.title), rootNote: "", person: "", asMe: true } });
        gid = r.gardenId; nameGarden = t.placeholder;
        setPlantedId(gid);
      }
      // only a root Ramus planted as a placeholder is named by the gardener; a question someone wrote stays theirs
      const nameRoot = target.kind === "new";
      const batchIds: string[] = items.flatMap((it) => (it.kept?.batchId ? [it.kept.batchId] : []));
      const todo = ready.filter((it) => !it.kept);
      for (const [i, it] of todo.entries()) {
        setPhase({ kind: "keeping", n: i + 1, of: todo.length });
        const { draft, options } = prepared.get(it.id) as Auto;
        // words already kept in this garden go into the same conversation, so nothing is kept twice
        let conversationId: string | null = null;
        if (target.kind === "more") {
          const o = await overlap({ data: { gardenId: gid, externalIds: draft.kept.map((m) => m.externalId) } }).catch(() => []);
          if (o[0] && o[0].kept >= draft.kept.length / 2) conversationId = o[0].conversationId;
        }
        let originalFilePath: string | null = null;
        if (it.file && !options.mask && !JSON_FORMATS.has(draft.format)) {
          const path = `${gid}/${uid()}-${it.file.name.replace(/[^\w.-]+/g, "_")}`;
          const up = await supabase.storage.from("conversation-originals").upload(path, it.file);
          if (!up.error) originalFilePath = path;
        }
        const named = gardenTitle(it.fileName, draft);
        const title = named.placeholder ? `${KIND_LABEL[draft.format]}${draft.happened ? `, ${draft.happened}` : ""}` : named.title;
        const r = await keep({ data: {
          gardenId: gid, conversationId, newConversation: conversationId ? null : { title, happenedAt: draft.happened },
          input: { kind: JSON_FORMATS.has(draft.format) ? "json" : "text", text: draft.sendable, fileName: it.fileName ?? undefined },
          options, consent: true, originalFilePath,
        } });
        const batchId = r.added > 0 ? r.batchId : null;
        if (batchId) batchIds.push(batchId);
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, kept: { batchId } } : x)));
      }
      if (!batchIds.length) { toast("Everything here was already kept."); reset(); onOpenChange(false); onGrown(gid); return; }
      setPhase({ kind: "reading", progress: { part: 1, of: 1 } });
      const resumeFrom = target.kind === "more" ? target.resumeFrom?.key ?? null : null;
      const g = await grow(gid, { batchIds }, { nameRoot, nameGarden, resumeFrom, told: told.trim() || null, from: partsDone, onProgress: (progress) => setPhase({ kind: "reading", progress }), onPartDone: setPartsDone });
      toast.success(grownLine(g.grown));
      reset();
      onOpenChange(false);
      onGrown(gid);
    } catch (e) {
      setPhase({ kind: "failed", message: (e as Error).message });
    }
  }

  const keptAll = items.length > 0 && ready.every((it) => it.kept);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {target.kind === "more" && target.resumeFrom ? <>Grow again from “<Upright>{target.resumeFrom.label}</Upright>”</> : target.kind === "more" && !target.fresh ? "Add more to this tree" : "Bring in the conversations"}
          </DialogTitle>
          <DialogDescription className="hand text-[16px]">
            Drop or paste everything that belongs together: chats, meeting notes, transcripts, any file. Ramus puts them in the order things were said.
          </DialogDescription>
        </DialogHeader>

        {/* once something is kept, finish this reading first; more can be added right after */}
        {!busy && !items.some((it) => it.kept) && (
          <div
            className={"grid gap-2  border border-dashed bg-sheet p-3 transition-colors " + (over ? "border-ink" : "border-ink/40")}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const files = [...e.dataTransfer.files]; if (files.length) void addFiles(files); }}>
            <textarea autoFocus aria-label="Paste anything" placeholder={items.length ? "Paste or drop more here" : "Paste or drop anything here"}
              className={"w-full resize-y bg-transparent text-[15px] outline-none " + (items.length ? "min-h-[64px]" : "min-h-[160px]")}
              value={typed} onChange={(e) => setTyped(e.target.value)}
              onPaste={(e) => {
                const files = [...e.clipboardData.files];
                const text = e.clipboardData.getData("text/plain");
                if (files.length) { e.preventDefault(); void addFiles(files); }
                else if (text.trim() && !typed.trim()) { e.preventDefault(); addText(text); }
              }} />
            <div className="flex items-center gap-3">
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => picker.current?.click()}>or choose files</button>
              {typed.trim() && <Button size="sm" variant="outline" className="ml-auto" onClick={() => { addText(typed); setTyped(""); }}>Add</Button>}
              <input ref={picker} type="file" multiple className="sr-only" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) void addFiles(files); }} />
            </div>
          </div>
        )}

        {target.kind === "more" && !target.fresh && !busy && (
          <div className="grid gap-1.5">
            {target.resumeFrom && (
              <p className="flex items-baseline gap-2 text-[15px]">
                <span className="hand">The discussion picks up again from “<Upright>{target.resumeFrom.label}</Upright>”; new ideas grow from there.</span>
                {onClearResume && <button type="button" className="text-xs text-muted-foreground underline underline-offset-4" onClick={onClearResume}>not from there</button>}
              </p>
            )}
            <input aria-label="Anything to tell the gardener" value={told} onChange={(e) => setTold(e.target.value)} maxLength={600}
              placeholder="Anything to tell the gardener? e.g. “Product says the cost won’t come down, so we went back to the fabric.”"
              className="h-9 w-full  border border-rule bg-transparent px-3 text-[15px] outline-none focus:border-ink" />
          </div>
        )}

        {items.length > 0 && (
          <ol aria-label="Brought in" className="grid gap-2">
            {items.map((it) => <Row key={it.id} item={it} auto={prepared.get(it.id)} locked={busy || !!it.kept} onRemove={() => remove(it.id)} onExtra={(x) => setExtra(it.id, x)} />)}
          </ol>
        )}

        {phase.kind === "keeping" && <p role="status" className="hand text-[16px]">Keeping {phase.of > 1 ? `${phase.n} of ${phase.of}` : "it"} in the archive…</p>}
        {phase.kind === "reading" && <p role="status" className="hand text-[16px]">The gardener is reading{phase.progress.of > 1 ? ` (part ${phase.progress.part} of ${phase.progress.of})` : ""}… It traces who raised what, in the order it was said.</p>}
        {phase.kind === "failed" && (
          <p role="alert" className="text-[15px]">
            {phase.message}{" "}
            {keptAll && <span className="text-muted-foreground">What you brought in is kept; only the gardener’s reading is missing.</span>}
          </p>
        )}

        {!busy && (
          <div className="grid gap-2 border-t border-rule pt-3">
            <Button disabled={!ready.length || items.some((it) => it.opening)} onClick={go}>
              {phase.kind === "failed" ? (keptAll ? "Let the gardener try again" : "Try again") : target.kind === "more" && !target.fresh ? "Add to the tree" : "That’s everything — grow the tree"}
            </Button>
            {phase.kind === "failed" && keptAll && gardenId && (
              <button type="button" className="text-sm underline underline-offset-4" onClick={() => { const g = gardenId; reset(); onOpenChange(false); onGrown(g); }}>Go to the garden without it</button>
            )}
            <p className="text-xs text-muted-foreground">These conversations are kept in this garden, word for word. Bring in only conversations whose people agreed to that.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ item, auto, locked, onRemove, onExtra }: { item: Item; auto: Auto | string | undefined; locked: boolean; onRemove: () => void; onExtra: (x: AutoExtra) => void }) {
  const a = typeof auto === "object" ? auto : null;
  const problem = item.error ?? (typeof auto === "string" ? auto : a && !a.draft.kept.some((m) => !m.hidden) ? "No messages were found in this." : null);
  const t = a ? timeLine(a.draft) : null;
  const words = a ? a.draft.kept.filter((m) => !m.hidden).length : 0;
  return (
    <li className={"grid gap-1  border bg-sheet px-3 py-2 text-[15px] " + (problem ? "border-rule opacity-70" : "border-rule")}>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {item.kept && <span className="smallcaps text-[13px] text-muted-foreground">kept</span>}
        {!locked && <button type="button" aria-label={`Remove ${item.name}`} className="text-muted-foreground hover:text-foreground" onClick={onRemove}>×</button>}
      </div>
      {item.opening && <span className="text-sm text-muted-foreground">Opening…</span>}
      {problem && <span className="text-sm">{problem}</span>}
      {a && !problem && (
        <>
          <span className="smallcaps text-[13px] text-muted-foreground">
            {KIND_LABEL[a.draft.format]} · {words} message{words === 1 ? "" : "s"} · {a.draft.speakers.length} {a.draft.speakers.length === 1 ? "voice" : "voices"}
            {a.notes.length ? ` · ${a.notes.join(" · ")}` : ""}
          </span>
          {t?.kind === "span" && <span className="text-sm">{formatWhen(t.from)} – {formatWhen(t.to)}{t.all ? "" : " · lines without a time keep their place"}</span>}
          {t?.kind === "none" && <span className="text-sm text-muted-foreground">No times in it: kept in the order it was written.</span>}
          {t?.kind === "clock" && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Clock times, but no day. Which day was it? (optional)</span>
              <input type="date" disabled={locked} className="h-8  border border-input bg-transparent px-2" value={item.extra.conversationDate ?? ""} onChange={(e) => onExtra({ conversationDate: e.target.value || null })} />
            </label>
          )}
          {t?.kind === "offsets" && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Times count from the start of the recording. When did it start? (optional)</span>
              <input type="datetime-local" disabled={locked} className="h-8  border border-input bg-transparent px-2" value={item.extra.recordingStart ?? ""} onChange={(e) => onExtra({ recordingStart: e.target.value || null })} />
            </label>
          )}
        </>
      )}
    </li>
  );
}
