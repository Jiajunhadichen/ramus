import { describe, expect, it } from "vitest";
import { lifeOf, replayOrder, thoughtSentence, type Thought } from "./thoughts";

const t = (o: Partial<Thought>): Thought => ({ id: String(o.seq), seq: 0, type: "raised", idea_id: "a", related_idea_id: null, settled_kind: null, person_id: null, occurred_at: null, time_precision: "unknown", rationale: null, origin: "human", confirmed: true, rejected_at: null, ...o });

describe("thought events", () => {
  it("replays known times first by occurred_at, then unknown times in sequence order", () => {
    const list = [t({ seq: 1 }), t({ seq: 2, occurred_at: "2026-02-01T00:00:00Z", time_precision: "day" }), t({ seq: 3, occurred_at: "2026-01-01T00:00:00Z", time_precision: "minute" }), t({ seq: 4 })];
    expect(replayOrder(list).map((x) => x.seq)).toEqual([3, 2, 1, 4]);
  });
  it("leaves rejected events out of replay", () => {
    expect(replayOrder([t({ seq: 1 }), t({ seq: 2, rejected_at: "2026-01-01" })]).map((x) => x.seq)).toEqual([1]);
  });
  it("a time with unknown precision is treated as unknown, never shown", () => {
    const s = thoughtSentence(t({ seq: 1, occurred_at: "2026-01-01T00:00:00Z", time_precision: "unknown" }), { idea: () => "X", person: () => null });
    expect(s).toContain("time unknown");
  });
  it("an idea's life only holds its own events", () => {
    expect(lifeOf([t({ seq: 1 }), t({ seq: 2, idea_id: "b" })], "a").map((x) => x.seq)).toEqual([1]);
  });
  it("settled names its kind", () => {
    expect(thoughtSentence(t({ seq: 1, type: "settled", settled_kind: "ruled_out" }), { idea: () => "X", person: () => "Ana" })).toBe("Ana: “X” settled as an alternative ruled out · time unknown.");
  });
});
