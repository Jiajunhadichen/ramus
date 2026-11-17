import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { AccessionStamp, stampLine } from "@/components/garden/AccessionStamp";
import { HIDDEN_NOTE, formatOffset, groupMessages } from "@/lib/intake/display";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getBatchOriginal, getConversation } from "@/lib/garden.functions";
import { formatDate, formatTime, ROLE_LABEL, type EvidenceRole } from "@/lib/stam/evidence";

const convQuery = (gardenId: string, id: string) =>
  queryOptions({ queryKey: ["conversation", gardenId, id], queryFn: () => getConversation({ data: { gardenId, id } }) });

export const Route = createFileRoute("/_authenticated/g/$id_/conversations/$cid")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Conversation — Ramus" },
      { name: "description", content: "A recorded conversation and the ideas that grew from it." },
      { property: "og:title", content: "Conversation — Ramus" },
      { property: "og:description", content: "A recorded conversation and the ideas that grew from it." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(convQuery(params.id, params.cid)),
  component: ConversationPage,
});

function ConversationPage() {
  const { id, cid } = Route.useParams();
  const { data } = useSuspenseQuery(convQuery(id, cid));
  const people = new Map(data.contributors.map((c) => [c.id, c]));
  const [showAside, setShowAside] = useState(false);
  const [open, setOpen] = useState<null | { batchId: string | null; start: number | null; end: number | null }>(null);
  const batches = data.batches ?? [];
  const firstBatch = batches[0]?.id ?? null;
  const counts = new Map<string, number>();
  for (const m of data.messages) { const b = m.batch_id ?? firstBatch; if (b) counts.set(b, (counts.get(b) ?? 0) + 1); }
  const visible = data.messages.filter((m) => showAside || !m.hidden_reason);
  const asideCount = data.messages.length - data.messages.filter((m) => !m.hidden_reason).length;
  const batch = open ? batches.find((b) => b.id === (open.batchId ?? firstBatch)) : null;
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link to="/g/$id" params={{ id }} search={{ idea: undefined }} className="eyebrow hover:underline">← {data.garden.title}</Link>
      <h1 className="mt-2 font-display text-[40px] leading-[1.1]">{data.conversation.title}</h1>
      <p className="eyebrow mt-1">{data.conversation.source} · Happened: {formatDate(data.conversation.happened_at)} · Imported: {data.conversation.imported_at.slice(0, 10)} · recorded with everyone's consent</p>
      {batches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Accessions">
          {batches.map((b) => <AccessionStamp key={b.id} small no={b.accession_no} line={stampLine({ receivedAt: b.created_at, format: b.source_format, messages: counts.get(b.id) ?? 0 })} />)}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><Switch checked={showAside} onCheckedChange={setShowAside} aria-label="Show set-aside lines" />Show set-aside lines{asideCount ? ` (${asideCount})` : ""}</label>
        <Link to="/g/$id/accession" params={{ id }} className="underline underline-offset-4">Bring in more</Link>
      </div>
      <ol className="mt-6 grid gap-3">
        {groupMessages(visible).map((group) => {
          const head = group[0]!;
          const who = head.contributor_id ? people.get(head.contributor_id) : null;
          return (
            <li key={head.id} className="rounded-md border border-rule bg-sheet p-4" style={{ borderLeftWidth: 4, borderLeftColor: who?.color ?? "var(--rule)" }}>
              {group.map((m, k) => {
                const born = data.ideas.filter((i) => i.message_id === m.id);
                return (
                  <div key={m.id} id={m.id} className={(k ? "mt-3 " : "") + (m.hidden_reason ? "opacity-50" : "")}>
                    {k === 0 || m.hidden_reason ? (
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        {k === 0 && <span className="font-medium" style={{ color: who?.color }}>{who?.name ?? m.speaker_label ?? "Unattributed"}</span>}
                        <span className="smallcaps text-[13px] text-muted-foreground">#{m.sequence + 1} · {m.sent_at ? formatTime(m.sent_at, m.time_precision) : m.offset_ms != null ? formatOffset(m.offset_ms) : "time unknown"}</span>
                        {m.hidden_reason && <span className="hand">{HIDDEN_NOTE[m.hidden_reason]}</span>}
                      </p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2 text-sm">
                      {batches.length > 0 && <button type="button" className="smallcaps text-[13px] text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOpen({ batchId: m.batch_id, start: m.raw_start, end: m.raw_end })}>See in original</button>}
                      {born.length > 0 && <span className="eyebrow">Evidence for</span>}
                      {born.map((i) => (
                        <Link key={i.key + i.role} to="/g/$id" params={{ id }} search={{ idea: i.key }} className="chip hover:bg-paper">{ROLE_LABEL[i.role as EvidenceRole] ?? i.role}: {i.label}</Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ol>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-sheet sm:max-w-xl">
          <SheetTitle className="font-display">Original{batch ? ` · Nº ${String(batch.accession_no).padStart(3, "0")}` : ""}</SheetTitle>
          {batch && <OriginalText gardenId={id} batchId={batch.id} start={open?.start ?? null} end={open?.end ?? null} />}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function OriginalText({ gardenId, batchId, start, end }: { gardenId: string; batchId: string; start: number | null; end: number | null }) {
  const ref = useRef<HTMLElement>(null);
  const q = useQuery({ queryKey: ["original", batchId], queryFn: () => getBatchOriginal({ data: { gardenId, batchId } }), staleTime: Infinity });
  const raw = q.data?.raw ?? null;
  useEffect(() => { ref.current?.scrollIntoView({ block: "center" }); }, [start, raw]);
  if (raw === null) return <p className="hand mt-4">{q.isError ? "The original could not be opened." : "Opening the original…"}</p>;
  if (start == null || end == null) return <pre className="original-sample mt-4 whitespace-pre-wrap text-[14px]">{raw}{"\n"}<span className="hand">This message has no exact span in the original (it came from an export or an earlier import).</span></pre>;
  return (
    <pre className="original-sample mt-4 whitespace-pre-wrap text-[14px]">
      {raw.slice(0, start)}<mark ref={ref} className="lit text-inherit">{raw.slice(start, end)}</mark>{raw.slice(end)}
    </pre>
  );
}
