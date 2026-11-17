import { describe, expect, it } from "vitest";
import sample from "../../../docs/sample-garden.json";
import { stamToTree } from "./toTree";
import { grewFrom, systema } from "./systema";
import type { StamGarden } from "./types";

describe("systema: the garden read step by step", () => {
  const g = sample as StamGarden;
  const nodes = stamToTree(g).map((n) => ({ ...n, note: g.nodes.find((o) => o.id === n.id)?.note }));
  const titles = Object.fromEntries(Object.entries(g.steps ?? {}).map(([k, v]) => [Number(k), v]));
  const s = systema(nodes, titles);
  it("writes every idea exactly once, in a chapter for its step", () => {
    const ids = s.chapters.flatMap((c) => c.entries.map((e) => e.id));
    expect([...ids].sort()).toEqual(nodes.map((n) => n.id).sort());
    for (const c of s.chapters) for (const e of c.entries) expect(nodes.find((n) => n.id === e.id)!.step).toBe(c.step);
  });
  it("chapters follow the steps, with their titles", () => {
    expect(s.chapters.map((c) => c.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.chapters[0]!.title).toBe("ChatGPT 给出四个方向");
  });
  it("within a step nothing comes before what it grew from", () => {
    for (const c of s.chapters) {
      const at = new Map(c.entries.map((e, i) => [e.id, i]));
      for (const e of c.entries) for (const f of e.from) if (at.has(f.id)) expect(at.get(f.id)!).toBeLessThan(at.get(e.id)!);
    }
  });
  it("each entry says who raised it, what it grew from and what it means", () => {
    const engine = s.chapters[0]!.entries.find((e) => e.id === "engine")!;
    expect(engine).toMatchObject({ by: "ChatGPT", knot: true, note: "发现这些项目共享同一个结构：反馈、修改、审核、确认。" });
    expect(grewFrom(engine, "root")).toBe("combines FitLoop 样衣协作, SustainTrace and AccessSafe");
    const evo = s.chapters[1]!.entries.find((e) => e.id === "evo")!;
    expect(grewFrom(evo, "root")).toBe("grew from 业务流程引擎");
    const fit = s.chapters[0]!.entries.find((e) => e.id === "fitloop")!;
    expect(grewFrom(fit, "root")).toBe("one answer to the question");
  });
  it("says how it grew when the link says so", () => {
    const t = systema([
      { id: "r", label: "Q", parents: [], step: 1, by: "A" },
      { id: "a", label: "Idea", parents: ["r"], step: 1, by: "A", natures: { r: "answers" } },
      { id: "b", label: "Doubt", parents: ["a"], step: 2, by: "B", natures: { a: "challenges" } },
    ]);
    expect(t.chapters.flatMap((c) => c.entries).map((e) => grewFrom(e, "r"))).toEqual(["", "answers Q", "challenges Idea"]);
  });
});
