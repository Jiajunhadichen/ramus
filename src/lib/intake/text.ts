import type { DraftMessage, Hidden } from "./types";
import { plain, toLines, ws, zonedToUtc, type Line } from "./util";
import { nameShape } from "./names";

export type Unit = Omit<DraftMessage, "segment" | "externalId"> & { externalId?: string };

// ---------- set-aside vocabulary ----------
const MEDIA = /^(?:<media omitted>|<médias omis>|<medien ausgeschlossen>|<media utelämnat>|<bild utelämnad>|<省略影音内容>|<attached: [^>]*>|(?:.*\s)?(?:image|video|audio|sticker|gif|document|contact card) omitted|\[(?:图片|表情|动画表情|语音|视频|文件)\])$/i;
const DELETED = /^(?:this message was deleted|you deleted this message|det här meddelandet raderades|du raderade det här meddelandet|此消息已删除|你删除了此消息|.{0,40}撤回了一条消息)\.?$/i;
const SYSTEM_LINE = /^(?:以下为新消息|[—–-]{1,}\s*new messages\s*[—–-]{1,})$/i;

export function setAside(content: string): Hidden | null {
  const c = ws(content);
  if (!c) return "empty";
  if (MEDIA.test(c)) return "media";
  if (DELETED.test(c)) return "deleted";
  if (SYSTEM_LINE.test(c)) return "system";
  return null;
}

export const tidy = (s: string) => s.replace(/\r/g, "").replace(/^[\s\u200e\u200f\ufeff]+|[\s\u200e\u200f\ufeff]+$/g, "");
export const blank = (l: Line) => !plain(l.text).trim();

/** Close a text message: the words are exactly raw[bodyStart, rawEnd), trimmed. */
export function close(raw: string, lines: Line[], from: number, to: number, bodyStart: number, base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">, forceHidden?: Hidden | null): Unit {
  let last = to;
  while (last > from && blank(lines[last]!)) last--;
  const rawStart = lines[from]!.start;
  const rawEnd = Math.max(lines[last]!.end, bodyStart);
  const content = tidy(raw.slice(bodyStart, rawEnd));
  return { ...base, content, rawStart, rawEnd, bodyStart, hidden: forceHidden ?? setAside(content) };
}

export const noTime = { sentAt: null, precision: "unknown" as const, timeSource: "none" as const, offsetMs: null, parentExternalId: null };

// ---------- WhatsApp ----------
const T = String.raw`(?:(上午|下午)\s*)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?`;
const WA_IOS = new RegExp(String.raw`^\s*\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+${T}\]\s?(.*)$`);
const WA_AND = new RegExp(String.raw`^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+${T}\s+[-–]\s(.*)$`);
/** WhatsApp desktop and web copies put the time first: "[14:02, 17/11/2026] Ana: text". */
const WA_COPY = new RegExp(String.raw`^\s*\[${T},\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})\]\s?(.*)$`);
type WaHead = { a: number; b: number; c: number; aLen: number; cLen: number; half: string | undefined; h: number; mi: number; s: number | null; ap: string | undefined; rest: string; headerText: string };

export function waHeader(line: string): WaHead | null {
  const t = plain(line);
  const m = t.match(WA_IOS) ?? t.match(WA_AND);
  if (m) return { a: +m[1]!, b: +m[2]!, c: +m[3]!, aLen: m[1]!.length, cLen: m[3]!.length, half: m[4], h: +m[5]!, mi: +m[6]!, s: m[7] ? +m[7] : null, ap: m[8], rest: m[9] ?? "", headerText: t.slice(0, t.length - (m[9] ?? "").length).trim() };
  const k = t.match(WA_COPY);
  if (!k) return null;
  return { a: +k[6]!, b: +k[7]!, c: +k[8]!, aLen: k[6]!.length, cLen: k[8]!.length, half: k[1], h: +k[2]!, mi: +k[3]!, s: k[4] ? +k[4] : null, ap: k[5], rest: k[9] ?? "", headerText: t.slice(0, t.length - (k[9] ?? "").length).trim() };
}

export function waDateOrder(heads: WaHead[]): "DMY" | "MDY" | null {
  for (const h of heads) if (h.aLen < 4 && h.a > 12) return "DMY";
  for (const h of heads) if (h.aLen < 4 && h.b > 12) return "MDY";
  return heads.some((h) => h.aLen < 4) ? null : "DMY";
}

/**
 * When every date could be read either way (03/04/26), the order the chat was written in decides:
 * a chat runs forward in time, so the reading that never goes back wins. Null when both run forward.
 */
export function waOrderByTime(heads: WaHead[]): "DMY" | "MDY" | null {
  const ambiguous = heads.filter((h) => h.aLen < 4);
  if (ambiguous.length < 2) return null;
  const backwards = (order: "DMY" | "MDY") => {
    let n = 0, prev = -Infinity;
    for (const h of ambiguous) {
      const [d, mo] = order === "DMY" ? [h.a, h.b] : [h.b, h.a];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return Infinity;
      const y = h.cLen === 2 ? 2000 + h.c : h.c;
      const day = Date.UTC(y, mo - 1, d);
      if (day < prev) n++;
      prev = day;
    }
    return n;
  };
  const dmy = backwards("DMY"), mdy = backwards("MDY");
  return dmy < mdy ? "DMY" : mdy < dmy ? "MDY" : null;
}

export function waWhen(h: WaHead, order: "DMY" | "MDY", tz: string) {
  let y: number, mo: number, d: number;
  if (h.aLen === 4) { y = h.a; mo = h.b; d = h.c; }
  else { y = h.cLen === 2 ? 2000 + h.c : h.c; [d, mo] = order === "DMY" ? [h.a, h.b] : [h.b, h.a]; }
  let hour = h.h;
  const pm = h.half === "下午" || /p/i.test(h.ap ?? "");
  const am = h.half === "上午" || /a/i.test(h.ap ?? "");
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return { iso: zonedToUtc(y, mo, d, hour, h.mi, h.s ?? 0, tz), precision: (h.s == null ? "minute" : "second") as "minute" | "second", y, mo, d, hour };
}

/** "Read more" under a message cut short in a copy: furniture of the page, not words */
export const READ_MORE = /^[\u200e\u200f]*(?:read more|läs mer|阅读更多|閱讀更多|weiterlesen|lire la suite|leer más|…\s*more)$/i;

/** A WhatsApp sender name, not the start of a system line such as: Ana changed the subject to "Plan: v2". */
export const looksLikeName = (n: string) => {
  const t = n.trim();
  return !!t && t.length <= 40 && !/["“”«»„]/.test(t) && t.split(/\s+/).length <= 5;
};

export function parseWhatsApp(raw: string, order: "DMY" | "MDY", tz: string): Unit[] {
  const lines = toLines(raw);
  const out: Unit[] = [];
  let open: { from: number; bodyStart: number; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">; system: boolean } | null = null;
  const flush = (to: number) => { if (open) out.push(close(raw, lines, open.from, to, open.bodyStart, open.base, open.system ? "system" : null)); open = null; };
  lines.forEach((l, i) => {
    const h = waHeader(l.text);
    if (!h) {
      if (READ_MORE.test(plain(l.text).trim())) {
        const who = open ? open.base.speakerLabel : null;
        flush(i - 1);
        out.push({ speakerLabel: who, ...noTime, content: tidy(l.text), rawStart: l.start, rawEnd: l.end, bodyStart: l.start, hidden: "system" });
        return;
      }
      if (!open && !blank(l)) open = { from: i, bodyStart: l.start, base: { speakerLabel: null, ...noTime }, system: false };
      return;
    }
    flush(i - 1);
    const w = waWhen(h, order, tz);
    const time = { sentAt: w.iso, precision: w.iso ? w.precision : ("unknown" as const), timeSource: w.iso ? ("source_export" as const) : ("none" as const), offsetMs: null, parentExternalId: null };
    const nm = h.rest.match(/^([^:]{1,60}?):\s?/);
    if (nm && looksLikeName(nm[1]!)) {
      const body = h.rest.slice(nm[0].length);
      open = { from: i, bodyStart: l.start + l.text.length - body.length, base: { speakerLabel: nm[1]!.trim(), ...time }, system: false };
    } else {
      open = { from: i, bodyStart: l.start + l.text.length - h.rest.length, base: { speakerLabel: null, ...time }, system: true };
    }
  });
  flush(lines.length - 1);
  return out;
}

// ---------- WebVTT / SubRip ----------
const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
const toMs = (t: string) => {
  const [hms, frac = "0"] = t.split(/[.,]/);
  const p = hms!.split(":").map(Number);
  const [h, m, s] = p.length === 3 ? p : [0, p[0]!, p[1]!];
  return ((h! * 60 + m!) * 60 + s!) * 1000 + Number(frac.padEnd(3, "0").slice(0, 3));
};
export type Cue = { speaker: string | null; text: string; startMs: number; endMs: number; from: number; to: number };

export function parseCues(raw: string): Cue[] {
  const lines = toLines(raw);
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    if (blank(lines[i]!)) { i++; continue; }
    let j = i;
    while (j + 1 < lines.length && !blank(lines[j + 1]!)) j++;
    const block = lines.slice(i, j + 1);
    const first = plain(block[0]!.text).trim();
    const ti = block.findIndex((l) => TIMING.test(l.text));
    if (!/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(first) && ti !== -1) {
      const m = block[ti]!.text.match(TIMING)!;
      const textLines = block.slice(ti + 1).map((l) => l.text);
      let speaker: string | null = null;
      const v = textLines[0]?.match(/<v(?:\.[\w.-]+)?\s+([^>]+)>/);
      if (v) speaker = v[1]!.trim();
      let text = ws(textLines.join(" ").replace(/<[^>]+>/g, ""));
      if (!speaker) {
        const z = text.match(/^([^:]{1,40}?):\s+(.*)$/);
        if (z && !/^\d+$/.test(z[1]!.trim())) { speaker = z[1]!.trim(); text = z[2]!; }
      }
      cues.push({ speaker, text, startMs: toMs(m[1]!), endMs: toMs(m[2]!), from: i, to: j });
    }
    i = j + 1;
  }
  return cues;
}

export function mergeCues(cues: Cue[]): Cue[][] {
  const groups: Cue[][] = [];
  for (const c of cues) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (g && prev && prev.speaker === c.speaker && c.startMs - prev.endMs < 3000) g.push(c);
    else groups.push([c]);
  }
  return groups;
}

export function parseVtt(raw: string, recordingStartIso: string | null): Unit[] {
  const lines = toLines(raw);
  return mergeCues(parseCues(raw)).map((g) => {
    const content = g.map((c) => c.text).filter(Boolean).join(" ");
    const offsetMs = g[0]!.startMs;
    const sentAt = recordingStartIso ? new Date(Date.parse(recordingStartIso) + offsetMs).toISOString() : null;
    return {
      speakerLabel: g[0]!.speaker, content, rawStart: lines[g[0]!.from]!.start, rawEnd: lines[g[g.length - 1]!.to]!.end, bodyStart: null,
      sentAt, precision: sentAt ? "second" : "unknown", timeSource: sentAt ? "recording_offset" : "none", offsetMs, parentExternalId: null,
      hidden: content ? null : "empty",
    };
  });
}

// ---------- Transcript blocks ----------
const NM = String.raw`([^\s\d\[\]:：<>][^\[\]:：\n<>]{0,38}?)`;
const CLK = String.raw`(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?\s*[Mm]\.?)?)`;
const SHAPES = {
  "name-date-time": new RegExp(String.raw`^\s*${NM}\s+(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s+${CLK}\s*$`),
  "name-time": new RegExp(String.raw`^\s*${NM}\s+${CLK}\s*$`),
  "time-name": new RegExp(String.raw`^\s*\[(?:(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s+)?${CLK}\]\s+${NM}\s*$`),
  /** Zoom saved captions: "[Ana Lind] 14:02:31" */
  "bracket-name-time": new RegExp(String.raw`^\s*\[${NM}\]\s+${CLK}\s*$`),
  /** Zoom meeting chat: "14:02:31 From Ana Lind to Everyone:" */
  "zoom-chat": new RegExp(String.raw`^\s*${CLK}\s+From\s+${NM}\s+to\s+[^:\n]{1,40}:\s*$`),
} as const;
type Shape = keyof typeof SHAPES;

function headOf(text: string, shape: Shape) {
  const m = plain(text).match(SHAPES[shape]);
  if (!m) return null;
  const h = shape === "time-name" ? { name: m[5]!.trim(), clock: m[4]!, date: m[1] ? ([+m[1], +m[2]!, +m[3]!] as const) : null }
    : shape === "name-time" || shape === "bracket-name-time" ? { name: m[1]!.trim(), clock: m[2]!, date: null }
    : shape === "zoom-chat" ? { name: m[2]!.trim(), clock: m[1]!, date: null }
    : { name: m[1]!.trim(), clock: m[5]!, date: [+m[2]!, +m[3]!, +m[4]!] as const };
  // "November 17, 2026, 1:02PM" heads a Teams transcript; it is a date, not a person speaking at 1:02
  if (/\d{4}/.test(h.name) || /,\s*$/.test(h.name)) return null;
  return h;
}

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, mars: 3, apr: 4, april: 4,
  may: 5, maj: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, augusti: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const two = (n: number) => String(n).padStart(2, "0");
/**
 * The recording start a transcript states in its first lines (Teams .docx: "November 17, 2026, 1:02PM"),
 * as local wall time "YYYY-MM-DDTHH:MM:SS". Only lines before the first speaker count.
 */
export function statedRecordingStart(raw: string): string | null {
  const lines = toLines(raw).slice(0, 6).map((l) => plain(l.text).trim());
  const time = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?`;
  const mdy = new RegExp(String.raw`^([A-Za-zÅÄÖåäö]+)\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(?:at\s+)?${time}$`);
  const dmy = new RegExp(String.raw`^(\d{1,2})\.?\s+([A-Za-zÅÄÖåäö]+)\.?\s+(\d{4}),?\s+(?:kl\.?\s+|at\s+)?${time}$`);
  const iso = new RegExp(String.raw`^(\d{4})-(\d{2})-(\d{2})[ T,]+${time}$`);
  for (const l of lines) {
    let y = 0, mo = 0, d = 0, rest: (string | undefined)[] = [];
    let m = l.match(mdy);
    if (m && MONTHS[m[1]!.toLowerCase()]) { mo = MONTHS[m[1]!.toLowerCase()]!; d = +m[2]!; y = +m[3]!; rest = m.slice(4); }
    else if ((m = l.match(dmy)) && MONTHS[m[2]!.toLowerCase()]) { d = +m[1]!; mo = MONTHS[m[2]!.toLowerCase()]!; y = +m[3]!; rest = m.slice(4); }
    else if ((m = l.match(iso))) { y = +m[1]!; mo = +m[2]!; d = +m[3]!; rest = m.slice(4); }
    else continue;
    let h = +rest[0]!;
    const ap = rest[3]?.toLowerCase();
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) continue;
    return `${y}-${two(mo)}-${two(d)}T${two(h)}:${two(+rest[1]!)}:${two(+(rest[2] ?? 0))}`;
  }
  return null;
}

export function transcriptShape(raw: string): { shape: Shape; count: number } | null {
  const lines = toLines(raw);
  let best: { shape: Shape; count: number } | null = null;
  for (const s of Object.keys(SHAPES) as Shape[]) {
    const count = lines.filter((l) => headOf(l.text, s)).length;
    if (count >= 3 && (!best || count > best.count)) best = { shape: s, count };
  }
  return best;
}

/** "14:02", "2:02 PM", "1:02:03" → [hours, minutes, seconds?]. 12-hour times become 24-hour. */
export const clockParts = (c: string) => {
  const ap = c.match(/([AaPp])\.?\s*[Mm]\.?$/)?.[1]?.toLowerCase();
  const p = c.replace(/\s*[AaPp]\.?\s*[Mm]\.?$/, "").split(":").map(Number);
  if (ap === "p" && (p[0] ?? 0) < 12) p[0] = (p[0] ?? 0) + 12;
  if (ap === "a" && p[0] === 12) p[0] = 0;
  return p;
};

export function parseTranscript(raw: string, tz: string, conversationDate: string | null, recordingStartIso: string | null): { units: Unit[]; offsetMode: boolean; clockOnly: boolean } {
  const lines = toLines(raw);
  const sh = transcriptShape(raw);
  if (!sh) return { units: [], offsetMode: false, clockOnly: false };
  const heads = lines.map((l) => headOf(l.text, sh.shape));
  const firstClock = heads.find(Boolean)?.clock ?? "";
  const offsetMode = sh.shape !== "name-date-time" && !heads.find(Boolean)?.date && /^0{1,2}:/.test(firstClock) && !/[AaPp]\.?\s*[Mm]/.test(firstClock);
  const out: Unit[] = [];
  // lines before the first speaker are the transcript's own heading (title, date, length): set aside, never dropped
  let cur: { from: number; label: string | null; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">; bodyFrom: number; heading?: boolean } | null = null;
  const flush = (to: number) => {
    if (!cur) return;
    const bs = cur.bodyFrom < lines.length ? lines[cur.bodyFrom]!.start : raw.length;
    const u = cur.bodyFrom > to ? { ...cur.base, content: "", rawStart: lines[cur.from]!.start, rawEnd: lines[cur.from]!.end, bodyStart: lines[cur.from]!.end, hidden: "empty" as const } : close(raw, lines, cur.from, to, bs, cur.base);
    out.push(cur.heading && !u.hidden ? { ...u, hidden: "system" } : u);
    cur = null;
  };
  const dateParts = conversationDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  lines.forEach((l, i) => {
    const h = heads[i];
    if (h) {
      flush(i - 1);
      const p = clockParts(h.clock);
      let base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden"> = { speakerLabel: h.name, ...noTime, clock: h.clock };
      if (offsetMode) {
        const [a, b, c] = p.length === 3 ? p : [0, p[0]!, p[1]!];
        const offsetMs = ((a! * 60 + b!) * 60 + c!) * 1000;
        const sentAt = recordingStartIso ? new Date(Date.parse(recordingStartIso) + offsetMs).toISOString() : null;
        base = { ...base, offsetMs, clock: null, sentAt, precision: sentAt ? "second" : "unknown", timeSource: sentAt ? "recording_offset" : "none" };
      } else {
        const day = h.date ?? (dateParts ? [+dateParts[1]!, +dateParts[2]!, +dateParts[3]!] : null);
        const iso = day ? zonedToUtc(day[0]!, day[1]!, day[2]!, p[0]!, p[1]!, p[2] ?? 0, tz) : null;
        if (iso) base = { ...base, sentAt: iso, precision: p.length === 3 ? "second" : "minute", timeSource: h.date ? "source_export" : "user_entered" };
      }
      cur = { from: i, label: h.name, base, bodyFrom: i + 1 };
      return;
    }
    const c = ws(l.text);
    if (c && (SYSTEM_LINE.test(c) || /撤回了一条消息$/.test(c))) {
      flush(i - 1);
      out.push({ speakerLabel: null, ...noTime, content: tidy(l.text), rawStart: l.start, rawEnd: l.end, bodyStart: l.start, hidden: SYSTEM_LINE.test(c) ? "system" : "deleted" });
      return;
    }
    if (!cur && !blank(l)) cur = { from: i, label: null, base: { speakerLabel: null, ...noTime }, bodyFrom: i, heading: !out.some((u) => u.speakerLabel) };
  });
  flush(lines.length - 1);
  return { units: out, offsetMode, clockOnly: !offsetMode && heads.some((h) => h && !h.date) };
}

// ---------- Name lines ----------
export const OFTEN_NOT_PEOPLE = ["note", "nb", "ps", "todo", "step 1", "q", "a", "注意", "备注", "问", "答"];
const LINE = /^(\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?)([^:：\n]{1,40}?)\s*[:：]\s?/;
export const GENERIC = /^(speaker\s*[0-9a-z]{1,3}|说话人\s*\d+|unknown|user|assistant|human|system)$/i;

function lineLabel(text: string) {
  const m = plain(text).match(LINE);
  if (!m) return null;
  const label = m[3]!.trim();
  if (!label || /^(https?|ftp|mailto|file|www)$/i.test(label) || /^[\d\s:.,]+$/.test(label)) return null;
  if (plain(text).slice(m[0].length - 1).startsWith("//")) return null;
  return { label, clock: m[2] ?? null, len: m[0].length };
}

/** Labels that name a participant in so many chats that two uses are enough: the copier, the AI. */
const SELF_OR_AI = /^(?:me|you|i|我|du|jag|claude|chatgpt|gpt(?:-?[\d.o]+)?|gemini|copilot|assistant|user|human|ai)$/i;

export type NameLines = { speakers: Set<string>; doubtful: string[]; labeled: number; filled: number };

/**
 * Which "Label: words" labels are people speaking. Evidence, strongest first:
 * the person's own list (knownVoices: nothing else can speak), people already in the garden or confirmed,
 * then the text itself — a document made of name lines, a run of real names (a copied forum), or a
 * multi-word name or AI/self label used more than once. Headings, phrases and sentences never qualify
 * (names.ts), and a word before a colon in ordinary prose is not a speaker.
 */
export function nameLines(raw: string, known: Set<string> = new Set(), arePeople: string[] = [], notAPerson: string[] = [], only: string[] = []): NameLines {
  const yes = new Set(arePeople.map((s) => s.toLowerCase())), no = new Set(notAPerson.map((s) => s.toLowerCase()));
  const allowed = new Set(only.map((s) => s.trim().toLowerCase()).filter(Boolean));
  const lines = toLines(raw).filter((l) => plain(l.text).trim());
  const labels = lines.map((l) => lineLabel(l.text)?.label ?? null);
  const counts = new Map<string, number>();
  for (const l of labels) if (l) counts.set(l, (counts.get(l) ?? 0) + 1);
  const speakers = new Set<string>();
  const doubtful: string[] = [];
  const shape = new Map([...counts.keys()].map((l) => [l, nameShape(l)]));
  if (allowed.size) {
    // the person said who speaks here: only those labels (or "you"/"我" for "me") are voices
    for (const l of counts.keys()) {
      const k = l.toLowerCase();
      if (!no.has(k) && (allowed.has(k) || (allowed.has("me") && /^(?:you|我|i|jag)$/i.test(l)))) speakers.add(l);
    }
  } else {
    const candidate = (l: string) => {
      const k = l.toLowerCase();
      if (no.has(k)) return false;
      if (OFTEN_NOT_PEOPLE.includes(k) && !yes.has(k)) { if ((counts.get(l) ?? 0) >= 2) doubtful.push(l); return false; }
      return yes.has(k) || known.has(k) || shape.get(l) !== "no";
    };
    const cands = [...counts.keys()].filter(candidate);
    const covered = labels.filter((l) => l && cands.includes(l)).length;
    // 1. the document is an exchange of name lines (Ana: … / Bo: …), so every name-shaped label speaks
    if (cands.length >= 2 && covered * 2 >= lines.length) for (const l of cands) speakers.add(l);
    // 2. otherwise only strong evidence: confirmed names, a multi-word name or an AI/self label used twice
    for (const l of cands) {
      const k = l.toLowerCase(), n = counts.get(l) ?? 0;
      if (yes.has(k) || known.has(k)) speakers.add(l);
      else if (n >= 2 && shape.get(l) === "name" && (l.trim().split(/\s+/).length >= 2 || SELF_OR_AI.test(l))) speakers.add(l);
    }
    // 3. a run of three or more lines in a row that each start with a real name, one of them speaking again (a copied forum)
    for (let i = 0; i < labels.length; ) {
      let j = i;
      while (j < labels.length && labels[j] && shape.get(labels[j]!) === "name" && candidate(labels[j]!)) j++;
      const run = labels.slice(i, j) as string[];
      if (run.length >= 3 && new Set(run).size >= 2 && run.some((l, x) => run.indexOf(l) !== x || speakers.has(l))) for (const l of run) speakers.add(l);
      i = Math.max(j, i + 1);
    }
  }
  return { speakers, doubtful: [...new Set(doubtful)], labeled: labels.filter((l) => l && speakers.has(l)).length, filled: lines.length };
}

/** @deprecated kept for callers outside intake; same evidence as nameLines. */
export function shortExchange(raw: string): Set<string> { return nameLines(raw).speakers; }
export function lineLabels(raw: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of toLines(raw)) { const x = lineLabel(l.text); if (x) counts.set(x.label, (counts.get(x.label) ?? 0) + 1); }
  return counts;
}

export function speakerSet(raw: string, known: Set<string>, arePeople: string[], notAPerson: string[], only: string[] = []) {
  const r = nameLines(raw, known, arePeople, notAPerson, only);
  return { speakers: r.speakers, doubtful: r.doubtful };
}

export function parseLines(raw: string, speakers: Set<string>, tz: string, conversationDate: string | null): Unit[] {
  const lines = toLines(raw);
  const out: Unit[] = [];
  const dp = conversationDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let cur: { from: number; bodyStart: number; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden"> } | null = null;
  const flush = (to: number) => { if (cur) out.push(close(raw, lines, cur.from, to, cur.bodyStart, cur.base)); cur = null; };
  lines.forEach((l, i) => {
    const x = lineLabel(l.text);
    if (/^\s*\d{1,2}:\d{2}:\d{2}\s*$/.test(l.text) && speakers.size) {
      flush(i - 1);
      out.push({ speakerLabel: null, ...noTime, content: l.text.trim(), rawStart: l.start, rawEnd: l.end, bodyStart: l.start, hidden: "system" });
      return;
    }
    if (x && speakers.has(x.label)) {
      flush(i - 1);
      let base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden"> = { speakerLabel: x.label, ...noTime, clock: x.clock };
      if (x.clock && dp) {
        const p = clockParts(x.clock);
        const iso = zonedToUtc(+dp[1]!, +dp[2]!, +dp[3]!, p[0]!, p[1]!, p[2] ?? 0, tz);
        if (iso) base = { ...base, sentAt: iso, precision: p.length === 3 ? "second" : "minute", timeSource: "user_entered" };
      }
      cur = { from: i, bodyStart: l.start + x.len, base };
    } else if (!cur && !blank(l)) {
      cur = { from: i, bodyStart: l.start, base: { speakerLabel: null, ...noTime } };
    }
  });
  flush(lines.length - 1);
  return out;
}

// ---------- Notes ----------
export function parseNotes(raw: string): Unit[] {
  const lines = toLines(raw);
  const out: Unit[] = [];
  let from = -1;
  lines.forEach((l, i) => {
    if (blank(l)) { if (from >= 0) { out.push(close(raw, lines, from, i - 1, lines[from]!.start, { speakerLabel: null, ...noTime })); from = -1; } }
    else if (from < 0) from = i;
  });
  if (from >= 0) out.push(close(raw, lines, from, lines.length - 1, lines[from]!.start, { speakerLabel: null, ...noTime }));
  return out;
}
