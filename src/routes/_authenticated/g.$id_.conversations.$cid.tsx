import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getConversation } from "@/lib/garden.functions";
import { formatDate, formatTime, ROLE_LABEL, type EvidenceRole } from "@/lib/stam/evidence";

const convQuery = (gardenId: string, id: string) =>
  queryOptions({ queryKey: ["conversation", gardenId, id], queryFn: () => getConversation({ data: { gardenId, id } }) });

export const Route = createFileRoute("/_authenticated/g/$id_/conversations/$cid")({
  head: () => ({
    meta: [
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
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link to="/g/$id" params={{ id }} search={{ idea: undefined }} className="eyebrow hover:underline">← {data.garden.title}</Link>
      <h1 className="mt-2 font-display text-3xl font-bold">{data.conversation.title}</h1>
      <p className="eyebrow mt-1">{data.conversation.source} · Happened: {formatDate(data.conversation.happened_at)} · Imported: {data.conversation.imported_at.slice(0, 10)} · recorded with everyone's consent</p>
      <ol className="mt-6 grid gap-3">
        {data.messages.map((m) => {
          const who = m.contributor_id ? people.get(m.contributor_id) : null;
          const born = data.ideas.filter((i) => i.message_id === m.id);
          return (
            <li key={m.id} id={m.id} className={"rounded-md border bg-sheet p-4 " + (born.length ? "border-ink" : "border-rule")}
              style={{ borderLeftWidth: 4, borderLeftColor: who?.color ?? "var(--rule)" }}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium" style={{ color: who?.color }}>{who?.name ?? "Unattributed"}</span>
                <span className="font-mono text-xs text-muted-foreground">#{m.sequence + 1} · {formatTime(m.sent_at, m.time_precision)} · imported {m.imported_at.slice(0, 10)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
              {born.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="eyebrow">Evidence for</span>
                  {born.map((i) => (
                    <Link key={i.key + i.role} to="/g/$id" params={{ id }} search={{ idea: i.key }} className="chip hover:bg-paper">{ROLE_LABEL[i.role as EvidenceRole] ?? i.role}: {i.label}</Link>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
