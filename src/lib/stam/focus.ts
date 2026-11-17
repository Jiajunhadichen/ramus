/** Lineage of an idea: its primary path to the root plus every descendant. */
export function lineage(nodes: { id: string; parents: string[] }[], id: string | null): Set<string> | null {
  if (!id) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(id)) return null;
  const out = new Set<string>([id]);
  let cur = byId.get(id);
  while (cur && cur.parents[0] && !out.has(cur.parents[0])) { out.add(cur.parents[0]); cur = byId.get(cur.parents[0]); }
  const kids = new Map<string, string[]>();
  nodes.forEach((n) => { if (n.parents[0]) kids.set(n.parents[0], [...(kids.get(n.parents[0]) ?? []), n.id]); });
  const stack = [id];
  while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!out.has(k)) { out.add(k); stack.push(k); }
  return out;
}

/** One quiet line per concept, shown on hover / long-press. */
export const REASONS = {
  knot: "A click: something this group settled. (Herbert Simon)",
  resting: "Resting, not deleted. Every idea is kept. (Richard Dawkins)",
  merge: "Two lines of thought recombined.",
  unconfirmed: "The gardener's guess. People decide.",
} as const;
