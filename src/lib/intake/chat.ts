import { MONTHS, blank, clockParts, close, noTime, setAside, tidy, type Unit } from "./text";
import { nameShape } from "./names";
import { plain, toLines, zonedToUtc, type Line } from "./util";

/**
 * Chats copied straight off a page: people select a conversation in Slack, Teams, Discord, Messenger,
 * Google Chat, Telegram or WeChat, copy it and drop it in, with the page's furniture along for the ride.
 * Speakers appear as a name line (often twice: avatar and name), with the time on the same line or the next;
 * between messages sit reactions, "Reply", "Edited", date dividers and the like.
 * This reader finds the speakers, keeps every word where it was, and sets the furniture aside (never drops it).
 */

type Day = { y: number | null; m: number; d: number } | { rel: number };
type When = { clock: string; day: Day | null };
type Head = { name: string; when: When | null; shape: string; span: number };

const CLOCK = String.raw`\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[AaPp]\.?\s*[Mm]\.?)?`;
const REL: Record<string, number> = { today: 0, idag: 0, "今天": 0, heute: 0, "aujourd'hui": 0, yesterday: -1, "igår": -1, "i går": -1, "昨天": -1, gestern: -1, hier: -1 };
const WEEKDAY = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday|sday)?\.?$|^(mån|tis|ons|tors|fre|lör|sön)(dag)?$|^(周|星期)[一二三四五六日天]$/i;

/** "2:02 PM", "Today at 2:02 PM", "17/11 14:02", "[17.11.2026 14:02]", "Nov 17, 2026, 2:02 PM" … as a clock and a day. */
export function timeExpr(input: string, order: "DMY" | "MDY"): When | null {
  let s = plain(input).trim().replace(/^\[(.*)\]$/, "$1").trim();
  const m = s.match(new RegExp(String.raw`(${CLOCK})$`));
  if (!m) return null;
  const clock = m[1]!.trim();
  s = s.slice(0, s.length - m[1]!.length).trim().replace(/[,\s]*(?:at|kl\.?|um|à|alle|om)?\s*$/i, "").replace(/,\s*$/, "").trim();
  if (!s) return { clock, day: null };
  const low = s.toLowerCase();
  if (low in REL) return { clock, day: { rel: REL[low]! } };
  if (WEEKDAY.test(s)) return { clock, day: null };
  let n = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (n) return { clock, day: { y: +n[1]!, m: +n[2]!, d: +n[3]! } };
  n = s.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?\.?$/);
  if (n) {
    let a = +n[1]!, b = +n[2]!;
    const y = n[3] ? (n[3].length === 2 ? 2000 + +n[3] : +n[3]) : null;
    const dmy = a > 12 ? true : b > 12 ? false : order === "DMY";
    if (!dmy) [a, b] = [b, a];
    return b >= 1 && b <= 12 && a >= 1 && a <= 31 ? { clock, day: { y, m: b, d: a } } : null;
  }
  n = s.match(/^(?:[A-Za-zÅÄÖåäö]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zÅÄÖåäö]{3,9})\.?(?:,?\s+(\d{4}))?$/);
  if (n && MONTHS[n[2]!.toLowerCase()]) return { clock, day: { y: n[3] ? +n[3] : null, m: MONTHS[n[2]!.toLowerCase()]!, d: +n[1]! } };
  n = s.match(/^(?:[A-Za-zÅÄÖåäö]+,?\s+)?([A-Za-zÅÄÖåäö]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (n && MONTHS[n[1]!.toLowerCase()]) return { clock, day: { y: n[3] ? +n[3] : null, m: MONTHS[n[1]!.toLowerCase()]!, d: +n[2]! } };
  return null;
}

// ---------- page furniture ----------
const NOISE = new RegExp(
  "^(?:" + [
    "reply", "replies", "\\d+\\s+(?:replies|reply|svar|条回复)", "view thread", "view \\d+ (?:more )?repl(?:y|ies)", "last reply .{0,40}",
    "edited", "\\(edited\\)", "redigerad", "已编辑", "bearbeitet",
    "like", "love", "react", "add reaction", "forward", "copy", "more", "more actions", "translate", "see translation",
    "seen", "seen by .{1,60}", "delivered", "read", "sent", "not delivered", "sending\\.*", "read by .{1,60}",
    "new", "new messages?", "\\d+ new messages?", "unread messages?", "jump to (?:present|latest|bottom)",
    "message #\\S+", "send a message.*", "type a (?:new )?message.*", "write a message.*", "skriv ett meddelande.*", "发送消息",
    "\\d+ members?", "\\d+ medlemmar", "aa", "send", "show more", "see more", "view more",
    "pinned( message)?", "this message was edited",
  ].join("|") + ")[.…]?$", "i");
const REACTION = /^(?:[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]+\s*\d{0,3}\s*)+$/u;
const DIVIDER = new RegExp(String.raw`^[—–\-─=\s]*(?:today|yesterday|idag|igår|i går|今天|昨天|heute|gestern|(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:,?\s+.{3,30})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\.?\s+[A-Za-zåäö]{3,9}(?:\s+\d{4})?|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日)[—–\-─=\s]*$`, "i");
const SELF = /^(?:you sent|you|du skickade|du|你发送了|我)$/i;
const STOP = new Set(["yes", "no", "ok", "okay", "okej", "sure", "thanks", "thank you", "tack", "ja", "nej", "lol", "haha", "hahaha", "agreed", "same", "nice", "cool", "great", "done", "好", "好的", "对", "嗯", "哈哈", "哈哈哈", "收到", "可以", "同意"]);

/** Could this short line be someone's name? */
function nameLike(t: string): boolean {
  const s = t.trim();
  if (!s || s.length > 40 || STOP.has(s.toLowerCase())) return false;
  if (/[.?!。？！:：;…]$/.test(s) || /^\d+$/.test(s) || /https?:|www\.|@\w+\./.test(s)) return false;
  if (NOISE.test(s) || DIVIDER.test(s) || REACTION.test(s) || setAside(s)) return false;
  if (!/^[\p{L}]/u.test(s)) return false;
  // a heading, a phrase or a sentence is never a name, however short (names.ts)
  return s.split(/\s+/).length <= 4 && nameShape(s) !== "no";
}

/** A header on one line: "Ana — Today at 2:02 PM", "Ana Lind, 2:02 PM, Edited", "Ana Lind, [17.11.2026 14:02]", "Ana  2:02 PM", "张三 14:02". */
function inlineHead(t: string, order: "DMY" | "MDY"): Omit<Head, "span"> | null {
  const s = plain(t).trim().replace(/,\s*(?:edited|redigerad|已编辑)$/i, "");
  const seps: [RegExp, string][] = [
    [/^(.{1,40}?)\s+[—–]\s+(.+)$/, "dash"],
    [/^(.{1,40}?)\s+-\s+(.+)$/, "dash"],
    [/^(.{1,40}?),\s*(.+)$/, "comma"],
    [/^(.{1,40}?)(?:\s{2,}|\t+)(.+)$/, "gap"],
    [/^(.{1,40}?)\s(.+)$/, "space"],
  ];
  for (const [re, shape] of seps) {
    const m = s.match(re);
    if (!m || !nameLike(m[1]!)) continue;
    const when = timeExpr(m[2]!, order);
    if (when) return { name: m[1]!.trim(), when, shape };
  }
  return null;
}

/** Numeric dates in the text decide day-first or month-first, as for WhatsApp. */
function numericOrder(lines: Line[], fallback: "DMY" | "MDY"): "DMY" | "MDY" {
  for (const l of lines) {
    for (const m of plain(l.text).matchAll(/\b(\d{1,2})[./-](\d{1,2})(?:[./-]\d{2,4})?\s+\d{1,2}[:.]\d{2}/g)) {
      if (+m[1]! > 12) return "DMY";
      if (+m[2]! > 12) return "MDY";
    }
  }
  return fallback;
}

export type ChatCopy = { units: Unit[]; headers: number; offsetLike: boolean; clockOnly: boolean };

export function parseChatCopy(raw: string, tz: string, conversationDate: string | null, order: "DMY" | "MDY", known: Set<string> = new Set(), only: string[] = []): ChatCopy {
  const allowed = new Set(only.map((v) => v.trim().toLowerCase()).filter(Boolean));
  const speaks = (name: string) => !allowed.size || allowed.has(name.toLowerCase()) || (allowed.has("me") && /^(?:you|我|du)$/i.test(name));
  const lines = toLines(raw);
  const txt = lines.map((l) => plain(l.text).trim());
  const ord = numericOrder(lines, order);
  const nextFilled = (i: number) => { let j = i + 1; while (j < lines.length && !txt[j]) j++; return j; };

  // 1. candidate headers
  const cands = new Map<number, Head>();
  for (let i = 0; i < lines.length; i++) {
    const t = txt[i]!;
    if (!t) continue;
    if (SELF.test(t) && /sent|skickade|发送/.test(t.toLowerCase())) { cands.set(i, { name: "You", when: null, shape: "self", span: 1 }); continue; }
    const inl = inlineHead(t, ord);
    if (inl) { cands.set(i, { ...inl, span: 1 }); continue; }
    if (!nameLike(t)) continue;
    // stacked: Name (Name again, from the avatar) then a time line
    let j = nextFilled(i);
    let span = j - i + 1;
    if (txt[j] === t) { j = nextFilled(j); span = j - i + 1; }
    const when = j < lines.length ? timeExpr(txt[j]!, ord) : null;
    if (when) cands.set(i, { name: t, when, shape: "stacked", span });
    else cands.set(i, { name: t, when: null, shape: "name", span: txt[i + 1] === t ? 2 : 1 });
  }
  // 2. keep the shape the page actually uses; bare names count only when they recur and nothing better exists
  const names = new Map<string, number>();
  for (const h of cands.values()) names.set(h.name, (names.get(h.name) ?? 0) + 1);
  const byShape = new Map<string, number>();
  for (const h of cands.values()) if (h.shape !== "name" && h.shape !== "self") byShape.set(h.shape, (byShape.get(h.shape) ?? 0) + 1);
  const best = [...byShape.entries()].sort((a, b) => b[1] - a[1])[0];
  const strong = new Set(["dash", "comma", "gap", "stacked"]);
  const heads = new Map<number, Head>();
  for (const [i, h] of cands) {
    const recurring = (names.get(h.name) ?? 0) >= 2 || known.has(h.name.toLowerCase());
    if (h.shape === "self") heads.set(i, h);
    else if (!speaks(h.name)) continue;
    // a bare line counts as a name only when it looks like one (or is known) and recurs with nothing better on the page
    else if (h.shape === "name") { if (!best && recurring && (names.get(h.name) ?? 0) >= 2 && (nameShape(h.name) === "name" || known.has(h.name.toLowerCase()) || allowed.has(h.name.toLowerCase()))) heads.set(i, h); }
    else if (best && h.shape === best[0] && (strong.has(h.shape) || best[1] >= 3 || recurring)) heads.set(i, h);
    else if (recurring && strong.has(h.shape)) heads.set(i, h);
  }
  // a header must be followed by words before the next header
  for (const [i, h] of [...heads]) {
    const after = nextFilled(i + h.span - 1);
    if (after >= lines.length || heads.has(after)) heads.delete(i);
  }
  const offsetLike = [...heads.values()].some((h) => h.when && /^0{1,2}:\d{2}/.test(h.when.clock) && !/[AaPp]\.?\s*[Mm]/.test(h.when.clock) && !h.when.day);
  if (heads.size < 2 && !(heads.size === 1 && [...heads.values()][0]!.shape !== "name")) return { units: [], headers: 0, offsetLike, clockOnly: false };

  // 3. walk the page
  const date = conversationDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let clockOnly = false;
  const stamp = (w: When | null) => {
    if (!w) return { ...noTime };
    const p = clockParts(w.clock);
    let y: number | null = null, mo = 0, d = 0, fromSource = false;
    if (w.day && "rel" in w.day) {
      if (!date) { clockOnly = true; return { ...noTime }; }
      const base = new Date(Date.UTC(+date[1]!, +date[2]! - 1, +date[3]! + w.day.rel));
      y = base.getUTCFullYear(); mo = base.getUTCMonth() + 1; d = base.getUTCDate();
    } else if (w.day) {
      mo = w.day.m; d = w.day.d; y = w.day.y ?? (date ? +date[1]! : null); fromSource = w.day.y !== null;
    } else if (date) { y = +date[1]!; mo = +date[2]!; d = +date[3]!; }
    if (y === null) { clockOnly = true; return { ...noTime }; }
    const iso = zonedToUtc(y, mo, d, p[0]!, p[1]!, p[2] ?? 0, tz);
    if (!iso) return { ...noTime };
    return { ...noTime, sentAt: iso, precision: p.length === 3 ? ("second" as const) : ("minute" as const), timeSource: fromSource ? ("source_export" as const) : ("user_entered" as const) };
  };

  const out: Unit[] = [];
  let speaker: string | null = null;
  let lastClock: string | null = null;
  // headEnd: the last line of a header (name, avatar name, time); words: whether any words followed it yet
  let cur: { from: number; headEnd: number; bodyStart: number; base: Omit<Unit, "content" | "rawStart" | "rawEnd" | "bodyStart" | "hidden">; heading: boolean; words: boolean } | null = null;
  const flush = (to: number) => {
    if (!cur) return;
    if (!cur.words) {
      // a header (or a lone time) with no words after it: kept as an empty, set-aside message
      const end = lines[cur.headEnd]!.end;
      out.push({ ...cur.base, content: "", rawStart: lines[cur.from]!.start, rawEnd: end, bodyStart: end, hidden: "empty" });
    } else {
      const u = close(raw, lines, cur.from, to, cur.bodyStart, cur.base);
      out.push(cur.heading && !u.hidden ? { ...u, hidden: "system" } : u);
    }
    cur = null;
  };
  const aside = (i: number, hidden: Unit["hidden"], label: string | null) =>
    out.push({ speakerLabel: label, ...noTime, content: tidy(lines[i]!.text), rawStart: lines[i]!.start, rawEnd: lines[i]!.end, bodyStart: lines[i]!.start, hidden });

  for (let i = 0; i < lines.length; i++) {
    const t = txt[i]!;
    const h = heads.get(i);
    if (h) {
      flush(i - 1);
      speaker = h.name;
      const last = i + h.span - 1;
      const bodyStart = last + 1 < lines.length ? lines[last + 1]!.start : raw.length;
      cur = { from: i, headEnd: last, bodyStart, base: { speakerLabel: speaker, ...stamp(h.when), clock: h.when?.clock ?? null }, heading: false, words: false };
      lastClock = h.when?.clock ?? lastClock;
      i = last;
      continue;
    }
    if (!t) continue;
    let when = speaker ? timeExpr(t, ord) : null;
    // Slack writes "2:03" under a header that said "2:02 PM": the half of the day carries over
    const prevClock: string | null = (cur as { base: { clock?: string | null } } | null)?.base.clock ?? lastClock;
    const half: string | undefined = prevClock?.match(/([AaPp])\.?\s*[Mm]\.?$/)?.[1];
    if (when && half && !/[AaPp]\.?\s*[Mm]/.test(when.clock)) when = { ...when, clock: `${when.clock} ${half.toUpperCase()}M` };
    if (when && !/[\p{L}]{4,}/u.test(t.replace(/today|yesterday|idag|igår|heute|gestern|at|kl/gi, ""))) {
      // a follow-up time (Slack shows "2:03" before the next message of the same person)
      flush(i - 1);
      cur = { from: i, headEnd: i, bodyStart: i + 1 < lines.length ? lines[i + 1]!.start : raw.length, base: { speakerLabel: speaker, ...stamp(when), clock: when.clock }, heading: false, words: false };
      continue;
    }
    const kept = setAside(t);
    if ((kept === "media" || kept === "deleted") && cur && !cur.words) {
      // the whole message is a sticker, a photo or a recalled message
      out.push(close(raw, lines, cur.from, i, cur.bodyStart, cur.base, kept));
      cur = null;
      continue;
    }
    if (NOISE.test(t) || REACTION.test(t) || DIVIDER.test(t) || (/^\d{1,3}$/.test(t) && i > 0 && REACTION.test(txt[i - 1] ?? "")) || kept === "media" || kept === "deleted" || kept === "system") {
      flush(i - 1);
      aside(i, kept === "media" || kept === "deleted" ? kept : "system", kept === "media" || kept === "deleted" ? speaker : null);
      continue;
    }
    if (cur) cur.words = true;
    else cur = { from: i, headEnd: i, bodyStart: lines[i]!.start, base: { speakerLabel: speaker, ...noTime }, heading: speaker === null, words: true };
  }
  flush(lines.length - 1);
  return { units: out, headers: heads.size, offsetLike, clockOnly };
}
