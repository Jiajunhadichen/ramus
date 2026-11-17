import type { TreeNode } from "@/components/stam-tree/StamTree";
import type { StamGarden } from "@/lib/stam/types";

export type GardenData = Awaited<ReturnType<typeof import("@/lib/garden.functions").getGarden>>;

export type Idea = TreeNode & {
  dbId: string; note: string; settled: string | null; contributorId: string | null;
  conversationId: string | null; messageId: string | null; sourceExcerpt: string | null;
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
    const c = contrib.get(i.contributor_id);
    return {
      id: i.key, dbId: i.id, label: i.label, note: i.note, parents, step: i.step, knot: i.is_knot,
      status: i.status, by: c?.name ?? "Unknown", color: c?.color ?? "var(--muted-ink)", settled: i.settled,
      contributorId: i.contributor_id, conversationId: i.conversation_id, messageId: i.message_id, sourceExcerpt: i.source_excerpt,
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
