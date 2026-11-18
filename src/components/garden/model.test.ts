import { describe, expect, it } from "vitest";
import { toIdeas, type GardenData } from "./model";

/** A corrected author changes the colour and the credit together, because both come from the contributor. */
describe("who an idea came from", () => {
  const base = {
    contributors: [{ id: "c-me", name: "Jiajun", color: "#2f6b4f" }, { id: "c-ai", name: "ChatGPT", color: "#a0522d" }],
    links: [], convMessages: [], evidence: [], suggestions: {}, steps: [],
  };
  const idea = (contributor_id: string | null) => ({ id: "i1", key: "k1", label: "Wage compression", note: "", step: 1, status: "growing", is_knot: false, is_outcome: false, contributor_id, origin: "ai", confirmed: true, settled: null });
  const one = (d: object) => toIdeas(d as unknown as GardenData)[0]!;

  it("follows the contributor for colour and name, and unknown authors are neutral ink", () => {
    expect(one({ ...base, ideas: [idea("c-ai")] })).toMatchObject({ by: "ChatGPT", color: "#a0522d", contributorId: "c-ai", authorCorrected: false });
    expect(one({ ...base, ideas: [idea(null)] })).toMatchObject({ by: "Unknown", color: "var(--muted-ink)", contributorId: null });
  });

  it("marks a person's correction, whichever way it went", () => {
    expect(one({ ...base, ideas: [idea("c-me")], correctedIdeaIds: ["i1"] })).toMatchObject({ by: "Jiajun", color: "#2f6b4f", authorCorrected: true });
  });
});
