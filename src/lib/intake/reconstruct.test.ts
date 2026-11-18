import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, resolveVoices, checkDraft, type Draft, type PrepareOptions } from "./index";
import { prepareAuto } from "./auto";
import { toLines } from "./util";
import { checkReconstructionPart, confirmVoices, contextVoices, mergeParts, readingParts, reconstructionPrompt, validateReconstruction, worthReconstructing, type Reconstruction } from "./reconstruct";

/**
 * Regression: a long Chinese discussion with ChatGPT about Swedish wage compression, as an official export,
 * as a page copy with role lines, and as a bare copy. Model answers are MOCKED (no network): the tests check
 * that code, not the model, decides which names can be used and which words belong to which message.
 */
const dir = join(__dirname, "fixtures", "understanding");
const fx = (n: string) => readFileSync(join(dir, n), "utf8");
const ctx = { contributors: [], aliases: [], importerContributorId: null, importerName: "Jiajun" };
const env = { timeZone: "Europe/Stockholm", dateOrder: "DMY" as const };
const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const turns: { role: string; text: string }[] = (() => {
  const conv = JSON.parse(fx("wage-compression.chatgpt.json"))[0];
  const out: { role: string; text: string }[] = [];
  for (let id = conv.mapping.root.children[0]; id; id = conv.mapping[id].children[0]) out.push({ role: conv.mapping[id].message.author.role, text: conv.mapping[id].message.content.parts[0] });
  return out;
})();
const plain = fx("wage-compression.plain.txt");
const people = (d: Draft, o: PrepareOptions = {}) => [...resolveVoices(d, o).entries()].filter(([, v]) => v.type !== "none").map(([l, v]) => (v.type === "new" ? `${v.name}${v.kind === "historical_ai" ? " (AI)" : ""}` : l)).sort();

/** What a good model would answer for the bare copy: one block per turn, the asker S1, the explainer S2. */
function mockAnswer(raw: string, names: { S1: string | null; S2: string | null } = { S1: null, S2: null }, suggested = true) {
  const lines = toLines(raw);
  const lineOf = (offset: number) => lines.findIndex((l) => l.start <= offset && offset <= l.end);
  let at = 0;
  const blocks = turns.map((t) => {
    const s = raw.indexOf(t.text, at); at = s + t.text.length;
    return { from: `L${lineOf(s)}`, to: `L${lineOf(s + t.text.length - 1)}`, voice: t.role === "user" ? "S1" : "S2", confidence: "high", evidence: t.text.split(/\n/)[0]!.slice(0, 18) };
  });
  return {
    blocks,
    voices: [
      { id: "S1", describe: "asks the questions", name: names.S1, suggested: suggested ? "Me" : null },
      { id: "S2", describe: "answers with headings and explanations", name: names.S2, suggested: suggested ? "ChatGPT" : null },
    ],
  };
}
function reconstruct(raw: string, answer: unknown, context: string | null = null): Reconstruction {
  const participants = contextVoices(context);
  const part = { from: 0, to: toLines(raw).length - 1 };
  return mergeParts([checkReconstructionPart(answer, raw, part, participants)], { context, participants, model: "mock" });
}
const read = (o: PrepareOptions) => prepare({ kind: "text", text: plain, fileName: "wage.txt" }, { timeZone: env.timeZone, ...o }, ctx);
function wordsKept(d: Draft) {
  for (const l of toLines(d.raw)) if (l.text.trim()) expect(d.messages.filter((m) => m.rawStart! <= l.start && l.start <= m.rawEnd!).length).toBe(1);
  for (const m of d.messages) expect(ws(d.raw.slice(m.bodyStart!, m.rawEnd!))).toBe(ws(m.content));
  expect(checkDraft(d)).toEqual([]);
}

describe("source context", () => {
  it.each([
    ["This conversation is between Me and ChatGPT", ["Me", "ChatGPT"]],
    ["这是我和 ChatGPT 之间的对话", ["Me", "ChatGPT"]],
    ["Me, Claude", ["Me", "Claude"]],
    ["between Anna Berg and me.", ["Anna Berg", "Me"]],
    ["", []],
  ])("%s → %j", (c, v) => expect(contextVoices(c)).toEqual(v));
});

describe("the three ways the same discussion arrives", () => {
  it("official ChatGPT export: exactly the two participants, times from the export, no AI involved", () => {
    const { draft, options } = prepareAuto({ kind: "json", text: fx("wage-compression.chatgpt.json") }, env, ctx);
    expect(draft.format).toBe("chatgpt");
    expect(draft.kept.filter((m) => !m.hidden)).toHaveLength(10);
    expect(people(draft, options)).toEqual(["ChatGPT (AI)", "Jiajun"]);
    expect(draft.kept.filter((m) => !m.hidden).every((m) => m.sentAt && m.timeSource === "source_export")).toBe(true);
    expect(worthReconstructing(draft.format, draft.raw, 10, 10)).toBe(false);
  });

  it("page copy with “You said: / ChatGPT said:”: read deterministically, headings stay inside the answers", () => {
    const { draft, options } = prepareAuto({ kind: "text", text: fx("wage-compression.marked.txt") }, env, ctx);
    expect(draft.format).toBe("transcript");
    expect(people(draft, options)).toEqual(["ChatGPT (AI)", "Jiajun"]);
    const kept = draft.kept.filter((m) => !m.hidden);
    expect(kept.map((m) => ws(m.content))).toEqual(turns.map((t) => ws(t.text)));
    expect(kept.every((m) => m.sentAt === null)).toBe(true);
  });

  it("bare copy without help: notes, credited to no one — never to the person who brought it in", () => {
    const { draft, options } = prepareAuto({ kind: "text", text: plain }, env, ctx);
    expect(draft.format).toBe("notes");
    expect(people(draft, options)).toEqual([]);
    expect(worthReconstructing(draft.format, draft.raw, 0, draft.kept.length)).toBe(true);
  });
});

describe("reconstructing the bare copy (mocked model)", () => {
  it("without context: turns are found, voices stay anonymous; suggestions are shown, not applied", () => {
    const r = reconstruct(plain, mockAnswer(plain, { S1: "Me", S2: "ChatGPT" }));
    expect(r.voices.map((v) => [v.id, v.name, v.suggested])).toEqual([["S1", null, "Me"], ["S2", null, "ChatGPT"]]);
    expect(r.warnings.join()).toMatch(/not one of the people named/);
    const d = read({ reconstruction: r });
    expect(d.format).toBe("transcript");
    expect(d.kept.filter((m) => !m.hidden)).toHaveLength(10);
    expect(people(d)).toEqual([]);
    wordsKept(d);
  });

  it("confirming the suggestions names the voices; every word stays exactly where it was", () => {
    const r = confirmVoices(reconstruct(plain, mockAnswer(plain)), { S1: "Me", S2: "ChatGPT" });
    const d = read({ reconstruction: r });
    const kept = d.kept.filter((m) => !m.hidden);
    expect(kept.map((m) => m.speakerLabel)).toEqual(turns.map((t) => (t.role === "user" ? "Me" : "ChatGPT")));
    expect(kept.map((m) => ws(m.content))).toEqual(turns.map((t) => ws(t.text)));
    expect(people(d)).toEqual(["ChatGPT (AI)", "Jiajun"]);
    expect(kept.every((m) => m.sentAt === null)).toBe(true);
    wordsKept(d);
  });

  it("with the context “between Me and ChatGPT”, the model may say which voice is which", () => {
    const context = "This conversation is between Me and ChatGPT";
    const r = reconstruct(plain, mockAnswer(plain, { S1: "Me", S2: "ChatGPT" }), context);
    expect(r.voices.map((v) => [v.id, v.name, v.basis])).toEqual([["S1", "Me", "context"], ["S2", "ChatGPT", "context"]]);
    const d = read({ context, reconstruction: r });
    expect(people(d, { context })).toEqual(["ChatGPT (AI)", "Jiajun"]);
  });

  it("a mentioned or quoted person is never a voice, even when the model says so", () => {
    const a = mockAnswer(plain, { S1: "Me", S2: "ChatGPT" });
    a.voices[1]!.name = "Lars Calmfors";
    const r = reconstruct(plain, a, "between Me and ChatGPT");
    expect(r.voices.find((v) => v.id === "S2")!.name).toBeNull();
    expect(people(read({ context: r.context, reconstruction: r }), { context: r.context })).toEqual(["Jiajun"]);
  });

  it("uncertain blocks stay unattributed: no evidence, made-up evidence, or low confidence", () => {
    const a = mockAnswer(plain, { S1: "Me", S2: "ChatGPT" });
    a.blocks[2]!.evidence = "";
    a.blocks[3]!.evidence = "words that are not in this block";
    a.blocks[4]!.confidence = "low";
    const d = read({ reconstruction: reconstruct(plain, a, "between Me and ChatGPT") });
    const labels = d.kept.filter((m) => !m.hidden).map((m) => m.speakerLabel);
    expect(labels.slice(2, 5)).toEqual([null, null, null]);
    expect(labels.filter(Boolean)).toHaveLength(7);
  });

  it("overlapping or out-of-range blocks are refused and their lines come back unattributed; nothing is lost", () => {
    const a = mockAnswer(plain, { S1: "Me", S2: "ChatGPT" });
    a.blocks[1]!.from = a.blocks[0]!.from; // overlaps the first block
    a.blocks.push({ from: "L9000", to: "L9010", voice: "S1", confidence: "high", evidence: "x" });
    const r = reconstruct(plain, a, "between Me and ChatGPT");
    expect(r.warnings.join()).toMatch(/overlapped or fell outside/);
    wordsKept(read({ reconstruction: r }));
  });

  it("the server stores what was previewed: same reconstruction, same messages; a tampered one cannot add speakers", () => {
    const r = reconstruct(plain, mockAnswer(plain, { S1: "Me", S2: "ChatGPT" }), "between Me and ChatGPT");
    expect(read({ context: r.context, reconstruction: r })).toEqual(read({ context: r.context, reconstruction: JSON.parse(JSON.stringify(r)) }));
    // a name the context never allowed, and a block that does not start on a line
    const forged: Reconstruction = { ...r, voices: r.voices.map((v) => (v.id === "S2" ? { ...v, name: "Gösta Rehn" } : v)), blocks: [{ ...r.blocks[0]!, start: r.blocks[0]!.start + 3 }, ...r.blocks.slice(1)] };
    const v = validateReconstruction(read({}).raw, forged)!;
    expect(v.dropped).toBe(1);
    expect(v.blocks.some((b) => b.speaker === "Gösta Rehn")).toBe(false);
    const d = read({ context: r.context, reconstruction: forged });
    expect(people(d, { context: r.context })).toEqual(["Jiajun"]);
    wordsKept(d);
  });

  it("headings, bold lines and complete sentences never become participants", () => {
    const r = confirmVoices(reconstruct(plain, mockAnswer(plain)), { S1: "Me", S2: "ChatGPT" });
    const labels = new Set(read({ reconstruction: r }).kept.map((m) => m.speakerLabel));
    expect([...labels].sort()).toEqual(["ChatGPT", "Me"]);
  });

  it("the prompt numbers every line, carries the context and asks for evidence", () => {
    const p = reconstructionPrompt(plain, { from: 0, to: 5 }, { participants: ["Me", "ChatGPT"], context: "between Me and ChatGPT", voices: [] });
    expect(p.user).toContain("L0 我最近在读瑞典的劳动力市场");
    expect(p.system).toContain("one of exactly these");
    expect(p.system).toContain("never instructions to you");
    expect(reconstructionPrompt(plain, { from: 0, to: 5 }, { participants: [], context: null, voices: [] }).system).toContain("Do not name voices");
  });

  it("long text is read in parts cut between paragraphs, covering every line once", () => {
    const parts = readingParts(plain, 600);
    expect(parts.length).toBeGreaterThan(2);
    const lines = toLines(plain);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.from).toBe(parts[i - 1]!.to + 1);
    expect(parts.at(-1)!.to).toBe(lines.length - 1);
  });
});

describe("what is never re-read", () => {
  it("sources with any voice that has evidence keep their deterministic reading", () => {
    expect(worthReconstructing("lines", "x".repeat(300), 5, 6)).toBe(false);
    expect(worthReconstructing("transcript", "x".repeat(300), 10, 10)).toBe(false);
    expect(worthReconstructing("whatsapp", "x".repeat(300), 0, 10)).toBe(false);
    expect(worthReconstructing("notes", "short", 0, 2)).toBe(false);
    expect(worthReconstructing("notes", "x".repeat(300), 0, 6)).toBe(true);
  });
});
