import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { decodeText, docxText, htmlText, openFiles } from "./files";
import { prepare } from "./prepare";
import { checkDraft } from "./index";

// jsdom's TextEncoder returns arrays from another realm, which fflate does not recognise; browsers have one realm
const strToU8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
const ctx = { contributors: [], aliases: [], importerContributorId: null, importerName: "Me" };
const WA = "[17/11/2026, 14:02:31] Ana Lind: Ska vi ses imorgon?\n[17/11/2026, 14:03:10] Bo: ‎image omitted\n[17/11/2026, 14:03:15] Bo: Ja!\n";
const docx = (paragraphs: string) =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`),
  });
const p = (...runs: string[]) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs.map((r) => `<w:r><w:t xml:space="preserve">${r}</w:t></w:r>`).join("")}</w:p>`;

describe("opening what apps export", () => {
  it("an iPhone WhatsApp .zip: reads _chat.txt, keeps only the text, leaves media out", () => {
    const zip = zipSync({ "_chat.txt": strToU8(WA), "00000012-PHOTO-2026-11-17.jpg": new Uint8Array([255, 216, 255]), "__MACOSX/._chat.txt": new Uint8Array([0]) });
    const o = openFiles([{ name: "WhatsApp Chat - Ana Lind.zip", bytes: zip }])!;
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.input).toMatchObject({ kind: "text", text: WA });
    expect(o.keep?.name).toBe("WhatsApp Chat - Ana Lind.txt");
    expect(new TextDecoder().decode(o.keep!.bytes)).toBe(WA);
    expect(o.from).toMatch(/1 photo.*left out/);
    const d = prepare(o.input, { timeZone: "Europe/Stockholm" }, ctx);
    expect(d.format).toBe("whatsapp");
    expect(d.title).toBe("WhatsApp Chat   Ana Lind");
    expect(checkDraft(d)).toEqual([]);
  });

  it("a ChatGPT export .zip: opens conversations.json and never keeps the whole export", () => {
    const conv = [{ id: "c1", title: "Naming", create_time: 1, current_node: "b", mapping: {
      a: { id: "a", parent: null, message: { id: "a", author: { role: "user" }, create_time: 2, content: { parts: ["Name?"] } } },
      b: { id: "b", parent: "a", message: { id: "b", author: { role: "assistant" }, create_time: 3, content: { parts: ["Ramus."] } } },
    } }];
    const zip = zipSync({ "conversations.json": strToU8(JSON.stringify(conv)), "chat.html": strToU8("<html/>"), "user.json": strToU8("{}") });
    const o = openFiles([{ name: "export.zip", bytes: zip }])!;
    expect(o.ok && o.keep).toBe(null);
    if (!o.ok) return;
    const d = prepare(o.input, { timeZone: "UTC" }, ctx);
    expect(d.format).toBe("chatgpt");
    expect(d.kept.map((m) => m.content)).toEqual(["Name?", "Ramus."]);
  });

  it("a Slack workspace .zip: each channel is a choice, and the days of a channel join up", () => {
    const day = (ts: string, name: string, text: string) => ({ type: "message", ts, text, user_profile: { real_name: name } });
    const zip = zipSync({
      "users.json": strToU8("[]"), "channels.json": strToU8("[]"),
      "general/2026-11-17.json": strToU8(JSON.stringify([day("1763380000.000100", "Ana", "Plan?")])),
      "general/2026-11-18.json": strToU8(JSON.stringify([day("1763466400.000200", "Bo", "Yes")])),
      "random/2026-11-17.json": strToU8(JSON.stringify([day("1763380100.000300", "Cy", "Lunch")])),
    });
    const o = openFiles([{ name: "Workspace Slack export.zip", bytes: zip }])!;
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    const d = prepare(o.input, { timeZone: "UTC" }, ctx);
    expect(d.format).toBe("slack");
    expect(d.conversations.map((c) => c.title)).toEqual(["#general", "#random"]);
    expect(d.questions[0]!.kind).toBe("pick-conversations");
    const g = prepare(o.input, { timeZone: "UTC", conversations: ["slack:general"] }, ctx);
    expect(g.kept.map((m) => m.content)).toEqual(["Plan?", "Yes"]);
    expect(g.title).toBe("#general");
    // the server receives only the chosen rows and must read them the same way
    const s = prepare({ kind: "json", text: g.sendable }, { timeZone: "UTC", conversations: ["slack:general"] }, ctx);
    expect(s.kept.map((m) => m.externalId)).toEqual(g.kept.map((m) => m.externalId));
  });

  it("a Teams .docx transcript: one line per paragraph, read as a transcript", () => {
    const bytes = docx(
      p("Weekly seminar") + p("November 17, 2026, 1:02PM") + p("45m 3s") +
      p("Ana Lind   0:03") + p("So the question is what we keep.") +
      p("Bo Berg   0:15") + p("Everything ", "&amp; nothing.") +
      p("Ana Lind   1:02") + p("Then let", "&apos;", "s write it down."),
    );
    const o = openFiles([{ name: "Weekly seminar.docx", bytes }])!;
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.input.text).toContain("Bo Berg   0:15\nEverything & nothing.\n");
    const d = prepare(o.input, { timeZone: "UTC" }, ctx);
    expect(d.format).toBe("transcript");
    expect(d.kept.filter((m) => m.speakerLabel).map((m) => [m.speakerLabel, m.offsetMs, m.content])).toEqual([
      ["Ana Lind", 3000, "So the question is what we keep."],
      ["Bo Berg", 15000, "Everything & nothing."],
      ["Ana Lind", 62000, "Then let's write it down."],
    ]);
    expect(o.keep?.name).toBe("Weekly seminar.docx");
  });

  it("docx: tabs and breaks are kept, deleted tracked changes are not text", () => {
    const xml = `<w:p><w:r><w:t>a</w:t><w:tab/><w:t>b</w:t><w:br/><w:t>c</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p><w:p><w:r><w:t>&#x4F60;&#22909;</w:t></w:r></w:p>`;
    expect(docxText(docx(xml))).toBe("a\tb\nc\n你好\n");
    expect(docxText(new Uint8Array([1, 2, 3]))).toBe(null);
  });

  it("decodes UTF-16 and strips byte-order marks", () => {
    const s = "Ana: hej\nBo: 你好\n";
    const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...s].map((c) => c.charCodeAt(0))).buffer)]);
    expect(decodeText(le)).toBe(s);
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(s)]))).toBe(s);
  });

  it("says plainly what it cannot read yet, and why", () => {
    const say = (name: string) => { const o = openFiles([{ name, bytes: new Uint8Array([1]) }])!; return o.ok ? "" : o.reason; };
    expect(say("IMG_0001.HEIC")).toMatch(/screenshots in a later version/);
    expect(say("meeting.m4a")).toMatch(/transcribe recordings in a later version/);
    expect(say("scan.pdf")).toMatch(/no text Ramus can read/);
    expect(say("chat.html")).toMatch(/whole \.zip/);
    const empty = openFiles([{ name: "photos.zip", bytes: zipSync({ "a.jpg": new Uint8Array([1]) }) }])!;
    expect(empty.ok ? "" : empty.reason).toMatch(/no chat, transcript or notes/);
  });

  it("queues further files and reads several .json files as one Slack export", () => {
    const o = openFiles([{ name: "a.txt", bytes: strToU8("Ana: hi\nBo: hey") }, { name: "b.vtt", bytes: strToU8("WEBVTT") }])!;
    expect(o.rest.map((f) => f.name)).toEqual(["b.vtt"]);
    const j = openFiles([{ name: "general/2026-11-17.json", bytes: strToU8("[]") }, { name: "general/2026-11-18.json", bytes: strToU8("[]") }])!;
    expect(j.ok && j.input.files?.length).toBe(2);
  });
});

describe("recording starts that transcripts state themselves", () => {
  it.each([
    ["November 17, 2026, 1:02PM", "2026-11-17T13:02:00"],
    ["Nov 17, 2026, 1:02 PM", "2026-11-17T13:02:00"],
    ["17 november 2026 13:02", "2026-11-17T13:02:00"],
    ["17 November 2026, 13:02:05", "2026-11-17T13:02:05"],
    ["2026-11-17 13:02", "2026-11-17T13:02:00"],
  ])("%s", async (line, want) => {
    const { statedRecordingStart } = await import("./text");
    expect(statedRecordingStart(`Weekly seminar\n${line}\n45m 3s\n\nAna Lind   0:03\nHi`)).toBe(want);
  });
  it("a Teams transcript gets real times from its own start, and the person can still override it", () => {
    const t = "Weekly seminar\nNovember 17, 2026, 1:02PM\n45m 3s\n\nAna Lind   0:03\nHi\nBo Berg   0:15\nHello\nAna Lind   1:02\nBye";
    const d = prepare({ kind: "text", text: t }, { timeZone: "Europe/Stockholm" }, ctx);
    const ana = d.kept.find((m) => m.speakerLabel === "Ana Lind")!;
    expect(ana.sentAt).toBe("2026-11-17T12:02:03.000Z");
    expect(ana.timeSource).toBe("recording_offset");
    expect(d.report.recordingStated).toBe("2026-11-17T13:02:00");
    expect(d.questions.some((q) => q.kind === "recording-start")).toBe(false);
    const o = prepare({ kind: "text", text: t }, { timeZone: "Europe/Stockholm", recordingStart: "2026-11-17T14:00" }, ctx);
    expect(o.kept.find((m) => m.speakerLabel === "Ana Lind")!.sentAt).toBe("2026-11-17T13:00:03.000Z");
    expect(o.report.recordingStated).toBe(null);
  });
});

describe("meeting tools", () => {
  const read = (t: string, o = {}) => prepare({ kind: "text", text: t }, { timeZone: "UTC", ...o }, ctx);
  it("Teams .docx headings are set aside, not unattributed words", () => {
    const d = read("Weekly seminar\nNovember 17, 2026, 1:02PM\n45m 3s\n\nAna Lind   0:03\nHi\nBo Berg   0:15\nHello\nAna Lind   1:02\nBye");
    expect(d.messages[0]!.hidden).toBe("system");
    expect(d.kept.filter((m) => !m.hidden).every((m) => m.speakerLabel)).toBe(true);
    expect(checkDraft(d)).toEqual([]);
  });
  it("Google Meet timestamp lines are markers, set aside between speakers", () => {
    const d = read("Ana Lind: Hello everyone\nBo Berg: Hi\n00:05:00\nAna Lind: Let's start\nBo Berg: Ok");
    expect(d.format).toBe("lines");
    expect(d.messages.map((m) => [m.speakerLabel, m.content, m.hidden])).toEqual([
      ["Ana Lind", "Hello everyone", null], ["Bo Berg", "Hi", null], [null, "00:05:00", "system"], ["Ana Lind", "Let's start", null], ["Bo Berg", "Ok", null],
    ]);
  });
  it("Zoom saved captions and meeting chat", () => {
    const cap = read("[Ana Lind] 14:02:31\nHello\n[Bo Berg] 14:02:40\nHi\n[Ana Lind] 14:03:00\nStart", { conversationDate: "2026-11-17" });
    expect(cap.format).toBe("transcript");
    expect(cap.kept.map((m) => [m.speakerLabel, m.sentAt])).toEqual([["Ana Lind", "2026-11-17T14:02:31.000Z"], ["Bo Berg", "2026-11-17T14:02:40.000Z"], ["Ana Lind", "2026-11-17T14:03:00.000Z"]]);
    const chat = read("14:02:31 From Ana Lind to Everyone:\n\tHello\n14:02:40 From Bo Berg to Everyone:\n\tHi\n14:03:00 From Ana Lind to Everyone:\n\tLink: https://x.y");
    expect(chat.kept.map((m) => [m.speakerLabel, m.content])).toEqual([["Ana Lind", "Hello"], ["Bo Berg", "Hi"], ["Ana Lind", "Link: https://x.y"]]);
  });
});

describe("PDFs and saved web pages", () => {
  it("a PDF whose text was taken out in the browser is read like any text, and the PDF is kept", () => {
    const o = openFiles([{ name: "minutes.pdf", bytes: new Uint8Array([37, 80, 68, 70]), text: "Ana: Shall we keep it?\nBo: Yes.\n" }])!;
    expect(o.ok && o.keep?.type).toBe("application/pdf");
    if (!o.ok) return;
    expect(prepare(o.input, { timeZone: "UTC" }, ctx).kept.map((m) => m.speakerLabel)).toEqual(["Ana", "Bo"]);
  });
  it("a saved chat page: blocks become lines, scripts and entities are handled", () => {
    const html = `<html><head><title>x</title><style>p{}</style></head><body><div class="msg"><span>Ana Lind</span><time>2:02 PM</time><p>Shall we keep the raw&nbsp;text?</p></div><script>var a=1</script><div class="msg"><span>Bo Berg</span><time>2:05 PM</time><p>Yes &amp; always.</p></div><div class="msg"><span>Ana Lind</span><time>2:07 PM</time><p>Ok.</p></div></body></html>`;
    const t = htmlText(html);
    expect(t).not.toMatch(/var a|p\{\}/);
    const d = prepare({ kind: "text", text: t }, { timeZone: "UTC", conversationDate: "2026-11-17" }, ctx);
    expect(d.kept.filter((m) => !m.hidden).map((m) => [m.speakerLabel, m.content])).toEqual([["Ana Lind", "Shall we keep the raw\u00a0text?"], ["Bo Berg", "Yes & always."], ["Ana Lind", "Ok."]]);
  });
});

