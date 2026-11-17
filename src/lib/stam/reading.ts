export type ReadingLevel = "form" | "lineage" | "record";
type Node = { id: string; parents: string[]; step: number; outcome?: boolean; knot?: boolean; status?: string };

/** Only primary parents describe influence. Merge parents never enter the main path. */
export function mainLineage(nodes: Node[], focus?: string | null): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outcomes = nodes.filter((n) => n.outcome);
  const newest = nodes.reduce<Node | undefined>((last, n) => !last || n.step >= last.step ? n : last, undefined);
  const targets = outcomes.length ? outcomes : [byId.get(focus ?? "") ?? newest].filter((n): n is Node => !!n);
  const result = new Set<string>();
  for (const target of targets) {
    let n: Node | undefined = target;
    while (n && !result.has(n.id)) { result.add(n.id); n = byId.get(n.parents[0] ?? ""); }
  }
  for (const root of nodes.filter((n) => !n.parents.length)) result.add(root.id);
  return result;
}

export function readingDetail(nodes: Node[], level: ReadingLevel, main: Set<string>, selected: string | null): Set<string> {
  const full = new Set(main);
  for (const n of nodes) {
    if (level === "record" || (level === "lineage" && n.status !== "dormant" && (n.knot || nodes.some((c) => c.parents[0] === n.id)))) full.add(n.id);
    if (selected && (n.id === selected || n.parents.includes(selected) || nodes.find((s) => s.id === selected)?.parents.includes(n.id))) full.add(n.id);
  }
  return full;
}