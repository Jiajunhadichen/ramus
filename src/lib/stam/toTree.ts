import type { StamGarden } from "./types";
import type { TreeNode } from "@/components/stam-tree/StamTree";
import { nextColor } from "./palette";

export function stamToTree(g: StamGarden): TreeNode[] {
  const people = [...new Set(g.nodes.map((n) => n.by))];
  return g.nodes.map((n) => ({
    id: n.id, label: n.label, parents: n.parents, step: n.step, knot: !!n.knot,
    status: n.status === "dormant" ? "dormant" : "growing", by: n.by, color: nextColor(people.indexOf(n.by)),
  }));
}
