import { describe, expect, it } from "vitest";
import { validateGarden } from "./validate";
import { splitConversation } from "./split";
import { computeLayout, selectionAt, visibleAt } from "./layout";
import sample from "../../../docs/sample-garden.json";

const n = (id: string, parents: string[], label = id) => ({ id, label, parents });

describe("validateGarden", () => {
  it("accepts the sample garden", () => {
    expect(validateGarden(sample.nodes)).toEqual([]);
  });
  it("rejects two roots with the exact message", () => {
    const errs = validateGarden([n("a", []), n("b", [])]);
    expect(errs.map((e) => e.problem)).toContain("Exactly one root is needed, found 2");
  });
  it("rejects a missing parent", () => {
    const errs = validateGarden([n("a", []), n("b", ["zzz"])]);
    expect(errs[0]!.idea).toBe("b");
  });
  it("rejects a cycle in the primary chain", () => {
    const errs = validateGarden([n("r", []), n("a", ["b"]), n("b", ["a"])]);
    expect(errs.some((e) => e.problem.includes("loops"))).toBe(true);
  });
  it("rejects labels over 24 characters", () => {
    expect(validateGarden([n("r", [], "x".repeat(25))]).length).toBe(1);
    expect(validateGarden([n("r", [], "x".repeat(24))]).length).toBe(0);
  });
});

describe("splitConversation", () => {
  it("splits by Name: lines", () => {
    const m = splitConversation("Ana: hi\nmore\nBo: yes");
    expect(m).toEqual([{ speaker: "Ana", content: "hi\nmore" }, { speaker: "Bo", content: "yes" }]);
  });
  it("falls back to one message", () => {
    expect(splitConversation("just notes\nline two")).toEqual([{ speaker: null, content: "just notes\nline two" }]);
  });
});

describe("replay", () => {
  it("shows only ideas up to the step and moves selection to a visible idea", () => {
    const nodes = sample.nodes;
    expect(visibleAt(nodes, 1).size).toBe(nodes.filter((x) => x.step === 1).length);
    const late = nodes.find((x) => x.step === 10)!.id;
    const s = selectionAt(nodes, 1, late);
    expect(nodes.find((x) => x.id === s)!.step).toBe(1);
  });
  it("lays out every node inside the sheet", () => {
    const L = computeLayout(sample.nodes);
    for (const x of L.nodes) {
      expect(x.x).toBeGreaterThan(0);
      expect(x.x).toBeLessThan(1100);
    }
  });
});

import { formatTime, formatDate, sortEvidence } from "./evidence";
describe("evidence", () => {
  it("puts origin first, then restated, supports, challenges", () => {
    const s = sortEvidence([{ role: "challenges" }, { role: "supports" }, { role: "origin" }, { role: "restated" }]);
    expect(s.map((e) => e.role)).toEqual(["origin", "restated", "supports", "challenges"]);
  });
  it("shows time unknown for missing times, never today", () => {
    expect(formatTime(null)).toBe("time unknown");
    expect(formatTime("2026-01-02T10:11:12Z", "unknown")).toBe("time unknown");
    expect(formatDate(null)).toBe("time unknown");
    expect(formatTime("2026-01-02T10:11:12Z", "minute")).toBe("2026-01-02 10:11");
  });
});
