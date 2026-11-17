import { unzipSync } from "fflate";
import type { PrepareInput } from "./types";

/**
 * Opening what people receive from their apps. Exports rarely arrive as plain text:
 * iPhone WhatsApp exports are .zip files, ChatGPT and Claude exports are .zip files,
 * Teams transcripts are usually .docx. This module finds the words inside, without
 * changing them, and says plainly what it opened and what it left out.
 * Pure and deterministic: bytes in, input out. No network.
 */

/** `text`: words already taken out by the caller (PDFs are read with pdf.js in the browser). */
export type IncomingFile = { name: string; bytes: Uint8Array; type?: string; text?: string };
export type KeptFile = { name: string; bytes: Uint8Array; type: string };
export type Opened =
  | { ok: true; input: PrepareInput; from: string; keep: KeptFile | null; rest: IncomingFile[] }
  | { ok: false; reason: string; rest: IncomingFile[] };

/** Exports with media can be huge; the words are small. */
export const MAX_FILE_BYTES = 400 * 1024 * 1024;

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");
const base = (name: string) => name.split("/").pop() ?? name;
const TEXT_EXT = new Set(["txt", "text", "vtt", "srt", "md", "markdown"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "heic", "heif", "webp", "gif", "bmp", "tif", "tiff"]);
const AUDIO_EXT = new Set(["m4a", "mp3", "wav", "opus", "ogg", "aac", "flac", "mp4", "mov", "webm", "m4v", "amr"]);
const MIME: Record<string, string> = {
  txt: "text/plain", vtt: "text/vtt", srt: "application/x-subrip", md: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};


/** Text from bytes: UTF-8 by default; UTF-16 when a byte-order mark or the zero-byte pattern says so. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes.length >= 4) {
    let oddZeros = 0, evenZeros = 0;
    const n = Math.min(bytes.length, 400);
    for (let i = 0; i < n; i++) if (bytes[i] === 0) (i % 2 ? oddZeros++ : evenZeros++);
    if (oddZeros > n / 4 && evenZeros === 0) return new TextDecoder("utf-16le").decode(bytes);
    if (evenZeros > n / 4 && oddZeros === 0) return new TextDecoder("utf-16be").decode(bytes);
  }
  const t = new TextDecoder("utf-8").decode(bytes);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITY[e.toLowerCase()] ?? all);

/** The visible text of a saved web page: one line per block, scripts and styles left out. */
export function htmlText(html: string): string {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|li|ul|ol|tr|table|h[1-6]|section|article|header|footer|main|aside|blockquote|pre|time)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return unescapeXml(s).split("\n").map((l) => l.replace(/[ \t\u00a0]+$/, "").replace(/^[ \t\u00a0]+/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * The visible text of a Word document: one line per paragraph, tabs and line breaks kept.
 * Deleted tracked changes (w:delText) are not visible text and are left out.
 */
export function docxText(bytes: Uint8Array): string | null {
  let xml: string;
  try {
    const z = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const doc = z["word/document.xml"];
    if (!doc) return null;
    xml = new TextDecoder("utf-8").decode(doc);
  } catch {
    return null;
  }
  const body = xml.slice(Math.max(0, xml.indexOf("<w:body")));
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:(tab|br|cr)(?:\s[^>]*)?\/>|<\/w:p>/g;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m[1] !== undefined) out += unescapeXml(m[1]);
    else if (m[2] === "tab") out += "\t";
    else if (m[2] === "br" || m[2] === "cr") out += "\n";
    else if (m[0] === "</w:p>") out += "\n";
  }
  return out.replace(/\n+$/, "") + "\n";
}

const SLACK_DAY = /(?:^|\/)([^/]+)\/(\d{4}-\d{2}-\d{2})\.json$/;
const WHATSAPP_TXT = /(?:^|\/)(_chat\.txt|WhatsApp[^/]*\.txt)$/i;

/** What a zip holds, without decompressing photos and recordings. */
function zipNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(bytes, { filter: (f) => { if (!f.name.endsWith("/") && !/(^|\/)__MACOSX\//.test(f.name)) names.push(f.name); return false; } });
  return names;
}
function unzipSome(bytes: Uint8Array, wanted: Set<string>): Record<string, Uint8Array> {
  return unzipSync(bytes, { filter: (f) => wanted.has(f.name) });
}

function openZip(f: IncomingFile, rest: IncomingFile[]): Opened {
  let names: string[];
  try { names = zipNames(f.bytes); } catch { return { ok: false, reason: `${f.name} could not be opened as a .zip file.`, rest }; }
  const media = names.filter((n) => IMAGE_EXT.has(ext(n)) || AUDIO_EXT.has(ext(n)) || ext(n) === "pdf").length;
  const left = media ? ` ${media} photo${media === 1 ? "" : "s"}, recording${media === 1 ? "" : "s"} or other file${media === 1 ? "" : "s"} were left out.` : "";

  // ChatGPT and Claude: conversations.json. Only the conversations someone picks are ever sent or kept.
  const conv = names.find((n) => base(n) === "conversations.json");
  if (conv) {
    const text = decodeText(unzipSome(f.bytes, new Set([conv]))[conv]!);
    return { ok: true, input: { kind: "json", text, fileName: conv }, from: `conversations.json from ${f.name}. Only the conversations you pick are kept; the rest of the export stays on your device.`, keep: null, rest };
  }

  // WhatsApp: _chat.txt, kept as the original; media is never uploaded
  const chats = names.filter((n) => WHATSAPP_TXT.test(n));
  const txts = names.filter((n) => ["txt", "vtt", "srt", "md"].includes(ext(n)));
  const one = chats.length === 1 ? chats[0] : txts.length === 1 ? txts[0] : undefined;
  if (one) {
    const bytes = unzipSome(f.bytes, new Set([one]))[one]!;
    const keptName = WHATSAPP_TXT.test(one) && base(one) === "_chat.txt" ? f.name.replace(/\.zip$/i, ".txt") : base(one);
    return { ok: true, input: { kind: "text", text: decodeText(bytes), fileName: f.name }, from: `${base(one)} from ${f.name}.${left}`, keep: { name: keptName, bytes, type: MIME[ext(one)] ?? "text/plain" }, rest };
  }

  // Slack workspace export: channel/2026-11-17.json day files; each channel becomes a choice
  const days = names.filter((n) => SLACK_DAY.test(n));
  if (days.length) {
    const z = unzipSome(f.bytes, new Set(days));
    const files = days.map((n) => { const m = n.match(SLACK_DAY)!; return { name: `${m[1]}/${m[2]}.json`, text: decodeText(z[n]!) }; });
    const channels = new Set(files.map((x) => x.name.split("/")[0]));
    return { ok: true, input: { kind: "json", text: "", files, fileName: f.name }, from: `${files.length} day${files.length === 1 ? "" : "s"} from ${channels.size} channel${channels.size === 1 ? "" : "s"} in ${f.name}.`, keep: null, rest };
  }

  // a single transcript inside a zip
  const docs = names.filter((n) => ext(n) === "docx");
  if (docs.length === 1) {
    const inner = unzipSome(f.bytes, new Set([docs[0]!]))[docs[0]!]!;
    return openOne({ name: base(docs[0]!), bytes: inner }, rest);
  }

  if (txts.length > 1) return { ok: false, reason: `${f.name} holds ${txts.length} text files (${txts.slice(0, 4).map(base).join(", ")}${txts.length > 4 ? ", …" : ""}). Unzip it and bring in the one you mean.`, rest };
  return { ok: false, reason: `${f.name} holds no chat, transcript or notes Ramus can read${names.length ? ` (it holds ${names.slice(0, 3).map(base).join(", ")}${names.length > 3 ? ", …" : ""})` : ""}.`, rest };
}

function openOne(f: IncomingFile, rest: IncomingFile[]): Opened {
  const e = ext(f.name);
  if (f.bytes.length > MAX_FILE_BYTES) return { ok: false, reason: `${f.name} is too large to open here. Export the chat without media, or bring in only the transcript.`, rest };
  if (TEXT_EXT.has(e) || (!e && f.type?.startsWith("text/"))) {
    return { ok: true, input: { kind: "text", text: decodeText(f.bytes), fileName: f.name }, from: f.name, keep: { name: f.name, bytes: f.bytes, type: MIME[e] ?? f.type ?? "text/plain" }, rest };
  }
  if (e === "json") return { ok: true, input: { kind: "json", text: decodeText(f.bytes), fileName: f.name }, from: f.name, keep: null, rest };
  if (e === "docx") {
    const text = docxText(f.bytes);
    if (text === null) return { ok: false, reason: `${f.name} could not be opened as a Word document.`, rest };
    return { ok: true, input: { kind: "text", text, fileName: f.name }, from: `The text of ${f.name}, one line per paragraph.`, keep: { name: f.name, bytes: f.bytes, type: MIME["docx"]! }, rest };
  }
  if (e === "zip") return openZip(f, rest);
  if (IMAGE_EXT.has(e)) return { ok: false, reason: `${f.name} is an image. Ramus will read screenshots in a later version; for now, copy the text and paste it here.`, rest };
  if (AUDIO_EXT.has(e)) return { ok: false, reason: `${f.name} is a recording. Ramus will transcribe recordings in a later version; if your meeting tool made a transcript (.vtt or .docx), bring that in.`, rest };
  if (e === "pdf") {
    if (f.text === undefined || !f.text.trim()) return { ok: false, reason: `${f.name} has no text Ramus can read (it may be a scan). Copy the text and paste it here.`, rest };
    return { ok: true, input: { kind: "text", text: f.text, fileName: f.name }, from: `The text of ${f.name}.`, keep: { name: f.name, bytes: f.bytes, type: "application/pdf" }, rest };
  }
  if (["doc", "rtf", "pages", "odt"].includes(e)) return { ok: false, reason: `${f.name} cannot be read directly. Save it as .docx, or copy the text and paste it here.`, rest };
  if (base(f.name) === "chat.html") return { ok: false, reason: `${f.name} is the page view of a ChatGPT export. Bring in the whole .zip instead.`, rest };
  if (e === "html" || e === "htm" || e === "mhtml") {
    return { ok: true, input: { kind: "text", text: htmlText(decodeText(f.bytes)), fileName: f.name }, from: `The text of ${f.name}.`, keep: { name: f.name, bytes: f.bytes, type: "text/html" }, rest };
  }
  return { ok: false, reason: `Ramus cannot read ${f.name} yet. Copy the text and paste it here.`, rest };
}

/**
 * Open what was received. Several .json files together are read as one Slack export;
 * otherwise the first file is opened and the others wait their turn.
 */
export function openFiles(files: IncomingFile[]): Opened | null {
  if (!files.length) return null;
  if (files.length > 1 && files.every((f) => ext(f.name) === "json")) {
    const list = files.map((f) => ({ name: f.name, text: decodeText(f.bytes) }));
    return { ok: true, input: { kind: "json", text: "", files: list, fileName: list[0]!.name }, from: `${files.length} files`, keep: null, rest: [] };
  }
  const [first, ...rest] = files;
  return openOne(first!, rest);
}
