import type { TreeNode } from "@/components/stam-tree/StamTree";
import type { StamGarden } from "@/lib/stam/types";

export type GardenData = Awaited<ReturnType<typeof import("@/lib/garden.functions").getGarden>>;

export type Idea = TreeNode & {
  dbId: string; note: string; settled: string | null; contributorId: string | null;
  natures: Record<string, string | null>;
};

export function toIdeas(d: GardenData): Idea[] {
  const byId = new Map(d.ideas.map((i: any) => [i.id, i]));
  const contrib = new Map(d.contributors.map((c: any) => [c.id, c]));
  return d.ideas.map((i: any) => {
    const mine = d.links.filter((l: any) => l.child_id === i.id);
    const parents = [
      ...mine.filter((l: any) => l.kind === "primary"),
      ...mine.filter((l: any) => l.kind === "merge"),
    ].map((l: any) => byId.get(l.parent_id)?.key).filter(Boolean) as string[];
    const natures = Object.fromEntries(mine.map((l: any) => [byId.get(l.parent_id)?.key, l.nature ?? null]));
    const c = contrib.get(i.contributor_id);
    return {
      id: i.key, dbId: i.id, label: i.label, note: i.note, parents, step: i.step, knot: i.is_knot, outcome: !!i.is_outcome, originQuote: (d.convMessages as any[]).find((m) => (d.evidence as any[]).some((e) => e.idea_id === i.id && e.role === "origin" && e.message_id === m.id))?.content,
      status: i.status, by: c?.name ?? "Unknown", color: c?.color ?? "var(--muted-ink)", settled: i.settled,
      contributorId: i.contributor_id, natures,
    };
  });
}

export function toStam(d: GardenData, ideas: Idea[]): StamGarden {
  const focus = d.ideas.find((i: any) => i.id === d.garden.focus_idea_id)?.key ?? null;
  return {
    title: d.garden.title, collected: d.garden.collected, focus,
    steps: Object.fromEntries(d.steps.map((s: any) => [String(s.step), s.title])),
    nodes: ideas.map((n) => ({ id: n.id, label: n.label, by: n.by, step: n.step, status: n.status, knot: !!n.knot, parents: n.parents, note: n.note })),
  };
}

export type EvidenceView = {
  id: string; role: string; note: string | null; messageId: string; content: string; sequence: number;
  sentAt: string | null; precision: string; importedAt: string; speaker: { name: string; color: string } | null;
  conversation: { id: string; title: string; happened_at: string | null } | null;
};

export function evidenceFor(d: GardenData, idea: Idea): EvidenceView[] {
  const msgs = new Map((d.convMessages as any[]).map((m) => [m.id, m]));
  const people = new Map((d.contributors as any[]).map((c) => [c.id, c]));
  const convs = new Map((d.conversations as any[]).map((c) => [c.id, c]));
  return (d.evidence as any[]).filter((e) => e.idea_id === idea.dbId && msgs.has(e.message_id)).map((e) => {
    const m = msgs.get(e.message_id);
    const p = m.contributor_id ? people.get(m.contributor_id) : null;
    return {
      id: e.id, role: e.role, note: e.note, messageId: m.id, content: m.content, sequence: m.sequence,
      sentAt: m.sent_at, precision: m.time_precision, importedAt: m.imported_at,
      speaker: p ? { name: p.name, color: p.color } : null, conversation: convs.get(m.conversation_id) ?? null,
    };
  });
}

/** Step date: the step's own date, else the earliest known message time among its ideas' evidence. */
export function stepDate(d: GardenData, ideas: Idea[], step: number): string | null {
  const own = (d.steps as any[]).find((s) => s.step === step)?.date;
  if (own) return own;
  const ids = new Set(ideas.filter((i) => i.step === step).map((i) => i.dbId));
  const msgs = new Map((d.convMessages as any[]).map((m) => [m.id, m]));
  const times = (d.evidence as any[]).filter((e) => ids.has(e.idea_id)).map((e) => msgs.get(e.message_id))
    .filter((m) => m && m.sent_at && m.time_precision !== "unknown").map((m) => m.sent_at as string).sort();
  return times[0]?.slice(0, 10) ?? null;
}
