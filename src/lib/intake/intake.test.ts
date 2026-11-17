import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, checkDraft, resolveVoices, isRealName, type Draft, type PrepareOptions } from "./index";
import { toLines } from "./util";
import { mergeCues, parseCues } from "./text";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const ctx = { contributors: [{ id: "p-ana", name: "Ana" }], aliases: [], importerContributorId: "p-me" };
const run = (n: string, o: PrepareOptions = {}) => prepare({ kind: n.endsWith(".json") ? "json" : "text", text: fx(n), fileName: n }, { timeZone: "Europe/Stockholm", ...o }, ctx);
const TEXT = ["whatsapp-ios.txt", "whatsapp-android.txt", "whatsapp-sv.txt", "whatsapp-us.txt", "whatsapp-ambiguous.txt", "teams.vtt", "zoom.vtt", "sample.srt", "otter.txt", "wechat.txt", "messy.txt", "lines-clock.txt", "notes.txt", "lines-zh.txt"];
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
  it("notes: one message per paragraph, all from the importer", () => {
    const d = run("notes.txt");
    expect(d.messages.map((m) => m.content)).toEqual(["First thought about the garden.\nStill the first.", "Second paragraph.", "Third."]);
    expect(resolveVoices(d, {}).get("")).toEqual({ type: "person", id: "p-me" });
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
