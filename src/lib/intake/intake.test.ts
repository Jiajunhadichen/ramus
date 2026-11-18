import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, checkDraft, resolveVoices, isRealName, type Draft, type PrepareOptions } from "./index";
import { toLines } from "./util";
import { mergeCues, parseCues } from "./text";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const ctx = { contributors: [{ id: "p-ana", name: "Ana" }], aliases: [], importerContributorId: "p-me" };
const run = (n: string, o: PrepareOptions = {}) => prepare({ kind: n.endsWith(".json") ? "json" : "text", text: fx(n), fileName: n }, { timeZone: "Europe/Stockholm", ...o }, ctx);
const TEXT = ["whatsapp-ios.txt", "whatsapp-android.txt", "whatsapp-sv.txt", "whatsapp-us.txt", "whatsapp-ambiguous.txt", "teams.vtt", "zoom.vtt", "sample.srt", "otter.txt", "wechat.txt", "messy.txt", "lines-clock.txt", "notes.txt", "lines-zh.txt", "copy-slack.txt", "copy-discord.txt", "copy-teams.txt", "copy-messenger.txt", "copy-gchat.txt", "copy-telegram.txt", "whatsapp-copy-iso.txt"];
const JSONS = ["chatgpt.json", "claude.json", "slack-day.json"];
const ws = (s: string) => s.replace(/[\u200e\u200f\u202f\u00a0\ufeff]/g, " ").replace(/\s+/g, " ").trim();

function coverage(d: Draft) {
  for (const l of toLines(d.raw)) {
    if (!l.text.trim()) continue;
    const n = d.messages.filter((m) => m.rawStart! <= l.start && l.start <= m.rawEnd!).length;
    const markup = /^(WEBVTT|NOTE|\d+$|.*-->)/.test(l.text.trim());
    if (!(n === 1 || (n === 0 && markup))) return `line not covered once (${n}): ${l.text}`;
  }
  return null;
}

describe("detection", () => {
  it.each([
    ["whatsapp-ios.txt", "whatsapp"], ["whatsapp-android.txt", "whatsapp"], ["whatsapp-sv.txt", "whatsapp"], ["whatsapp-us.txt", "whatsapp"],
    ["teams.vtt", "vtt"], ["zoom.vtt", "vtt"], ["sample.srt", "srt"], ["otter.txt", "transcript"], ["wechat.txt", "transcript"],
    ["messy.txt", "lines"], ["lines-zh.txt", "lines"], ["notes.txt", "notes"], ["chatgpt.json", "chatgpt"], ["claude.json", "claude"], ["slack-day.json", "slack"],
  ])("%s reads as %s", (f, fmt) => expect(run(f).format).toBe(fmt));
});

describe("invariant 1: coverage", () => {
  it.each(TEXT)("%s: every line is markup or in exactly one message", (f) => expect(coverage(run(f))).toBeNull());
});

describe("invariant 2: words unchanged", () => {
  it.each(TEXT.filter((f) => !/\.(vtt|srt)$/.test(f)))("%s: content equals its raw body", (f) => {
    const d = run(f);
    for (const m of d.messages) expect(ws(m.content)).toBe(ws(d.raw.slice(m.bodyStart!, m.rawEnd!)));
    expect(checkDraft(d)).toEqual([]);
  });
  it("VTT merges join cue texts with one space", () => {
    const d = run("teams.vtt");
    const groups = mergeCues(parseCues(fx("teams.vtt")));
    expect(d.messages.map((m) => m.content)).toEqual(groups.map((g) => g.map((c) => c.text).join(" ")));
    expect(d.messages[0]!.content).toBe("Hello there, how are you?");
    expect(d.messages[1]!.content).toBe("Fine, thanks.");
  });
  it("JSON content equals the source field", () => {
    const d = run("chatgpt.json", { conversations: ["c1"] });
    expect(d.messages.filter((m) => !m.hidden).map((m) => m.content)).toEqual(["Why do trees branch?", "To reach light.", "Thanks!"]);
    expect(d.messages.every((m) => m.rawStart === null)).toBe(true);
  });
});

describe("invariant 3: no invented times", () => {
  it("pasted name lines and notes have no time", () => {
    for (const f of ["messy.txt", "notes.txt", "lines-clock.txt", "lines-zh.txt"]) for (const m of run(f).messages) { expect(m.sentAt).toBeNull(); expect(m.timeSource).toBe("none"); }
  });
  it("clock times get a date only from the person", () => {
    const d = run("lines-clock.txt", { conversationDate: "2026-11-17" });
    expect(d.messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
    expect(d.messages[0]!.timeSource).toBe("user_entered");
  });
  it("VTT keeps offsets and gets times only from a recording start", () => {
    expect(run("teams.vtt").messages[1]!.sentAt).toBeNull();
    expect(run("teams.vtt").messages[1]!.offsetMs).toBe(751000);
    const d = run("teams.vtt", { recordingStart: "2026-11-17T10:00:00" });
    expect(d.messages[1]!.sentAt).toBe("2026-11-17T09:12:31.000Z");
    expect(d.messages[1]!.timeSource).toBe("recording_offset");
  });
  it("WhatsApp times are read in the chosen timezone", () => {
    const m = run("whatsapp-ios.txt").messages[0]!;
    expect(m.sentAt).toBe("2026-11-17T13:02:31.000Z");
    expect(m.precision).toBe("second");
    expect(run("whatsapp-us.txt").messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
    expect(run("whatsapp-us.txt").messages[2]!.sentAt).toBe("2026-11-17T22:59:00.000Z");
  });
});

describe("invariant 4: deterministic", () => {
  it.each([...TEXT, ...JSONS])("%s prepares identically twice", (f) => expect(JSON.stringify(run(f, { conversations: ["c1"] }))).toBe(JSON.stringify(run(f, { conversations: ["c1"] }))));
});

describe("invariant 5: same original, same ids", () => {
  it("external ids are stable and unique", () => {
    for (const f of [...TEXT, ...JSONS]) {
      const ids = run(f, { conversations: ["c1"] }).messages.map((m) => m.externalId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(run(f, { conversations: ["c1"] }).messages.map((m) => m.externalId)).toEqual(ids);
    }
  });
});

describe("invariant 6: aliases only for real names", () => {
  it.each(["Speaker 1", "Speaker A", "说话人 1", "Unknown", "user", "assistant", "human"])("%s is not remembered", (l) => expect(isRealName(l, "lines")).toBe(false));
  it("a real name is remembered", () => expect(isRealName("Ana Lind", "vtt")).toBe(true));
});

describe("WhatsApp", () => {
  it("sets aside system, media and deleted lines without dropping them", () => {
    const d = run("whatsapp-ios.txt");
    expect(d.messages.map((m) => m.hidden)).toEqual([null, null, "media", "system", "deleted", null, null]);
    expect(d.messages[1]!.content).toBe("Yes.\nAnd a second line.");
    expect(d.speakers.map((s) => s.label)).toEqual(["Ana", "Bo Lind", "Cy"]);
  });
  it("a two-day chat with a 9-hour gap falls into segments, and unpicked ones are excluded", () => {
    const d = run("whatsapp-ios.txt");
    expect(d.segments.length).toBe(3);
    const k = run("whatsapp-ios.txt", { segments: [0] });
    expect(k.kept.length).toBe(4);
    expect(k.report.excludedSegments.map((s) => s.index)).toEqual([1, 2]);
  });
  it("Swedish deleted line and Android media placeholder are set aside", () => {
    expect(run("whatsapp-sv.txt").messages[1]!.hidden).toBe("deleted");
    expect(run("whatsapp-android.txt").messages[1]!.hidden).toBe("media");
  });
  it("asks the date order only when the data cannot decide", () => {
    expect(run("whatsapp-ios.txt").questions.some((q) => q.kind === "date-order")).toBe(false);
    const q = run("whatsapp-ambiguous.txt").questions.find((x) => x.kind === "date-order");
    expect(q && q.kind === "date-order" && q.sample).toEqual({ DMY: "3 April 2026", MDY: "4 March 2026" });
    expect(run("whatsapp-ambiguous.txt", { dateOrder: "MDY" }).messages[0]!.sentAt).toBe("2026-03-04T09:00:00.000Z");
  });
  it("a chat runs forward in time, so its own order settles day/month when no day is above 12", () => {
    const text = "12/03/2026, 21:40 - Ana: see you\n01/04/2026, 09:00 - Bo: back again\n02/04/2026, 09:05 - Ana: welcome";
    const d = prepare({ kind: "text", text }, { timeZone: "UTC", dateOrder: "MDY" }, ctx);
    expect(d.questions.some((q) => q.kind === "date-order")).toBe(false);
    expect(d.messages.map((m) => m.sentAt?.slice(0, 10))).toEqual(["2026-03-12", "2026-04-01", "2026-04-02"]);
  });
});

describe("transcripts and lines", () => {
  it("Otter offsets and media placeholder", () => {
    const d = run("otter.txt");
    expect(d.messages.map((m) => m.offsetMs)).toEqual([3000, 41000, 72000]);
    expect(d.messages[2]!.hidden).toBe("media");
  });
  it("WeChat: dated headers, sticker, new-messages line and recall", () => {
    const d = run("wechat.txt");
    expect(d.messages.map((m) => m.hidden)).toEqual([null, "media", "system", null, "deleted"]);
    expect(d.messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
  });
  it("messy paste: Note and the URL join the previous message", () => {
    const d = run("messy.txt");
    expect(d.messages.map((m) => m.speakerLabel)).toEqual(["Ana", "Bo", "Ana", "Bo"]);
    expect(d.messages[0]!.content).toContain("https://example.com/x");
  });
  it("a doubtful label used twice becomes a question; the answer decides", () => {
    const raw = "Ana: one\nQ: what?\nBo: two\nQ: why?\nAna: three\nBo: four\n";
    const d = prepare({ kind: "text", text: raw }, {}, ctx);
    expect(d.questions.some((q) => q.kind === "not-a-person" && q.label === "Q")).toBe(true);
    expect(d.messages.map((m) => m.speakerLabel)).toEqual(["Ana", "Bo", "Ana", "Bo"]);
    expect(prepare({ kind: "text", text: raw }, { arePeople: ["Q"] }, ctx).messages.map((m) => m.speakerLabel)).toEqual(["Ana", "Q", "Bo", "Q", "Ana", "Bo"]);
  });
  it("notes: one message per paragraph, credited to no one unless the person says who wrote them", () => {
    const d = run("notes.txt");
    expect(d.messages.map((m) => m.content)).toEqual(["First thought about the garden.\nStill the first.", "Second paragraph.", "Third."]);
    // bringing words in does not make them yours
    expect(resolveVoices(d, {}).get("")).toEqual({ type: "none" });
    expect(d.questions.some((q) => q.kind === "unknown-voice")).toBe(false);
    // one known voice on notes is the person saying who wrote them
    const mine = run("notes.txt", { knownVoices: ["Me"] });
    expect(resolveVoices(mine, {}).get("")).toEqual({ type: "person", id: "p-me" });
  });
});

describe("JSON exports", () => {
  it("ChatGPT: visible thread only, other branches counted, only the chosen conversation is stored", () => {
    const d = run("chatgpt.json", { conversations: ["c1"] });
    expect(d.report.otherBranches).toBe(1);
    expect(d.raw).not.toContain("private stuff");
    expect(d.messages[0]!.hidden).toBe("system");
    expect(d.messages[1]!.sentAt).toBe("2025-11-17T11:46:41.500Z");
    expect(resolveVoices(d, {}).get("assistant")).toEqual({ type: "new", name: "ChatGPT", kind: "historical_ai" });
    expect(run("chatgpt.json").questions[0]!.kind).toBe("pick-conversations");
  });
  it("Claude: human is the importer", () => {
    const d = run("claude.json");
    expect(d.messages.map((m) => m.externalId)).toEqual(["a", "b"]);
    expect(resolveVoices(d, {}).get("human")).toEqual({ type: "person", id: "p-me" });
  });
  it("Slack: joins set aside, threads point to their parent, unknown ids asked", () => {
    const d = run("slack-day.json");
    expect(d.messages.map((m) => m.hidden)).toEqual(["system", null, null]);
    expect(d.messages[2]!.parentExternalId).toBe("1763380100.000200");
    expect(d.questions.some((q) => q.kind === "unknown-voice" && q.label === "U02XYZXYZ")).toBe(true);
  });
});

describe("privacy", () => {
  it("finds and masks phone numbers and emails in original and messages, recorded in the report", () => {
    const d = run("whatsapp-ios.txt");
    const q = d.questions.find((x) => x.kind === "privacy");
    expect(q && q.kind === "privacy" && q.matches.map((m) => m.kind).sort()).toEqual(["email", "phone"]);
    const m = run("whatsapp-ios.txt", { mask: "all" });
    expect(m.raw).toContain("Call me on [phone] or [email]");
    expect(m.messages[6]!.content).toBe("Call me on [phone] or [email]");
    expect(m.report.masked).toEqual({ phone: 1, email: 1 });
    expect(checkDraft(m)).toEqual([]);
  });
  it("does not mistake dates, times or timestamps for phone numbers", () => {
    expect(run("whatsapp-sv.txt").questions.some((q) => q.kind === "privacy")).toBe(false);
    expect(run("slack-day.json").questions.some((q) => q.kind === "privacy")).toBe(false);
  });
});

describe("the server prepares again from what the browser sends", () => {
  it.each([["chatgpt.json", { conversations: ["c1"], mask: "all" as const }], ["whatsapp-ios.txt", { mask: "all" as const, segments: [0, 2] }], ["slack-day.json", {}]])("%s", (f, o) => {
    const browser = run(f, o);
    const server = prepare({ kind: f.endsWith(".json") ? "json" : "text", text: browser.sendable }, { timeZone: "Europe/Stockholm", ...o }, ctx);
    expect(server.kept).toEqual(browser.kept);
    expect(server.raw).toBe(browser.raw);
    expect(server.sendable).not.toContain("private stuff");
  });
});

describe("review fixes (intake 1.0.1)", () => {
  const text = (t: string, o: PrepareOptions = {}) => prepare({ kind: "text", text: t }, { timeZone: "Europe/Stockholm", ...o }, ctx);

  it("a WhatsApp system line with a colon is not a speaker", () => {
    const d = text(`[17/11/2026, 14:02:31] Ana: Plan?\n[17/11/2026, 14:07:00] Ana changed the subject to "Plan: v2"`);
    expect(d.speakers.map((s) => s.label)).toEqual(["Ana"]);
    expect(d.messages[1]!.hidden).toBe("system");
    expect(coverage(d)).toBeNull();
  });

  it("reads WhatsApp desktop copies, which put the time first", () => {
    const d = text(`[14:02, 17/11/2026] Ana Lind: Ska vi ses?\n[14:03, 17/11/2026] Bo: Ja!\nKl 10.`);
    expect(d.format).toBe("whatsapp");
    expect(d.messages.map((m) => [m.speakerLabel, m.content])).toEqual([["Ana Lind", "Ska vi ses?"], ["Bo", "Ja!\nKl 10."]]);
    expect(d.messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
    const us = text(`[2:02 PM, 11/17/2026] Ana: hi\n[2:03 PM, 11/17/2026] Bo: hello`);
    expect(us.messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
    expect(checkDraft(d)).toEqual([]);
  });

  it("reads 12-hour transcript clocks once the day is known", () => {
    const t = "Ana Lind  2:02 PM\nShall we keep it?\nBo Berg  2:03 PM\nYes.\nAna Lind  2:05 PM\nGood.";
    const before = text(t);
    expect(before.format).toBe("transcript");
    expect(before.messages.every((m) => m.sentAt === null)).toBe(true);
    const after = text(t, { conversationDate: "2026-11-17" });
    expect(after.messages[0]!.sentAt).toBe("2026-11-17T13:02:00.000Z");
    expect(after.messages[0]!.timeSource).toBe("user_entered");
  });

  it("a bracketed full date is a stated time and asks for no day", () => {
    const d = text("[2026-11-17 14:02] Ana\nHello\n[2026-11-17 14:03] Bo\nHi\n[2026-11-17 14:04] Ana\nBye");
    expect(d.messages[0]!.timeSource).toBe("source_export");
    expect(d.questions.some((q) => q.kind === "conversation-date")).toBe(false);
  });

  it("labels on set-aside lines only are not voices, and AI roles ask nothing", () => {
    const conv = [{ id: "x", title: "t", create_time: 1, current_node: "c", mapping: {
      r: { id: "r", parent: null, message: { id: "r", author: { role: "system" }, content: { parts: [""] } } },
      a: { id: "a", parent: "r", message: { id: "a", author: { role: "user" }, create_time: 2, content: { parts: ["Hi"] } } },
      b: { id: "b", parent: "a", message: { id: "b", author: { role: "tool" }, create_time: 3, content: { parts: ["search"] } } },
      c: { id: "c", parent: "b", message: { id: "c", author: { role: "assistant" }, create_time: 4, content: { parts: ["Hello"] } } },
    } }];
    const d = prepare({ kind: "json", text: JSON.stringify(conv) }, { timeZone: "UTC" }, ctx);
    expect(d.speakers.map((s) => s.label).sort()).toEqual(["assistant", "user"]);
    expect(d.questions.filter((q) => q.kind === "unknown-voice")).toEqual([]);
  });

  it("an unknown timezone reads times as UTC and says so", () => {
    const d = text(`[17/11/2026, 14:02:31] Ana: hi\n[17/11/2026, 14:03:31] Bo: ok`, { timeZone: "Mars/Olympus" });
    expect(d.questions[0]!.kind).toBe("timezone");
    expect(d.messages[0]!.sentAt).toBe("2026-11-17T14:02:31.000Z");
    expect(d.report.timeZone).toBe("UTC");
  });
});

describe("Original column line lookup", () => {
  it.each(TEXT)("%s: one-pass owners match the per-line search", async (f) => {
    const { lineOwners } = await import("./display");
    const d = run(f);
    const lines = toLines(d.raw);
    const naive = lines.map((l) => d.messages.findIndex((m) => m.rawStart != null && m.rawStart <= l.start && l.start <= m.rawEnd!));
    expect(lineOwners(lines, d.messages)).toEqual(naive);
  });
});

describe("chats copied straight off a page", () => {
  const said = (n: string) => run(n, { conversationDate: "2026-11-17" }).kept.filter((m) => !m.hidden).map((m) => [m.speakerLabel, m.content]);
  const ANA = "Shall we keep the raw text?", BO = "Yes, always keep the raw.";
  it("Slack: avatar names, follow-up times, reactions, threads and the message box", () => {
    const d = run("copy-slack.txt", { conversationDate: "2026-11-17" });
    expect(said("copy-slack.txt")).toEqual([["Ana Lind", ANA], ["Ana Lind", "And the summary too?"], ["Bo Berg", BO + " (edited)"], ["Ana Lind", "Ok, decided."]]);
    expect(d.kept.find((m) => m.content === "And the summary too?")!.sentAt).toBe("2026-11-17T13:03:00.000Z");
    expect(d.messages.filter((m) => m.hidden === "system").map((m) => m.content)).toEqual(["general", "42 members", "Today", "👍", "2", "1 reply", "Last reply today at 2:10 PM", "View thread", "Message #general"]);
  });
  it.each([["copy-discord.txt"], ["copy-gchat.txt"], ["copy-telegram.txt"], ["copy-teams.txt"]])("%s: speakers, words and times", (n) => {
    const d = run(n, { conversationDate: "2026-11-17" });
    expect(d.format).toBe("transcript");
    expect(said(n).map(([s]) => s)).toEqual(n.includes("discord") ? ["Ana", "Bo", "Ana"] : ["Ana Lind", "Bo Berg", "Ana Lind"]);
    expect(said(n)[1]![1]).toBe(BO);
    expect(d.kept.find((m) => !m.hidden)!.sentAt).toBe("2026-11-17T13:02:00.000Z");
  });
  it("Messenger: no times, and “You sent” is the person copying", () => {
    const d = run("copy-messenger.txt");
    expect(said("copy-messenger.txt")).toEqual([["Ana Lind", ANA], ["You", BO], ["Ana Lind", "Ok, decided."]]);
    expect(d.speakers.find((s) => s.label === "You")!.suggested).toEqual({ type: "person", id: "p-me" });
  });
  it("a relative day needs the day it was copied; without it times stay unknown", () => {
    const d = run("copy-discord.txt");
    expect(d.kept.every((m) => m.sentAt === null)).toBe(true);
    expect(d.questions.some((q) => q.kind === "conversation-date")).toBe(true);
  });
  it("short repeated replies are not mistaken for people", () => {
    const d = prepare({ kind: "text", text: "Ana — Today at 2:02 PM\nok\nBo — Today at 2:03 PM\nok\nAna — Today at 2:04 PM\nYes\nYes" }, { timeZone: "UTC" }, ctx);
    expect(d.speakers.map((s) => s.label)).toEqual(["Ana", "Bo"]);
  });
});

describe("a real dorm group chat, copied from WhatsApp", () => {
  it("non-contacts (~ Name) keep their label but join as Name; Read more is set aside; many newcomers ask one quiet line", () => {
    const d = run("whatsapp-copy-iso.txt");
    expect(d.format).toBe("whatsapp");
    expect(d.speakers.map((s) => [s.label, s.suggested])).toEqual([
      ["~ Saloni", { type: "new", name: "Saloni" }], ["~ Ben", { type: "new", name: "Ben" }], ["~ Lea", { type: "new", name: "Lea" }], ["Peter Kel", { type: "new", name: "Peter Kel" }],
    ]);
    expect(d.messages.at(-1)).toMatchObject({ content: "阅读更多", hidden: "system", speakerLabel: "~ Ben" });
    expect(d.questions.filter((q) => q.kind === "unknown-voice")).toEqual([]);
    expect(d.questions.some((q) => q.kind === "newcomers")).toBe(true);
    expect(d.messages[0]!.sentAt).toBe("2026-11-17T13:53:54.000Z");
  });
});

