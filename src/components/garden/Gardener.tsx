import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { harvestConversation, reviewAllSuggestions } from "@/lib/garden.functions";
import { Button } from "@/components/ui/button";

/** Ask the gardener to read one conversation; returns how it went in plain words. */
export function useHarvest(gardenId: string) {
  const harvest = useServerFn(harvestConversation);
  const qc = useQueryClient();
  const [reading, setReading] = useState<string | null>(null);
  async function read(conversationId: string) {
    setReading(conversationId);
    try {
      const r = await harvest({ data: { gardenId, conversationId } });
      await qc.invalidateQueries({ queryKey: ["garden", gardenId] });
      const skipped = r.skipped ? ` It read the latest ${r.read} messages.` : "";
      if (r.proposed) toast.success(`The gardener suggests ${r.proposed} branch${r.proposed === 1 ? "" : "es"}. They are dashed on the tree until you decide.${skipped}`);
      else toast(`The gardener found no ideas to suggest in this conversation.${skipped}`);
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally { setReading(null); }
  }
  return { read, reading };
}

type Conv = { id: string; title: string };

/** On the garden: what the gardener suggests, or which conversation it has not read yet. */
export function GardenerPanel({ gardenId, conversations, suggested, readConversationIds }: {
  gardenId: string; conversations: Conv[]; suggested: number; readConversationIds: Set<string>;
}) {
  const { read, reading } = useHarvest(gardenId);
  const all = useServerFn(reviewAllSuggestions);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const unread = [...conversations].reverse().find((c) => !readConversationIds.has(c.id));
  async function decideAll(accept: boolean) {
    setBusy(true);
    try {
      const r = await all({ data: { gardenId, accept } });
      await qc.invalidateQueries({ queryKey: ["garden", gardenId] });
      toast.success(accept ? `${r.decided} accepted. They are on the tree now.` : `${r.decided} rejected. They stay in the record, off the tree.`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  if (reading) {
    return <p role="status" className="rounded-md border border-dashed border-ink/40 bg-sheet px-4 py-3 text-[15px]"><span className="hand">The gardener is reading…</span> It traces who raised what and how it grew; this can take a minute.</p>;
  }
  if (suggested > 0) {
    return (
      <section aria-label="The gardener's suggestions" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-ink/40 bg-sheet px-4 py-3 text-[15px]">
        <p>The gardener suggests <strong>{suggested}</strong> branch{suggested === 1 ? "" : "es"}. Dashed ones are its suggestions: open one to accept or reject it.</p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decideAll(true)}>Accept all</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decideAll(false)}>Reject all</Button>
        </div>
      </section>
    );
  }
  if (!unread) return null;
  return (
    <section aria-label="The gardener" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-ink/40 bg-sheet px-4 py-3 text-[15px]">
      <p>The gardener has not read “{unread.title}” yet. It can trace how the ideas in it grew; you decide what stays.</p>
      <Button size="sm" className="ml-auto" onClick={() => read(unread.id)}>Let the gardener read it</Button>
    </section>
  );
}
