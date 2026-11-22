import { describe, expect, it } from "vitest";
import sample from "../../../docs/sample-garden.json";
import { livingLines, mainLineage, readingDetail, withAncestors } from "./reading";

describe("reading levels", () => {
  const nodes = sample.nodes.map((n) => ({ ...n, outcome: n.id === "humans" }));
  it("shows the specified demo primary path, not merge parents", () => {
    expect([...mainLineage(nodes)].reverse()).toEqual(["root", "fitloop", "engine", "evo", "aitool", "visible", "five", "prompt", "protocol", "tree", "form", "garden", "kit", "humans"]);
  });
  it("unions paths to several outcomes", () => {
    const main = mainLineage(nodes.map((n) => ({ ...n, outcome: n.outcome || n.id === "thermo" })));
    expect(main.has("private")).toBe(true); expect(main.has("thermo")).toBe(true); expect(main.has("humans")).toBe(true); expect(main.has("woz")).toBe(false);
  });
  it("falls back to focus before newest", () => {
    expect([...mainLineage(sample.nodes, "fitloop")]).toEqual(["fitloop", "root"]);
    expect(mainLineage(sample.nodes).has("tend")).toBe(true);
  });
  it("Form keeps non-main ideas as buds and selection reveals neighbors", () => {
    const main = mainLineage(nodes);
    expect(readingDetail(nodes, "form", main, null).has("private")).toBe(false);
    const selected = readingDetail(nodes, "form", main, "private");
    expect(selected.has("thermo")).toBe(true); expect(selected.has("woz")).toBe(true); expect(selected.has("aitool")).toBe(true);
  });
  it("Lineage leaves resting and minor leaves as buds; Record reveals all", () => {
    const main = mainLineage(nodes);
    const detail = readingDetail(nodes, "lineage", main, null);
    expect(detail.has("private")).toBe(true); expect(detail.has("woz")).toBe(false); expect(detail.has("personal")).toBe(false);
    expect(readingDetail(nodes, "record", main, null).size).toBe(nodes.length);
  });
  it("living lines keep every idea not set aside, and the path to it", () => {
    const t = [
      { id: "r", parents: [], step: 1 },
      { id: "a", parents: ["r"], step: 2 },
      { id: "b", parents: ["r"], step: 2, status: "dormant" },
      { id: "c", parents: ["b"], step: 3 },
      { id: "d", parents: ["a"], step: 3, status: "dormant" },
      { id: "e", parents: ["d"], step: 4, status: "dormant" },
    ];
    expect([...livingLines(t)].sort()).toEqual(["a", "b", "c", "r"]);
    expect([...withAncestors(t, ["e"])].sort()).toEqual(["a", "d", "e", "r"]);
    const sampleLiving = livingLines(sample.nodes);
    for (const n of sample.nodes) if (n.status !== "dormant") expect(sampleLiving.has(n.id)).toBe(true);
    expect(sampleLiving.size).toBeGreaterThan(mainLineage(nodes).size);
  });
});
