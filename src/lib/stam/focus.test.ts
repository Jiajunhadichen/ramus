import { describe, expect, it } from "vitest";
import { lineage } from "./focus";
import { boxOverlap, computeLayout, pathSamples, type LNode } from "./layout";
import sample from "../../../docs/sample-garden.json";

const CARD = { x: 16, y: 16, w: 290, h: 128 };
const layout = () => computeLayout(sample.nodes.map((n) => ({ ...n, step: n.step })), { obstacle: CARD });
const hit = (b: NonNullable<LNode["box"]>, p: { x: number; y: number }) => p.x > b.x0 && p.x < b.x1 && p.y > b.top && p.y < b.top + b.h;

describe("lineage focus", () => {
  const nodes = [
    { id: "r", parents: [] }, { id: "a", parents: ["r"] }, { id: "b", parents: ["a"] },
    { id: "c", parents: ["b"] }, { id: "s", parents: ["r"] }, { id: "m", parents: ["s", "a"] },
  ];
  it("keeps the path to the root and all descendants", () => {
    expect([...lineage(nodes, "b")!].sort()).toEqual(["a", "b", "c", "r"]);
  });
  it("follows only the primary parent upward", () => {
    expect(lineage(nodes, "m")!.has("a")).toBe(false);
  });
  it("clears when nothing is selected", () => {
    expect(lineage(nodes, null)).toBeNull();
  });
});

describe("label placement on the demo garden", () => {
  const L = layout();
  it("no two labels overlap", () => {
    for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++)
      expect(boxOverlap(L.nodes[i]!.box!, L.nodes[j]!.box!, 0), `${L.nodes[i]!.label} / ${L.nodes[j]!.label}`).toBe(false);
  });
  it("no label covers another node", () => {
    for (const n of L.nodes) for (const m of L.nodes) if (m !== n) expect(hit(n.box!, m), `${n.label} on ${m.label}`).toBe(false);
  });
  it("no label or node sits under the specimen card", () => {
    for (const n of L.nodes) {
      const b = n.box!;
      expect(b.x1 > CARD.x && b.x0 < CARD.x + CARD.w && b.top + b.h > CARD.y && b.top < CARD.y + CARD.h, n.label).toBe(false);
    }
  });
  it("labels stay clear of branch and merge lines", () => {
    const pts = pathSamples(L.nodes, L.byId);
    for (const n of L.nodes) for (const p of pts) if (p.a !== n.id && p.b !== n.id) expect(hit(n.box!, p), `${n.label}`).toBe(false);
  });
  it("every label stays on the sheet", () => {
    for (const n of L.nodes) { expect(n.box!.x0, n.label).toBeGreaterThanOrEqual(0); expect(n.box!.x1, n.label).toBeLessThanOrEqual(1100); }
  });
});
