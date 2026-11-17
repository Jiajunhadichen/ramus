import { describe, expect, it, vi } from "vitest";
import { checkHarvest, fitMessages, harvestPrompt, parseAnswer, type HarvestInput } from "./harvest";
import { askGardener, GardenerUnavailable } from "./ai";

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
  it("ideas belong to whoever said them, whatever the model claims", () => {
    const c = checkHarvest({ ideas: [idea({ id: "complain", label: "How to complain", origin: "m1", by: "Benjamin" })] }, input);
    expect(c.proposals[0]).toMatchObject({ label: "How to complain", personId: "p-Saloni", originMessageId: "id-1", parent: "root" });
  });
  it("drops ideas without a real origin, from an AI, or already in the garden", () => {
    const c = checkHarvest({ ideas: [
      idea({ id: "a", label: "Ghost", origin: "m99" }),
      idea({ id: "b", label: "Petition", origin: "m5" }),
      idea({ id: "c", label: "living here", origin: "m2" }),
      idea({ id: "d", label: "Fault report", origin: "m2" }),
    ] }, input);
    expect(c.proposals.map((p) => p.label)).toEqual(["Fault report"]);
    expect(c.dropped.map((d) => d.reason)).toEqual(["its origin is not a message in this conversation", "its first words have no human speaker", "it is already in the garden"]);
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
    expect([...c.proposals[0]!.label].length).toBeLessThanOrEqual(24);
    expect(c.proposals[0]!.nature).toBe(null);
    expect(c.proposals.map((p) => p.knot?.kind ?? null)).toEqual([null, "decision", null]);
  });
  it("stages: only the ones used, unknown stage numbers fall to the first", () => {
    const c = checkHarvest({ stages: [{ n: 1, title: "Asking" }, { n: 2, title: "Deciding" }, { n: 3, title: "Unused" }], ideas: [idea({ id: "a", label: "A", stage: 2 }), idea({ id: "b", label: "B", origin: "m2", stage: 9 })] }, input);
    expect(c.stages.map((s) => s.title)).toEqual(["Asking", "Deciding"]);
    expect(c.proposals.map((p) => p.stage)).toEqual([2, 1]);
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
    expect(r.model).toBe("openai/gpt-5.5");
  });
  it("says plainly when credits are used up or the gateway is busy", async () => {
    await expect(askGardener("s", "u", { apiKey: "k", fetchImpl: (async () => new Response("", { status: 402 })) as never })).rejects.toThrow(/allowance for this project is used up/);
    await expect(askGardener("s", "u", { apiKey: "k", fetchImpl: (async () => new Response("", { status: 429 })) as never })).rejects.toThrow(/Try again in a minute/);
  });
});
