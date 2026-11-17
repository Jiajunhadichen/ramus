import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { growTree, reviewAllSuggestions } from "@/lib/garden.functions";
import { Button } from "@/components/ui/button";

export type GrowScope = { batchIds?: string[]; conversationIds?: string[] };
export type GrowProgress = { part: number; of: number };
export type Grown = { grown: number; parts: number; root: string | null };

/** The gardener reads everything in scope, part after part, and grows the tree. */
export function useGrow() {
  const grow = useServerFn(growTree);
  const qc = useQueryClient();
  /** `from` resumes after parts already read, so trying again never reads a part twice. */
  return async function run(gardenId: string, scope: GrowScope, opts: { nameRoot?: boolean; nameGarden?: boolean; resumeFrom?: string | null; told?: string | null; from?: number; onProgress?: (p: GrowProgress) => void; onPartDone?: (partsDone: number) => void } = {}): Promise<Grown> {
    let part = opts.from ?? 0, of = Math.max(1, part + 1), grown = 0;
    let root: string | null = null;
    do {
      opts.onProgress?.({ part: part + 1, of });
      const first = part === 0;
      const r = await grow({ data: { gardenId, ...scope, part, nameRoot: first && !!opts.nameRoot, nameGarden: first && !!opts.nameGarden, resumeFrom: first ? opts.resumeFrom ?? null : null, told: first ? opts.told ?? null : null } });
      of = r.parts; grown += r.grown; root ??= r.root;
      part++;
      opts.onPartDone?.(part);
    } while (part < of);
    await qc.invalidateQueries({ queryKey: ["garden", gardenId] });
    await qc.invalidateQueries({ queryKey: ["gardens"] });
    return { grown, parts: of, root };
  };
}

export const grownLine = (n: number) => (n ? `The tree grew ${n} branch${n === 1 ? "" : "es"}.` : "The gardener found no ideas to grow from this.");

type Conv = { id: string; title: string };

/** On the garden: an older conversation the gardener has not read, or older suggestions still waiting. */
export function GardenerPanel({ gardenId, conversations, suggested, readConversationIds }: {
  gardenId: string; conversations: Conv[]; suggested: number; readConversationIds: Set<string>;
}) {
  const grow = useGrow();
  const all = useServerFn(reviewAllSuggestions);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<GrowProgress | null>(null);
  const unread = [...conversations].reverse().find((c) => !readConversationIds.has(c.id));
  async function decideAll(accept: boolean) {
    setBusy(true);
    try {
      const r = await all({ data: { gardenId, accept } });
      await qc.invalidateQueries({ queryKey: ["garden", gardenId] });
      toast.success(accept ? `${r.decided} accepted. They are on the tree now.` : `${r.decided} taken off. They stay in the record, off the tree.`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function read(c: Conv) {
    setReading({ part: 1, of: 1 });
    try { toast.success(grownLine((await grow(gardenId, { conversationIds: [c.id] }, { onProgress: setReading })).grown)); }
    catch (e) { toast.error((e as Error).message); }
    finally { setReading(null); }
  }
  if (reading) {
    return <p role="status" className="px-4 py-3 text-ui"><span className="hand">The gardener is reading{reading.of > 1 ? ` (part ${reading.part} of ${reading.of})` : ""}…</span> It traces who raised what, in the order it was said.</p>;
  }
  if (suggested > 0) {
    return (
      <section aria-label="The gardener’s suggestions" className="flex flex-wrap items-center gap-x-4 gap-y-2  border border-rule bg-sheet px-4 py-3 text-ui">
        <p>{suggested} older suggestion{suggested === 1 ? " is" : "s are"} still dashed on the tree.</p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decideAll(true)}>Put them on the tree</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decideAll(false)}>Take them off</Button>
        </div>
      </section>
    );
  }
  if (!unread) return null;
  return (
    <section aria-label="The gardener" className="flex flex-wrap items-center gap-x-4 gap-y-2  border border-rule bg-sheet px-4 py-3 text-ui">
      <p>The gardener has not read “{unread.title}” yet.</p>
      <Button variant="outline" size="sm" className="ml-auto" onClick={() => read(unread)}>Let the gardener read it</Button>
    </section>
  );
}
