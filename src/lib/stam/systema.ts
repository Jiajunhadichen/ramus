/** Systema: a Linnaean table of a garden. One column per first-level branch, ideas indented by depth (primary parent only), merges noted. */
export type SysNode = { id: string; label: string; parents: string[]; knot?: boolean; status?: string; outcome?: boolean };
export type SysEntry = { id: string; label: string; depth: number; knot: boolean; resting: boolean; merges: string[] };
export type SysColumn = { head: SysEntry; entries: SysEntry[] };

export function systema(nodes: SysNode[]): { root: SysEntry | null; columns: SysColumn[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string, SysNode[]>();
  for (const n of nodes) if (n.parents[0]) kids.set(n.parents[0], [...(kids.get(n.parents[0]) ?? []), n]);
  const entry = (n: SysNode, depth: number): SysEntry => ({
    id: n.id, label: n.label, depth, knot: !!n.knot, resting: n.status === "dormant",
    merges: n.parents.slice(1).map((p) => byId.get(p)?.label).filter((l): l is string => !!l),
  });
  const root = nodes.find((n) => !n.parents.length);
  if (!root) return { root: null, columns: [] };
  const walk = (n: SysNode, depth: number, out: SysEntry[]) => {
    for (const c of kids.get(n.id) ?? []) { out.push(entry(c, depth)); walk(c, depth + 1, out); }
    return out;
  };
  const columns = (kids.get(root.id) ?? []).map((c) => ({ head: entry(c, 0), entries: walk(c, 1, []) }));
  return { root: entry(root, 0), columns };
}
