import type { DraftMessage, Hidden } from "./types";
import { plain, toLines, ws, zonedToUtc, type Line } from "./util";

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

const tidy = (s: string) => s.replace(/\r/g, "").replace(/^[\s\u200e\u200f\ufeff]+|[\s\u200e\u200f\ufeff]+$/g, "");
const blank = (l: Line) => !plain(l.text).trim();

/** Close a text message: the words are exactly raw[bodyStart, rawEnd), trimmed. */
function close(raw: string, lines: Line[], from: number, to: number, bodyStart: number, base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">, forceHidden?: Hidden | null): Unit {
  let last = to;
  while (last > from && blank(lines[last]!)) last--;
  const rawStart = lines[from]!.start;
  const rawEnd = Math.max(lines[last]!.end, bodyStart);
  const content = tidy(raw.slice(bodyStart, rawEnd));
  return { ...base, content, rawStart, rawEnd, bodyStart, hidden: forceHidden ?? setAside(content) };
}

const noTime = { sentAt: null, precision: "unknown" as const, timeSource: "none" as const, offsetMs: null, parentExternalId: null };

// ---------- WhatsApp ----------
const T = String.raw`(?:(上午|下午)\s*)?(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s*[Mm]\.?)?`;
const WA_IOS = new RegExp(String.raw`^\s*\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+${T}\]\s?(.*)$`);
const WA_AND = new RegExp(String.raw`^\s*(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+${T}\s+[-–]\s(.*)$`);
type WaHead = { a: number; b: number; c: number; aLen: number; cLen: number; half: string | undefined; h: number; mi: number; s: number | null; ap: string | undefined; rest: string; headerText: string };

export function waHeader(line: string): WaHead | null {
  const t = plain(line);
  const m = t.match(WA_IOS) ?? t.match(WA_AND);
  if (!m) return null;
  return { a: +m[1]!, b: +m[2]!, c: +m[3]!, aLen: m[1]!.length, cLen: m[3]!.length, half: m[4], h: +m[5]!, mi: +m[6]!, s: m[7] ? +m[7] : null, ap: m[8], rest: m[9] ?? "", headerText: t.slice(0, t.length - (m[9] ?? "").length).trim() };
}

export function waDateOrder(heads: WaHead[]): "DMY" | "MDY" | null {
  for (const h of heads) if (h.aLen < 4 && h.a > 12) return "DMY";
  for (const h of heads) if (h.aLen < 4 && h.b > 12) return "MDY";
  return heads.some((h) => h.aLen < 4) ? null : "DMY";
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

export function parseWhatsApp(raw: string, order: "DMY" | "MDY", tz: string): Unit[] {
  const lines = toLines(raw);
  const out: Unit[] = [];
  let open: { from: number; bodyStart: number; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">; system: boolean } | null = null;
  const flush = (to: number) => { if (open) out.push(close(raw, lines, open.from, to, open.bodyStart, open.base, open.system ? "system" : null)); open = null; };
  lines.forEach((l, i) => {
    const h = waHeader(l.text);
    if (!h) {
      if (!open && !blank(l)) open = { from: i, bodyStart: l.start, base: { speakerLabel: null, ...noTime }, system: false };
      return;
    }
    flush(i - 1);
    const w = waWhen(h, order, tz);
    const time = { sentAt: w.iso, precision: w.iso ? w.precision : ("unknown" as const), timeSource: w.iso ? ("source_export" as const) : ("none" as const), offsetMs: null, parentExternalId: null };
    const nm = h.rest.match(/^([^:]{1,60}?):\s?/);
    if (nm) {
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
const CLK = String.raw`(\d{1,2}:\d{2}(?::\d{2})?)`;
const SHAPES = {
  "name-date-time": new RegExp(String.raw`^\s*${NM}\s+(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\s+${CLK}\s*$`),
  "name-time": new RegExp(String.raw`^\s*${NM}\s+${CLK}\s*$`),
  "time-name": new RegExp(String.raw`^\s*\[${CLK}\]\s+${NM}\s*$`),
} as const;
type Shape = keyof typeof SHAPES;

function headOf(text: string, shape: Shape) {
  const m = plain(text).match(SHAPES[shape]);
  if (!m) return null;
  if (shape === "time-name") return { name: m[2]!.trim(), clock: m[1]!, date: null };
  if (shape === "name-time") return { name: m[1]!.trim(), clock: m[2]!, date: null };
  return { name: m[1]!.trim(), clock: m[5]!, date: [+m[2]!, +m[3]!, +m[4]!] as const };
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

const clockParts = (c: string) => c.split(":").map(Number);

export function parseTranscript(raw: string, tz: string, conversationDate: string | null, recordingStartIso: string | null): { units: Unit[]; offsetMode: boolean; clockOnly: boolean } {
  const lines = toLines(raw);
  const sh = transcriptShape(raw);
  if (!sh) return { units: [], offsetMode: false, clockOnly: false };
  const heads = lines.map((l) => headOf(l.text, sh.shape));
  const firstClock = heads.find(Boolean)?.clock ?? "";
  const offsetMode = sh.shape !== "name-date-time" && /^0{1,2}:/.test(firstClock);
  const out: Unit[] = [];
  let cur: { from: number; label: string | null; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">; bodyFrom: number } | null = null;
  const flush = (to: number) => {
    if (!cur) return;
    const bs = cur.bodyFrom < lines.length ? lines[cur.bodyFrom]!.start : raw.length;
    out.push(cur.bodyFrom > to ? { ...cur.base, content: "", rawStart: lines[cur.from]!.start, rawEnd: lines[cur.from]!.end, bodyStart: lines[cur.from]!.end, hidden: "empty" } : close(raw, lines, cur.from, to, bs, cur.base));
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
    if (!cur && !blank(l)) cur = { from: i, label: null, base: { speakerLabel: null, ...noTime }, bodyFrom: i };
  });
  flush(lines.length - 1);
  return { units: out, offsetMode, clockOnly: !offsetMode && sh.shape !== "name-date-time" };
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

export function lineLabels(raw: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of toLines(raw)) { const x = lineLabel(l.text); if (x) counts.set(x.label, (counts.get(x.label) ?? 0) + 1); }
  return counts;
}

export function speakerSet(raw: string, known: Set<string>, arePeople: string[], notAPerson: string[]) {
  const yes = new Set(arePeople.map((s) => s.toLowerCase())), no = new Set(notAPerson.map((s) => s.toLowerCase()));
  const speakers = new Set<string>();
  const doubtful: string[] = [];
  for (const [label, n] of lineLabels(raw)) {
    const k = label.toLowerCase();
    if (!(n >= 2 || known.has(k))) continue;
    if (no.has(k)) continue;
    if (OFTEN_NOT_PEOPLE.includes(k) && !yes.has(k)) { doubtful.push(label); continue; }
    speakers.add(label);
  }
  return { speakers, doubtful };
}

export function parseLines(raw: string, speakers: Set<string>, tz: string, conversationDate: string | null): Unit[] {
  const lines = toLines(raw);
  const out: Unit[] = [];
  const dp = conversationDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let cur: { from: number; bodyStart: number; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden"> } | null = null;
  const flush = (to: number) => { if (cur) out.push(close(raw, lines, cur.from, to, cur.bodyStart, cur.base)); cur = null; };
  lines.forEach((l, i) => {
    const x = lineLabel(l.text);
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
