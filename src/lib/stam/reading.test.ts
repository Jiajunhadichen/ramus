import { describe, expect, it } from "vitest";
import sample from "../../../docs/sample-garden.json";
import { mainLineage, readingDetail } from "./reading";

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
});