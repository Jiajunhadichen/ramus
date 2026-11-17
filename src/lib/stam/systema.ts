/**
 * Systema: the garden read in order, one chapter per step, in the manner of a naturalist's journal.
 * Each entry says who raised the idea, what it grew from (or combined), and the idea's own note,
 * so the thinking can be followed without the tree. Nothing is left out: entries outside the
 * current reading level are named at the end of their chapter.
 */
export type SysNode = {
  id: string; label: string; parents: string[]; step: number; by: string;
  note?: string | null | undefined; knot?: boolean; status?: string; outcome?: boolean;
  /** how it grew from each parent: answers, refines, challenges, splits, combines (or null) */
  natures?: Record<string, string | null | undefined> | undefined;
};
export type SysFrom = { id: string; label: string; nature: string | null; merge: boolean };
export type SysEntry = {
  id: string; label: string; by: string; note: string; knot: boolean; resting: boolean; outcome: boolean;
  from: SysFrom[];
};
export type SysChapter = { step: number; title: string | null; entries: SysEntry[] };

export function systema(nodes: SysNode[], titles: Record<number, string | null | undefined> = {}): { root: SysEntry | null; chapters: SysChapter[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const entry = (n: SysNode): SysEntry => ({
    id: n.id, label: n.label, by: n.by, note: (n.note ?? "").trim(), knot: !!n.knot, resting: n.status === "dormant", outcome: !!n.outcome,
    from: n.parents.flatMap((p, i) => {
      const parent = byId.get(p);
      return parent ? [{ id: p, label: parent.label, nature: n.natures?.[p] ?? null, merge: i > 0 }] : [];
    }),
  });
  const root = nodes.find((n) => !n.parents.length);
  if (!root) return { root: null, chapters: [] };
  // within a step: the order they were added, but never before what they grew from
  const ordered: SysNode[] = [];
  const placed = new Set<string>();
  const place = (n: SysNode, seen = new Set<string>()) => {
    if (placed.has(n.id) || seen.has(n.id)) return;
    seen.add(n.id);
    for (const p of n.parents) { const parent = byId.get(p); if (parent && parent.step === n.step) place(parent, seen); }
    placed.add(n.id); ordered.push(n);
  };
  for (const n of [...nodes].sort((a, b) => a.step - b.step)) place(n);
  const steps = [...new Set(ordered.map((n) => n.step))].sort((a, b) => a - b);
  return {
    root: entry(root),
    chapters: steps.map((step) => ({ step, title: titles[step] ?? null, entries: ordered.filter((n) => n.step === step).map(entry) })),
  };
}

/** How an entry grew, in a few words: "combines A, B and C", "refines A", "from A". */
export function grewFrom(e: SysEntry, rootId: string | null): string {
  const names = (xs: SysFrom[]) => xs.length < 2 ? xs.map((x) => x.label).join("") : `${xs.slice(0, -1).map((x) => x.label).join(", ")} and ${xs.at(-1)!.label}`;
  const primary = e.from[0];
  if (!primary) return "";
  if (e.from.length > 1) return `combines ${names(e.from)}`;
  if (primary.id === rootId && !primary.nature) return "one answer to the question";
  const verb = { answers: "answers", refines: "refines", challenges: "challenges", splits: "branches off", combines: "combines" }[primary.nature ?? ""] ?? "grew from";
  return `${verb} ${primary.label}`;
}
