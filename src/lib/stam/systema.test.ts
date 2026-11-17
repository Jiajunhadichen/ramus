import { describe, expect, it } from "vitest";
import sample from "../../../docs/sample-garden.json";
import { stamToTree } from "./toTree";
import { systema } from "./systema";
import type { StamGarden } from "./types";

describe("systema", () => {
  const nodes = stamToTree(sample as StamGarden);
  const s = systema(nodes);
  it("lists every idea exactly once", () => {
    const ids = [s.root!.id, ...s.columns.flatMap((c) => [c.head.id, ...c.entries.map((e) => e.id)])];
    expect(ids.sort()).toEqual(nodes.map((n) => n.id).sort());
  });
  it("one column per first-level branch", () => {
    expect(s.columns.length).toBe(nodes.filter((n) => n.parents[0] === s.root!.id).length);
  });
  it("indents by depth and notes merges", () => {
    const t = systema([
      { id: "r", label: "R", parents: [] }, { id: "a", label: "A", parents: ["r"] }, { id: "b", label: "B", parents: ["r"] },
      { id: "c", label: "C", parents: ["a", "b"], knot: true }, { id: "d", label: "D", parents: ["c"], status: "dormant" },
    ]);
    expect(t.columns[0]!.entries).toEqual([
      { id: "c", label: "C", depth: 1, knot: true, resting: false, merges: ["B"] },
      { id: "d", label: "D", depth: 2, knot: false, resting: true, merges: [] },
    ]);
  });
});
