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
/** The ids given, with every idea on their primary path back to the root. */
export function withAncestors(nodes: Node[], ids: Iterable<string>): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  for (const id of ids) {
    let n = byId.get(id);
    while (n && !out.has(n.id)) { out.add(n.id); n = byId.get(n.parents[0] ?? ""); }
  }
  return out;
}

/** Every line still being pursued: each idea that has not been set aside (resting), with the path that leads to it.
 *  An idea set aside, and a line that leads only to ideas set aside, is not in it. Why: when people present a garden,
 *  everything still growing is what they talk about; one "main" line picked by rule hid most of it. */
export function livingLines(nodes: Node[]): Set<string> {
  return withAncestors(nodes, nodes.filter((n) => n.status !== "dormant").map((n) => n.id));
}
