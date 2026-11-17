import { describe, expect, it } from "vitest";
import { byPriority, labelSize, settleLabels, wantedLabels, type Box } from "./labels";
import { planters } from "./people";

const nodes = [
  { id: "root", parents: [], desc: 6 },
  { id: "a", parents: ["root"], desc: 3 },
  { id: "b", parents: ["root"], desc: 1 },
  { id: "k", parents: ["a"], knot: true, desc: 0 },
  { id: "o", parents: ["a"], outcome: true, desc: 0 },
  { id: "leaf1", parents: ["b"], desc: 0 },
  { id: "leaf2", parents: ["a"], desc: 0 },
];
const main = new Set(["root", "a", "o"]);

describe("label priority", () => {
  it("orders selected, root, outcome, knot, main lineage, more descendants, others", () => {
    const order = byPriority([...nodes, { id: "m", parents: ["a"], desc: 0 }], new Set([...main, "m"]), "leaf1").map((n) => n.id);
    expect(order).toEqual(["leaf1", "root", "o", "k", "a", "m", "b", "leaf2"]);
  });
  it("at the fitted zoom shows root, lineage, outcomes, knots and ideas with descendants only", () => {
    expect([...wantedLabels(nodes, { k: 1, main, selected: null })].sort()).toEqual(["a", "b", "k", "o", "root"]);
  });
  it("shows every label from 2.5× zoom", () => {
    expect(wantedLabels(nodes, { k: 2.5, main, selected: null }).size).toBe(nodes.length);
  });
  it("selecting shows the idea, its parent and its children", () => {
    const w = wantedLabels(nodes, { k: 1, main, selected: "b" });
    expect(w.has("leaf1")).toBe(true);
    expect(w.has("leaf2")).toBe(false);
  });
  it("hides the lower-priority label of two that overlap", () => {
    const box: Box = { x0: 0, x1: 50, top: 0, h: 15 };
    const shown = settleLabels(nodes, new Set(["k", "o"]), () => box, main, null);
    expect([...shown]).toEqual(["o"]);
    expect([...settleLabels(nodes, new Set(["k", "o"]), () => box, main, "k")]).toEqual(["k"]);
  });
  it("keeps labels between 13 and 18px on screen", () => {
    for (const k of [0.6, 1, 2.5, 4]) for (const s of [0.4, 0.9, 1.5]) {
      const px = labelSize(k, s) * s * k;
      expect(px).toBeGreaterThanOrEqual(13 - 1e-9);
      expect(px).toBeLessThanOrEqual(18 + 1e-9);
    }
  });
});

describe("people count", () => {
  it("counts distinct planters of ideas in the tree, not every speaker", () => {
    expect(planters([
      { contributor_id: "p1" }, { contributor_id: "p1" }, { contributor_id: "ai" },
      { contributor_id: "p3", rejected_at: "2026-01-01" }, { contributor_id: "p4", confirmed: false }, { contributor_id: null },
    ])).toBe(2);
  });
});
