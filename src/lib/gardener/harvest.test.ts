import { describe, expect, it, vi } from "vitest";
import { checkHarvest, checkThoughtCandidates, thoughtCandidatePrompt, rootNameEquivalent, withBasis, fitMessages, harvestPrompt, parseAnswer, type HarvestInput, shorten, MAX_KNOTS, MAX_STAGES, brokenBroom, crowdedRoot, regrowNote } from "./harvest";
import { askGardener, GARDENER_MODELS, GardenerUnavailable } from "./ai";

const msg = (n: number, speaker: string, content: string, human = true) => ({
  ref: `m${n}`, id: `id-${n}`, speaker, personId: human ? `p-${speaker}` : `ai-${speaker}`, personIsHuman: human, sentAt: `2026-11-17T13:${String(n).padStart(2, "0")}:00Z`, content,
});
const input: HarvestInput = {
  gardenTitle: "Dorm", conversationTitle: "Laundry", rootKey: "root", skipped: 0,
  ideas: [{ key: "root", label: "Living here", note: "", by: "Me", parents: [], status: "growing", knot: false }],
  messages: [
    msg(1, "Saloni", "Is there a way to complain about the dryers that don't work?"),
    msg(2, "Benjamin", "Submit a fault report. The drying cabinets are bad in general."),
    msg(3, "Lea", "We should do something about it!"),
    msg(4, "Benjamin", "The more people report, the more likely they fix it. We may get a rent reduction, so report report report!"),
    msg(5, "ChatGPT", "You could start a petition.", false),
  ],
};
const idea = (o: Record<string, unknown>) => ({ id: "x", label: "L", note: "n", origin: "m1", quote: null, evidence: [], parent: "root", nature: "answers", why: "w", merges: [], status: "growing", knot: null, stage: 1, ...o });

describe("checking what the gardener proposes", () => {
  it("collects grounded thought candidates before inferring relationships", () => {
    const first = input.messages[0]!;
    const prompt = thoughtCandidatePrompt(input);
    expect(prompt.system).toContain("NOT a graph");
    const result = checkThoughtCandidates({ candidates: [
      { origin: first.ref, quote: first.content.slice(0, 18), kind: "proposal", claim: "Repair the dryers" },
      { origin: first.ref, quote: "something not in the message", kind: "proposal", claim: "Invented" },
      { origin: "m99", quote: "nonsense", kind: "proposal", claim: "Ghost" },
    ] }, input);
    expect(result).toHaveLength(1);
    expect(result[0]!.origin).toBe(first.ref);
  });
  it("can attach later support or challenge to an existing earlier idea", () => {
    const checked = checkHarvest({ ideas: [], reactions: [
      { key: "root", m: "m2", role: "supports" },
      { key: "root", m: "m3", role: "challenges" },
      { key: "not-existing", m: "m2", role: "supports" },
    ] }, input);
    expect(checked.reactions.map(r => r.role)).toEqual(["supports", "challenges"]);
  });
  it("does not repeat the newly named question as a second descendant", () => {
    expect(rootNameEquivalent("Packaging PEP discovery", "Discover packaging PEPs")).toBe(true);
    const fresh = { ...input, nameRoot: true };
    const checked = checkHarvest({
      root: { label: "Dryer complaints", origin: "m1" },
      ideas: [idea({ label: "Dryer complaints", origin: "m1" }), idea({ id: "repair", label: "Fault report", origin: "m2" })],
    }, fresh);
    expect(checked.proposals.map(p => p.label)).toEqual(["Fault report"]);
  });

  it("ideas belong to whoever said them, whatever the model claims", () => {
    const c = checkHarvest({ ideas: [idea({ id: "complain", label: "How to complain", origin: "m1", by: "Benjamin" })] }, input);
    expect(c.proposals[0]).toMatchObject({ label: "How to complain", personId: "p-Saloni", originMessageId: "id-1", parent: "root" });
  });
  it("drops ideas without a real origin or already in the garden", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "a", label: "Ghost", origin: "m99" }),
      idea({ id: "c", label: "living here", origin: "m2" }),
      idea({ id: "d", label: "Fault report", origin: "m2" }),
    ] }, input);
    expect(c.proposals.map((p) => p.label)).toEqual(["Fault report"]);
    expect(c.dropped.map((d) => d.reason)).toEqual(["its origin is not a message in this conversation", "it is already in the garden"]);
  });
  it("an AI taking part in the conversation owns what it said; a message with no known speaker is credited to no one", () => {
    const c = checkHarvest({ ideas: [idea({ id: "b", label: "Petition", origin: "m5", by: "Benjamin" })] }, input);
    expect(c.proposals[0]).toMatchObject({ label: "Petition", personId: "ai-ChatGPT", originMessageId: "id-5" });
    expect(harvestPrompt(input).user).toContain("m5 [2026-11-17 13:05] ChatGPT (AI): You could start a petition.");
    const nobody = { ...input, messages: input.messages.map((m) => (m.ref === "m3" ? { ...m, personId: null } : m)) };
    // notes and articles have no known author: the idea is kept, credited to no one, never to a guessed person
    const kept = checkHarvest({ ideas: [idea({ id: "x", label: "Act", origin: "m3" })] }, nobody);
    expect(kept.dropped).toEqual([]);
    expect(kept.proposals[0]).toMatchObject({ label: "Act", personId: null });
  });
  it("keeps a quote only if it is word for word in the origin message", () => {
    const c = checkHarvest({ ideas: [idea({ id: "a", label: "Report", origin: "m4", quote: "report report report" }), idea({ id: "b", label: "Act", origin: "m3", quote: "we must act now" })] }, input);
    expect(c.proposals.map((p) => p.quote)).toEqual(["report report report", null]);
  });
  it("lineage: unknown parents grow from the root, loops are broken, merges must exist, parents come first", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "child", label: "Rent reduction", origin: "m4", parent: "report", nature: "refines", merges: [{ with: "act", why: "joins Lea's call" }, { with: "nowhere" }] }),
      idea({ id: "report", label: "Fault report", origin: "m2", parent: "complain" }),
      idea({ id: "complain", label: "How to complain", origin: "m1", parent: "nope" }),
      idea({ id: "act", label: "Do something", origin: "m3", parent: "act" }),
      idea({ id: "loop1", label: "Loop one", origin: "m3", parent: "loop2" }),
      idea({ id: "loop2", label: "Loop two", origin: "m3", parent: "loop1" }),
    ] }, input);
    const by = Object.fromEntries(c.proposals.map((p) => [p.temp, p]));
    expect(by["complain"]!.parent).toBe("root");
    expect(by["act"]!.parent).toBe("root");
    expect(by["child"]!.merges.map((m) => m.target)).toEqual(["act"]);
    expect([by["loop1"]!.parent, by["loop2"]!.parent]).toContain("root");
    const order = c.proposals.map((p) => p.temp);
    expect(order.indexOf("complain")).toBeLessThan(order.indexOf("report"));
    expect(order.indexOf("report")).toBeLessThan(order.indexOf("child"));
  });
  it("labels are names: long ones are cut to 24 characters; combines needs merges; knots are strict", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "a", label: "Submit a fault report to the housing company", origin: "m2", nature: "combines" }),
      idea({ id: "b", label: "Report", origin: "m4", knot: { kind: "decision", settled: "Everyone reports broken machines." } }),
      idea({ id: "c", label: "Bad knot", origin: "m3", knot: { kind: "vibes", settled: "x" } }),
    ] }, input);
    expect(c.proposals[0]!.label).toBe("Submit a fault report");
    expect(c.proposals[0]!.nature).toBe(null);
    expect(c.proposals.map((p) => p.knot?.kind ?? null)).toEqual([null, "decision", null]);
  });
  it("long labels are cut between words, Chinese labels by characters", () => {
    expect(shorten("Socket overload trips fuses")).toBe("Socket overload trips");
    expect(shorten("Venus Beauty recommendation")).toBe("Venus Beauty");
    expect(shorten("Shoulder-month heat cycling")).toBe("Shoulder-month heat");
    expect(shorten("Supercalifragilisticexpialidocious")).toHaveLength(24);
    expect([...shorten("宿舍洗衣机坏了大家一起向房东报修然后等待回复再说")]).toHaveLength(24);
  });
  it("stages: only the ones used, unknown stage numbers fall to the first", () => {
    const c = checkHarvest({ stages: [{ n: 1, title: "Asking" }, { n: 2, title: "Deciding" }, { n: 3, title: "Unused" }], ideas: [idea({ id: "a", label: "A", stage: 2 }), idea({ id: "b", label: "B", origin: "m2", stage: 9 })] }, input);
    // "Deciding" begins with m1, before "Asking" begins with m2: stages follow the order of the messages
    expect(c.stages.map((s) => s.title)).toEqual(["Deciding", "Asking"]);
    expect(c.proposals.map((p) => p.stage)).toEqual([1, 2]);
  });
  it("order is evidence: a branch never grows from something said after it", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "q", label: "How to complain", origin: "m1" }),
      idea({ id: "report", label: "Fault report", origin: "m2", parent: "rent", nature: "refines", merges: [{ with: "act" }] }),
      idea({ id: "rent", label: "Rent reduction", origin: "m4", parent: "q", merges: [{ with: "act" }] }),
      idea({ id: "act", label: "Do something", origin: "m3", parent: "rent" }),
    ] }, input);
    const by = new Map(c.proposals.map((p) => [p.label, p]));
    // m2 cannot grow from m4: it moves up to where m4 grew from, which was said before it
    expect(by.get("Fault report")).toMatchObject({ parent: "q", nature: null });
    expect(by.get("Fault report")!.why).toMatch(/order of the messages/);
    expect(by.get("Do something")).toMatchObject({ parent: "q" });
    expect(by.get("Fault report")!.merges).toEqual([]);
    // merging with something said earlier is fine
    expect(by.get("Rent reduction")!.merges.map((m) => m.target)).toEqual(["act"]);
    expect(c.proposals.map((p) => p.label).indexOf("Do something")).toBeLessThan(c.proposals.map((p) => p.label).indexOf("Rent reduction"));
  });
  it("an idea already on the tree that was said later is not a parent for older words", () => {
    const later = { ...input, ideas: [...input.ideas, { key: "petition", label: "Petition", note: "", by: "Lea", parents: ["root"], status: "growing", knot: false, at: "2026-11-20T10:00:00Z" }] };
    const c = checkHarvest({ ideas: [idea({ id: "a", label: "Fault report", origin: "m2", parent: "petition" })] }, later);
    expect(c.proposals[0]!.parent).toBe("root");
    const earlier = { ...input, ideas: [...input.ideas, { key: "petition", label: "Petition", note: "", by: "Lea", parents: ["root"], status: "growing", knot: false, at: "2026-11-10T10:00:00Z" }] };
    expect(checkHarvest({ ideas: [idea({ id: "a", label: "Fault report", origin: "m2", parent: "petition" })] }, earlier).proposals[0]!.parent).toBe("petition");
  });
  it("a knot is settled where the group settled it, never before the idea was raised", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "a", label: "Report", origin: "m2", knot: { kind: "decision", settled: "Everyone reports.", m: "m4" } }),
      idea({ id: "b", label: "Act", origin: "m3", knot: { kind: "decision", settled: "We act.", m: "m1" } }),
    ] }, input);
    expect(c.proposals.map((p) => p.knot?.messageId)).toEqual(["id-4", null]);
  });
  it("a new garden's root is named by the gardener, its words owned by whoever said them", () => {
    const fresh = { ...input, nameRoot: true };
    expect(harvestPrompt(fresh).user).toMatch(/only a placeholder/);
    expect(checkHarvest({ root: { label: "How to complain about the dryers", note: "n", origin: "m1" }, ideas: [] }, fresh).root)
      .toMatchObject({ label: "How to complain about", personId: "p-Saloni", originMessageId: "id-1" });
    expect(checkHarvest({ root: { label: "Dorm life", origin: null }, ideas: [] }, fresh).root).toMatchObject({ label: "Dorm life", personId: null, originMessageId: null });
    expect(checkHarvest({ root: { label: "Dorm life" }, ideas: [] }, input).root).toBe(null);
  });
  it("several sources read as one stream name their source; parts say which part", () => {
    const two = { ...input, part: { n: 2, of: 3 }, messages: input.messages.map((m, i) => ({ ...m, source: i < 2 ? "WhatsApp" : "Meeting" })) };
    const u = harvestPrompt(two).user;
    expect(u).toContain("m3 [2026-11-17 13:03] (Meeting) Lea:");
    expect(u).toContain("part 2 of 3");
    expect(harvestPrompt(input).user).not.toContain("(Meeting)");
  });
  describe("going back to an earlier point", () => {
    const grown: HarvestInput = { ...input, ideas: [
      ...input.ideas,
      { key: "fabric", label: "Fabric choice", note: "", by: "Ana", parents: ["root"], status: "growing", knot: false },
      { key: "cotton", label: "Organic cotton", note: "", by: "Bo", parents: ["fabric"], status: "growing", knot: false },
      { key: "final", label: "Final sample", note: "", by: "Ana", parents: ["cotton"], status: "growing", knot: true },
    ] };
    it("records where the group went back to, why, and what it set aside", () => {
      const c = checkHarvest({
        returns: [{ to: "fabric", m: "m2", why: "the cost won't come down", set_aside: ["final", "cotton", "root", "fabric", "nope"] }],
        ideas: [idea({ id: "linen", label: "Linen blend", origin: "m3", parent: "final" }), idea({ id: "early", label: "Polish it", origin: "m1", parent: "final" })],
      }, grown);
      expect(c.returns).toEqual([{ to: "fabric", messageId: "id-2", personId: "p-Benjamin", why: "the cost won't come down", setAside: ["final", "cotton"] }]);
      const by = new Map(c.proposals.map((p) => [p.label, p]));
      // what was said after going back grows from the point they went back to, never from what they left
      expect(by.get("Linen blend")).toMatchObject({ parent: "fabric", nature: null });
      expect(by.get("Linen blend")!.why).toMatch(/went back: the cost won't come down/);
      // what was said before still grows where it grew
      expect(by.get("Polish it")!.parent).toBe("final");
    });
    it("only ideas in the garden can be gone back to", () => {
      expect(checkHarvest({ returns: [{ to: "ghost", m: "m2" }], ideas: [] }, grown).returns).toEqual([]);
    });
    it("when the people say where it picks up, that return is kept even if the model missed it", () => {
      const told = { ...grown, resumeFrom: "cotton", told: "Product said the cost won't come down; we're back at the cotton." };
      const p = harvestPrompt(told).user;
      expect(p).toContain('pick up again from "cotton"');
      expect(p).toContain("Product said the cost");
      const c = checkHarvest({ returns: [], ideas: [] }, told);
      expect(c.returns).toEqual([{ to: "cotton", messageId: "id-1", personId: "p-Saloni", why: "Product said the cost won't come down; we're back at the cotton.", setAside: [] }]);
    });
  });
  it("reads answers wrapped in a code fence or prose", () => {
    expect(parseAnswer('```json\n{"ideas":[]}\n```')).toEqual({ ideas: [] });
    expect(parseAnswer('Here you go: {"ideas":[]} hope it helps')).toEqual({ ideas: [] });
    expect(() => parseAnswer("no json")).toThrow(/could not be read/);
  });
  it("the prompt carries the garden, short message refs and marks AI speakers", () => {
    const p = harvestPrompt(input);
    expect(p.user).toContain('The root (the group\'s question) is "root"');
    expect(p.user).toContain("m4 [2026-11-17 13:04] Benjamin: The more people report");
    expect(p.user).toContain("ChatGPT (AI): You could start a petition.");
    expect(p.system).toMatch(/never add ideas of your own/);
  });
  it("long conversations: the latest messages that fit are read", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ content: "x".repeat(100), i }));
    const f = fitMessages(many, 1400);
    expect(f.kept.at(-1)!.i).toBe(49);
    expect(f.skipped + f.kept.length).toBe(50);
    expect(f.skipped).toBeGreaterThan(0);
  });
});

describe("asking the gardener through Lovable's AI gateway", () => {
  const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });
  it("without a key it says the gardener is not set up", async () => {
    await expect(askGardener("s", "u", { apiKey: "" })).rejects.toBeInstanceOf(GardenerUnavailable);
  });
  it("answers, sending the key only to the gateway", async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => { expect(String(init?.headers && (init.headers as Record<string, string>)["Authorization"])).toBe("Bearer k"); return ok('{"ideas":[]}'); });
    const r = await askGardener("s", "u", { apiKey: "k", fetchImpl: f as never });
    expect(r.text).toBe('{"ideas":[]}');
    expect(f.mock.calls[0]![0]).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
  });
  it("retries without JSON mode when that is what the model refused, then tries the next model", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("response_format not supported", { status: 400 }))
      .mockResolvedValueOnce(new Response("unknown model", { status: 404 }))
      .mockResolvedValueOnce(ok("{}"));
    const r = await askGardener("s", "u", { apiKey: "k", fetchImpl: f as never });
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.model).toBe(GARDENER_MODELS[1]);
  });
  it("says plainly when credits are used up or the gateway is busy", async () => {
    await expect(askGardener("s", "u", { apiKey: "k", fetchImpl: (async () => new Response("", { status: 402 })) as never })).rejects.toThrow(/allowance for this project is used up/);
    await expect(askGardener("s", "u", { apiKey: "k", fetchImpl: (async () => new Response("", { status: 429 })) as never })).rejects.toThrow(/Try again in a minute/);
  });
});

describe("how sure a link is", () => {
  it("marks the gardener's reading as inferred and says Likely", () => {
    expect(withBasis("Both are about cost", "inferred")).toEqual({ why: "Likely: Both are about cost", basis: "inferred" });
    expect(withBasis("Likely: same mechanism", "")).toEqual({ why: "Likely: same mechanism", basis: "inferred" });
    expect(withBasis("", "stated")).toEqual({ why: null, basis: "inferred" });
  });
  it("keeps a link the words state as stated", () => {
    expect(withBasis("She replies to it directly", "stated")).toEqual({ why: "She replies to it directly", basis: "stated" });
  });
});

describe("the origin tree's grain", () => {
  const input = { gardenTitle: "g", conversationTitle: "c", rootKey: "root", skipped: 0, ideas: [], messages: [{ ref: "m1", id: "a", speaker: "Me", personId: "p", personIsHuman: true, sentAt: null, content: "x" }] } as unknown as Parameters<typeof harvestPrompt>[0];
  it("asks for every option as its own idea, deep lines, merges, one stage per turn, with a worked example", () => {
    const sys = harvestPrompt(input).system;
    expect(sys).toMatch(/each is its own idea, siblings under the same parent/);
    expect(sys).toMatch(/grows from the latest idea it continues/);
    expect(sys).toMatch(/one stage per question and its answer; up to 8/);
    expect(sys).toMatch(/A worked example of the level of detail/);
    expect(thoughtCandidatePrompt(input).system).toMatch(/each one is its own thought-event/);
  });
  it("keeps up to ten stages and four knots per reading", () => {
    expect(MAX_STAGES).toBe(10);
    expect(MAX_KNOTS).toBe(4);
  });
});

describe("a tree, not a broom", () => {
  const input: HarvestInput = { gardenTitle: "Remote", conversationTitle: "meeting", rootKey: "root", skipped: 0,
    ideas: [{ key: "root", label: "TV remote design", note: "", by: "Me", parents: [], status: "growing", knot: false }],
    messages: Array.from({ length: 9 }, (_, i) => ({ ref: `m${i + 1}`, id: `x${i}`, speaker: "PM", personId: "p", personIsHuman: true, sentAt: null, content: `option number ${i + 1} for the remote` })) };
  const flat = Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, label: `Option ${i + 1}`, note: "n", origin: `m${i + 1}`, quote: `option number ${i + 1}`, parent: "root", nature: "answers", why: "w", basis: "stated", merges: [], status: "growing", knot: null, stage: 1 }));
  it("counts new ideas hanging straight on the root, and asks again with their names", () => {
    const c = checkHarvest({ stages: [{ n: 1, title: "t" }], ideas: flat }, input);
    expect(crowdedRoot(c.proposals, "root")).toHaveLength(8);
    expect(regrowNote(crowdedRoot(c.proposals, "root"))).toMatch(/8 ideas straight from the root \(“Option 1”/);
  });
  it("ideas under a sub-question are not counted", () => {
    const grouped = [{ ...flat[0]!, id: "q", label: "Which power source?", quote: "option number 1" }, ...flat.slice(1).map((x) => ({ ...x, parent: "q" }))];
    const c = checkHarvest({ stages: [{ n: 1, title: "t" }], ideas: grouped }, input);
    expect(crowdedRoot(c.proposals, "root")).toHaveLength(1);
  });
  it("tells the gardener to raise sub-questions as ideas", () => {
    expect(harvestPrompt(input).system).toMatch(/Sub-questions\. When someone raises a sub-question or an agenda item/);
  });
});

describe("good brooms and broken brooms", () => {
  const msg = (i: number, content: string) => ({ ref: `m${i + 1}`, id: `x${i}`, speaker: "PM", personId: "p", personIsHuman: true, sentAt: null, content });
  const at = (k: number, extra: Record<string, unknown> = {}) => ({ id: `o${k}`, label: `Idea ${k}`, note: "n", origin: `m${k + 1}`, quote: `idea ${k}`, parent: "root", nature: "answers", why: "w", basis: "stated", merges: [], status: "growing", knot: null, stage: 1, ...extra });
  const root = [{ key: "root", label: "TV remote design", note: "", by: "Me", parents: [], status: "growing" as const, knot: false }];

  it("a burst of answers to the main question stays a broom: no second reading", () => {
    const input: HarvestInput = { gardenTitle: "g", conversationTitle: "c", rootKey: "root", skipped: 0, ideas: root,
      messages: [msg(0, "What could the remote be?"), ...Array.from({ length: 8 }, (_, i) => msg(i + 1, `idea ${i + 1} for it`)), ...Array.from({ length: 10 }, (_, i) => msg(i + 9, "small talk"))] };
    const c = checkHarvest({ stages: [{ n: 1, title: "Brainstorm" }], ideas: Array.from({ length: 8 }, (_, i) => at(i + 1)) }, input);
    expect(crowdedRoot(c.proposals, "root")).toHaveLength(8);
    expect(brokenBroom(c.proposals, input).reasons).toEqual([]);
  });

  it("ideas raised across many turns of the discussion, all on the root: read again", () => {
    const input: HarvestInput = { gardenTitle: "g", conversationTitle: "c", rootKey: "root", skipped: 0, ideas: root,
      messages: Array.from({ length: 24 }, (_, i) => msg(i, `idea ${i} for it`)) };
    const ideas = [0, 3, 6, 9, 12, 15, 18, 21].map((k, n) => at(k, { stage: (n % 4) + 1 }));
    const c = checkHarvest({ stages: [1, 2, 3, 4].map((n) => ({ n, title: `t${n}` })), ideas }, input);
    expect(brokenBroom(c.proposals, input).reasons.join()).toMatch(/raised in 4 different turns/);
  });

  it("ideas the gardener itself marked as refining something, on the root: read again", () => {
    const input: HarvestInput = { gardenTitle: "g", conversationTitle: "c", rootKey: "root", skipped: 0, ideas: root, messages: Array.from({ length: 9 }, (_, i) => msg(i, `idea ${i} for it`)) };
    const ideas = Array.from({ length: 8 }, (_, i) => at(i + 1, i < 2 ? { nature: "refines" } : {}));
    expect(brokenBroom(checkHarvest({ stages: [{ n: 1, title: "t" }], ideas }, input).proposals, input).reasons.join()).toMatch(/marked as refining or challenging/);
  });

  it("an agenda item some of them answer, not kept as an idea: read again, naming it", () => {
    const messages = [msg(0, "idea 0 for it"), msg(1, "idea 1 for it"), msg(2, "idea 2 for it"), msg(3, "idea 3 for it"), msg(4, "idea 4 for it"), msg(5, "接下来说电池？"), msg(6, "idea 6 for it"), msg(7, "idea 7 for it"), msg(8, "idea 8 for it")];
    const input: HarvestInput = { gardenTitle: "g", conversationTitle: "c", rootKey: "root", skipped: 0, ideas: root, messages };
    const ideas = [0, 1, 2, 3, 4, 6, 7, 8].map((k) => at(k));
    const r = brokenBroom(checkHarvest({ stages: [{ n: 1, title: "t" }], ideas }, input).proposals, input);
    expect(r.reasons.join()).toMatch(/m6 \(“接下来说电池？”\) raises a sub-question/);
    expect(regrowNote(r.crowd, r.reasons)).toMatch(/may stay on the root/);
  });
});
