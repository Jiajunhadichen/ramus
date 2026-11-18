import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, checkDraft, resolveVoices, type Draft, type PrepareOptions } from "./index";
import { prepareAuto } from "./auto";
import { nameShape } from "./names";
import { toLines } from "./util";

/**
 * Acceptance suite for source understanding (fixtures/understanding, ACCEPTANCE_CASES.json):
 * headings, phrases and mentioned people never become speakers; real speakers are all kept;
 * notes are credited to no one unless the person says who wrote them; the words stay exactly as received.
 */
const fx = (n: string) => readFileSync(join(__dirname, "fixtures", "understanding", n), "utf8");
const ctx = { contributors: [], aliases: [], importerContributorId: null, importerName: "Jiajun" };
const env = { timeZone: "Europe/Stockholm", dateOrder: "DMY" as const };
const read = (n: string, o: PrepareOptions = {}) => prepare({ kind: "text", text: fx(n), fileName: n }, { timeZone: env.timeZone, ...o }, ctx);
/** the people this source would add to the garden */
const contributors = (d: Draft, o: PrepareOptions = {}) => [...resolveVoices(d, o).entries()].filter(([, v]) => v.type !== "none").map(([label, v]) => (v.type === "new" ? v.name : label));
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

function wordsKept(d: Draft) {
  // every non-blank line of the original is inside exactly one message, and every message's words are the original's
  for (const l of toLines(d.raw)) if (l.text.trim()) expect(d.messages.filter((m) => m.rawStart! <= l.start && l.start <= m.rawEnd!).length).toBe(1);
  for (const m of d.messages) if (m.bodyStart != null && m.rawEnd != null) expect(ws(m.content)).toBe(ws(d.raw.slice(m.bodyStart, m.rawEnd)));
  expect(checkDraft(d)).toEqual([]);
}

describe("speaker evidence", () => {
  it.each([
    ["三份方向分得很开", "no"], ["LLM 自己给的区间", "no"], ["论文没有试图打开黑箱，而是", "no"], ["理由", "no"], ["风险", "no"], ["模型评价", "no"],
    ["### 第一推荐", "no"], ["**引用", "no"], ["Forum-wide notice", "no"], ["Reason", "no"], ["Step 2", "no"], ["The criteria were provided", "no"],
    ["PDF", "no"], ["CV_Jiajun_Chen_AI.pdf", "no"], ["Pasted text", "no"], ["图片", "no"], ["2 pages", "no"], ["MCP", "maybe"], ["RBAC", "maybe"],
    ["Pradyun Gedam", "name"], ["C.A.M. Gerlach", "name"], ["Me", "name"], ["Claude", "name"], ["Ana Lind", "name"], ["张三", "maybe"], ["ana_l", "maybe"],
  ])("%s → %s", (label, shape) => expect(nameShape(label)).toBe(shape));
});

describe("acceptance: who speaks", () => {
  it("01 unlabeled thesis excerpt: no contributors, no invented times, words kept", () => {
    const d = read("01_thesis_unlabeled_messy.txt");
    expect(d.format).toBe("notes");
    expect(contributors(d)).toEqual([]);
    expect(d.kept.length).toBeGreaterThanOrEqual(10);
    expect(d.kept.every((m) => m.sentAt === null && m.speakerLabel === null)).toBe(true);
    wordsKept(d);
  });

  it("01 with the hint “Me, Claude”: the hint restricts, it never assigns a passage or adds a third voice", () => {
    const o = { knownVoices: ["Me", "Claude"] };
    const d = read("01_thesis_unlabeled_messy.txt", o);
    expect(contributors(d, o)).toEqual([]);
    expect(d.speakers.map((s) => s.label)).toEqual([""]);
  });

  it("02 explicit two-person conversation: exactly Me and Claude; Aron and Mats are only mentioned", () => {
    const d = read("02_thesis_explicit_two_speakers.txt");
    expect(d.format).toBe("lines");
    expect(d.speakers.map((s) => s.label).sort()).toEqual(["Claude", "Me"]);
    expect(d.kept.map((m) => m.speakerLabel)).toEqual(["Me", "Claude", "Me", "Claude", "Me", "Claude", "Me", "Claude"]);
    // Claude is the AI that took part, Me is the person bringing it in
    const v = resolveVoices(d, {});
    expect(v.get("Claude")).toEqual({ type: "new", name: "Claude", kind: "historical_ai" });
    expect(v.get("Me")).toEqual({ type: "new", name: "Jiajun" });
    wordsKept(d);
  });

  it("03 copied webpage: the four people who post speak; navigation and the site notice do not", () => {
    const d = read("03_webpage_copy_messy.txt");
    expect(d.speakers.map((s) => s.label).sort()).toEqual(["Alyssa Coghlan", "C.A.M. Gerlach", "Paul Moore", "Pradyun Gedam"]);
    expect(d.raw).toBe(fx("03_webpage_copy_messy.txt"));
    wordsKept(d);
  });

  it("04 four-person group chat: all four speak, with their times; Aron is only mentioned", () => {
    const d = prepareAuto({ kind: "text", text: fx("04_four_person_group_chat.txt") }, env, ctx).draft;
    expect(d.format).toBe("whatsapp");
    expect(d.speakers.map((s) => s.label).sort()).toEqual(["Ana Lind", "Bo Berg", "Cy Wang", "Dina Ali"]);
    expect(d.kept.filter((m) => m.speakerLabel).every((m) => m.sentAt && m.timeSource === "source_export")).toBe(true);
    expect(contributors(d).some((n) => /aron/i.test(n))).toBe(false);
  });

  it("05 rough notes: kept paragraph by paragraph, credited to no one, no times", () => {
    const d = read("05_unstructured_idea_notes.txt");
    expect(d.format).toBe("notes");
    expect(contributors(d)).toEqual([]);
    expect(d.kept.length).toBe(6);
    expect(d.kept.every((m) => m.sentAt === null)).toBe(true);
    wordsKept(d);
  });

  it("05 with one known voice: the person said who wrote the notes", () => {
    const o = { knownVoices: ["Me"] };
    expect(contributors(read("05_unstructured_idea_notes.txt", o), o)).toEqual(["Jiajun"]);
  });

  it("06 Markdown and colon-rich prose: zero contributors, and the source is still read", () => {
    const d = read("06_markdown_false_speakers.txt");
    expect(contributors(d)).toEqual([]);
    expect(d.kept.length).toBeGreaterThan(0);
    expect(d.questions.filter((q) => q.kind === "unknown-voice" || q.kind === "newcomers")).toEqual([]);
    wordsKept(d);
  });

  it("07 a long copied Claude conversation: headings and argument lines (理由：, 风险：) never become people", () => {
    const d = read("07_claude_copy_long.txt");
    expect(d.format).toBe("notes");
    expect(contributors(d)).toEqual([]);
    expect(d.kept.length).toBeGreaterThanOrEqual(20);
    wordsKept(d);
  });

  it("07 with the hint “Me, Claude”: still nobody is guessed", () => {
    const o = { knownVoices: ["Me", "Claude"] };
    expect(contributors(read("07_claude_copy_long.txt", o), o)).toEqual([]);
  });

  it("a known-voices hint keeps explicit labels and drops every other label", () => {
    const text = "Me: start here\n理由: not a person\nClaude: an answer\n理由: still not a person\nMe: thanks\nClaude: welcome\n";
    const o = { knownVoices: ["Me", "Claude"] };
    const d = prepare({ kind: "text", text }, { readAs: "lines", ...o }, ctx);
    expect(d.speakers.map((s) => s.label).sort()).toEqual(["Claude", "Me"]);
    expect(d.kept.map((m) => m.speakerLabel)).toEqual(["Me", "Claude", "Me", "Claude"]);
  });

  it("no fixture invents a contributor that is a sentence, a heading or a mentioned person", () => {
    const mentioned = /aron|mats|larsson|理由|风险|三份|区间|黑箱|notice|packaging|top replies/i;
    for (const f of ["01_thesis_unlabeled_messy.txt", "02_thesis_explicit_two_speakers.txt", "03_webpage_copy_messy.txt", "04_four_person_group_chat.txt", "05_unstructured_idea_notes.txt", "06_markdown_false_speakers.txt", "07_claude_copy_long.txt"]) {
      const d = prepareAuto({ kind: "text", text: fx(f), fileName: f }, env, ctx).draft;
      for (const name of contributors(d)) expect(name, `${f}: ${name}`).not.toMatch(mentioned);
    }
  });

  it("a printed Claude chat (PDF text): attachment cards (“PDF”) never become a speaker, and paragraphs stay apart", () => {
    // this was the user's test: every message after the CVs was credited to a contributor called “PDF”
    const d = read("claude-print.txt");
    expect(contributors(d)).toEqual([]);
    expect(d.format).toBe("notes");
    expect(d.kept.length).toBeGreaterThanOrEqual(10);
    expect(d.kept.some((m) => m.content.startsWith("这是我的三个简历") && !m.content.includes("看了三份简历"))).toBe(true);
    wordsKept(d);
  });

  it("Discourse topic 14111 (saved from the public API): 39 posts, 12 people, times from the forum, no AI involved", () => {
    const text = readFileSync(join(__dirname, "fixtures", "discourse-topic.json"), "utf8");
    const d = prepare({ kind: "json", text }, { timeZone: "UTC" }, ctx);
    expect(d.format).toBe("discourse");
    expect(d.kept.filter((m) => !m.hidden)).toHaveLength(39);
    expect(d.speakers).toHaveLength(12);
    expect(d.kept.every((m) => m.sentAt && m.timeSource === "source_export")).toBe(true);
    expect(d.kept.some((m) => /security incident|certificate authority/i.test(m.content))).toBe(false);
  });

  it("is deterministic", () => {
    for (const f of ["01_thesis_unlabeled_messy.txt", "03_webpage_copy_messy.txt", "07_claude_copy_long.txt"]) expect(read(f)).toEqual(read(f));
  });
});
