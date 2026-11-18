import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareAuto } from "../intake/auto";
import { resolveVoices } from "../intake/prepare";
import { checkUnderstanding, forGardener, needsUnderstanding, understandingPrompt, type SemanticMessage } from "../intake/semantic";
import { checkHarvest, checkThoughtCandidates, harvestPrompt, thoughtCandidatePrompt, type HarvestInput } from "./harvest";

/**
 * The whole reading, offline: words brought in → kept messages → structure reading → the gardener's two passes.
 * Model answers are MOCKED here (no network, no key); what is tested is that code, not the model, decides who said
 * what and which quotes count. A real model run needs the Lovable AI gateway and is not part of this suite.
 */
const fx = (n: string) => readFileSync(join(__dirname, "..", "intake", "fixtures", "understanding", n), "utf8");
const env = { timeZone: "Europe/Stockholm", dateOrder: "DMY" as const };
const ctx = { contributors: [], aliases: [], importerContributorId: null, importerName: "Jiajun" };

function bringIn(file: string, knownVoices: string[] = []) {
  const { draft, options } = prepareAuto({ kind: "text", text: fx(file), fileName: file }, env, ctx, { knownVoices });
  const voices = resolveVoices(draft, options);
  // what receiveBatch would store: a contributor only for voices with evidence
  const kept = draft.kept.filter((m) => !m.hidden).map((m, i) => {
    const v = voices.get(m.speakerLabel ?? (draft.format === "notes" ? "" : "\u0000"));
    const name = !v || v.type === "none" ? null : v.type === "new" ? v.name : m.speakerLabel;
    return { ref: `m${i + 1}`, id: `msg-${i + 1}`, content: m.content, speaker: name, personId: name ? `p-${name}` : null, personIsHuman: name !== "Claude", sentAt: m.sentAt };
  });
  return { draft, kept };
}

describe("end to end with a mocked model", () => {
  it("01 unlabeled thesis, hint “Me, Claude”: ideas grow, every one credited to no one, a probable voice kept only as a hint", () => {
    const { draft, kept } = bringIn("01_thesis_unlabeled_messy.txt", ["Me", "Claude"]);
    expect(kept.every((m) => m.personId === null)).toBe(true);
    const sem = { messages: kept.map((m): SemanticMessage => ({ ref: m.ref, id: m.id, content: m.content, speaker: null, basis: "unknown", sentAt: null })), knownVoices: ["Me", "Claude"] };
    expect(needsUnderstanding([draft.format], sem.messages)).toBe(true);
    expect(understandingPrompt(sem).system).toContain("Me, Claude");
    const cv = kept.find((m) => m.content.startsWith("这是我的三个简历"))!;
    const rec = kept.find((m) => m.content.startsWith("### 第二推荐"))!;
    const reading = checkUnderstanding({ source_kind: "mixed", passages: [
      { m: cv.ref, kind: "message", speaker: "Me", confidence: "high" },
      { m: rec.ref, kind: "argument", speaker: "Claude", confidence: "medium" },
      { m: "m1", kind: "heading", speaker: null },
    ], mentioned: ["Aron Larsson"] }, sem, "mock");
    const seen = forGardener(kept, reading).messages.map((m, i) => ({ ...m, ref: `m${i + 1}` }));
    const input: HarvestInput = { gardenTitle: "Thesis", conversationTitle: "notes", rootKey: "root", skipped: 0, messages: seen,
      ideas: [{ key: "root", label: "Which thesis?", note: "", by: "Unknown", parents: [], status: "growing", knot: false }] };
    expect(thoughtCandidatePrompt(input).user).toContain("Unattributed (possibly Me, unconfirmed)");
    const recRef = seen.find((m) => m.id === rec.id)!.ref, cvRef = seen.find((m) => m.id === cv.id)!.ref;
    const candidates = checkThoughtCandidates({ candidates: [
      { origin: recRef, quote: "Multi-criteria decision modelling with LLMs", kind: "revision", claim: "LLM + MCDA moves up after the CVs" },
      { origin: recRef, quote: "a sentence nobody wrote", kind: "proposal", claim: "Invented" },
    ] }, input);
    expect(candidates).toHaveLength(1);
    const checked = checkHarvest({ stages: [{ n: 1, title: "Choosing" }], ideas: [
      { id: "travel", label: "Travel-time calculations", note: "n", origin: "m2", quote: "Travel-time and accessibility calculations", parent: "root", nature: "answers", why: "first recommendation", basis: "stated", merges: [], status: "dormant", knot: null, stage: 1 },
      { id: "mcda", label: "LLM + MCDA thesis", note: "n", origin: recRef, quote: "Multi-criteria decision modelling with LLMs", parent: "root", nature: "answers", why: "the CVs changed the ranking", basis: "inferred", merges: [], status: "growing", knot: null, stage: 1, evidence: [{ m: cvRef, role: "supports" }] },
    ] }, { ...input, candidates });
    expect(checked.proposals.map((p) => p.label)).toEqual(["Travel-time calculations", "LLM + MCDA thesis"]);
    // nobody is credited from a guess, and an inferred link says so
    expect(checked.proposals.every((p) => p.personId === null)).toBe(true);
    expect(checked.proposals[1]).toMatchObject({ basis: "inferred" });
    expect(checked.proposals[1]!.why).toMatch(/^Likely:/);
  });

  it("03 copied page: four voices from the text, page furniture never reaches the gardener, ideas credited to who posted", () => {
    const { kept } = bringIn("03_webpage_copy_messy.txt");
    expect([...new Set(kept.flatMap((m) => (m.speaker ? [m.speaker] : [])))].sort()).toEqual(["Alyssa Coghlan", "C.A.M. Gerlach", "Paul Moore", "Pradyun Gedam"]);
    const sem = { messages: kept.map((m): SemanticMessage => ({ ref: m.ref, id: m.id, content: m.content, speaker: m.speaker, basis: m.speaker ? "explicit_header" : "unknown", sentAt: null })), knownVoices: [] };
    const reading = checkUnderstanding({ source_kind: "copied_webpage", passages: [{ m: "m1", kind: "page_noise" }], warnings: ["The page shows 1 / 39: most posts are missing."] }, sem, "mock");
    const seen = forGardener(kept, reading).messages.map((m, i) => ({ ...m, ref: `m${i + 1}` }));
    const text = seen.map((m) => m.content).join("\n");
    expect(text).not.toMatch(/Skip to main content|Forum-wide notice|2\.9k views|Suggested Topics|Read more/);
    expect(reading.warnings[0]).toMatch(/missing/);
    const input: HarvestInput = { gardenTitle: "PEPs", conversationTitle: "page", rootKey: "root", skipped: 0, messages: seen,
      ideas: [{ key: "root", label: "Packaging PEPs", note: "", by: "Unknown", parents: [], status: "growing", knot: false }] };
    const first = seen.find((m) => m.speaker === "Pradyun Gedam")!;
    const checked = checkHarvest({ stages: [{ n: 1, title: "Options" }], ideas: [
      { id: "index", label: "A dedicated packaging index", note: "n", origin: first.ref, quote: "dedicated index", parent: "root", nature: "answers", why: "w", basis: "stated", merges: [], status: "growing", knot: null, stage: 1 },
    ] }, input);
    expect(checked.proposals[0]).toMatchObject({ personId: "p-Pradyun Gedam" });
  });

  it("05 rough notes: no author, no time, and still several branches can grow", () => {
    const { kept } = bringIn("05_unstructured_idea_notes.txt");
    expect(kept.every((m) => m.personId === null && m.sentAt === null)).toBe(true);
    const input: HarvestInput = { gardenTitle: "Coffee", conversationTitle: "notes", rootKey: "root", skipped: 0, messages: kept,
      ideas: [{ key: "root", label: "A coffee business", note: "", by: "Unknown", parents: [], status: "growing", knot: false }] };
    const ref = (start: string) => kept.find((m) => m.content.startsWith(start))!.ref;
    const checked = checkHarvest({ stages: [{ n: 1, title: "Ways in" }], ideas: [
      { id: "shop", label: "A fixed shop", note: "n", origin: ref("我想开"), quote: "我想开一个咖啡店", parent: "root", nature: "answers", why: "w", basis: "stated", merges: [], status: "dormant", knot: null, stage: 1 },
      { id: "cart", label: "A mobile coffee cart", note: "n", origin: ref("也许"), quote: "移动咖啡车", parent: "shop", nature: "splits", why: "rent is too high", basis: "stated", merges: [], status: "growing", knot: null, stage: 1 },
      { id: "popup", label: "Weekend pop-up", note: "n", origin: ref("另一种"), quote: "周末快闪店", parent: "shop", nature: "splits", why: "w", basis: "stated", merges: [], status: "growing", knot: null, stage: 1 },
      { id: "test", label: "Test demand first", note: "n", origin: ref("先验证"), quote: "先验证真实需求", parent: "popup", nature: "refines", why: "w", basis: "stated", merges: [], status: "growing", knot: null, stage: 1 },
    ] }, input);
    expect(checked.proposals).toHaveLength(4);
    expect(checked.proposals.every((p) => p.personId === null && p.quote)).toBe(true);
  });
});
