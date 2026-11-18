import { parseChatCopy } from "./chat";
import { deepMap, readJson, type JsonSource } from "./json";
import { GENERIC, OFTEN_NOT_PEOPLE, nameLines, parseLines, parseNotes, parseTranscript, parseVtt, parseWhatsApp, speakerSet, statedRecordingStart, transcriptShape, waDateOrder, waHeader, waOrderByTime, waWhen, type Unit } from "./text";
import { PARSER_VERSION, type Draft, type DraftMessage, type Format, type Hidden, type PrepareContext, type PrepareInput, type PrepareOptions, type Question, type Segment, type SpeakerInfo, type Voice } from "./types";
import { findPrivate, hash, localStringToUtc, maskText, toLines, validTimeZone } from "./util";

export * from "./types";
const TEXT_FORMATS: Format[] = ["whatsapp", "vtt", "srt", "transcript", "lines", "notes"];
const SIX_HOURS = 6 * 3600 * 1000;

/** Parsed JSON per received input, so changing a choice does not parse a large export again. */
const parsedJson = new WeakMap<PrepareInput, unknown>();
function tryJson(input: PrepareInput): unknown | undefined {
  if (input.files?.some((f) => /\.json$/i.test(f.name))) return null;
  if (parsedJson.has(input)) return parsedJson.get(input);
  const t = input.text.trim();
  let v: unknown = undefined;
  if (input.kind === "json" || /^[[{]/.test(t)) { try { v = JSON.parse(t); } catch { v = undefined; } }
  parsedJson.set(input, v);
  return v;
}

export function detect(raw: string): { format: Format; confidence: number }[] {
  const lines = toLines(raw).filter((l) => l.text.trim());
  const n = Math.max(1, lines.length);
  const wa = lines.filter((l) => waHeader(l.text)).length;
  const timings = lines.filter((l) => /-->/.test(l.text)).length;
  const tr = transcriptShape(raw);
  // name lines count only when the labels are people speaking, not headings or phrases before a colon
  const labels = nameLines(raw).labeled;
  const out: { format: Format; confidence: number }[] = [
    { format: "whatsapp", confidence: wa >= 2 ? Math.min(0.98, 0.4 + wa / n) : wa ? 0.2 : 0 },
    { format: "vtt", confidence: /^\ufeff?WEBVTT/.test(raw.trimStart()) ? 0.99 : 0 },
    { format: "srt", confidence: !/^\ufeff?WEBVTT/.test(raw.trimStart()) && timings && /\d,\d{3}\s*-->/.test(raw) ? 0.95 : 0 },
    { format: "transcript", confidence: Math.max(tr ? Math.min(0.9, 0.5 + tr.count / n) : 0, chatCopyWins(raw, tr?.count ?? 0) ? 0.93 : 0) },
    { format: "lines", confidence: labels ? Math.min(0.85, 0.3 + labels / n / 2) : 0 },
    { format: "notes", confidence: 0.1 },
  ];
  return out.filter((x) => x.confidence > 0).sort((a, b) => b.confidence - a.confidence);
}

/** A chat copied off a page (name lines, separate times, page furniture) reads better than plain transcript blocks. */
function chatCopyWins(raw: string, transcriptHeaders: number, read = parseChatCopy(raw, "UTC", null, "DMY")): boolean {
  return read.headers >= 2 && !read.offsetLike && read.headers >= transcriptHeaders;
}

function localDate(isoStr: string, tz: string) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoStr)); }
  catch { return isoStr.slice(0, 10); }
}

function suggestVoice(label: string, format: Format, ctx: PrepareContext, author: string | null = null): { voice: Voice; remembered: boolean } {
  const me: Voice = ctx.importerContributorId ? { type: "person", id: ctx.importerContributorId } : { type: "new", name: ctx.importerName || "Me" };
  if (format === "notes") {
    // bringing words in does not make them yours: notes are credited only when the person says who wrote them
    if (!author) return { voice: { type: "none" }, remembered: false };
    if (/^(?:me|我|i|jag)$/i.test(author) || (ctx.importerName && author.toLowerCase() === ctx.importerName.toLowerCase())) return { voice: me, remembered: false };
    label = author;
  }
  const k = label.toLowerCase();
  if ((format === "chatgpt" || format === "claude") && (k === "user" || k === "human")) return { voice: me, remembered: false };
  if ((format === "chatgpt" || format === "claude") && k === "assistant") {
    const name = format === "chatgpt" ? "ChatGPT" : "Claude";
    const hit = ctx.contributors.find((c) => c.name === name);
    return { voice: hit ? { type: "person", id: hit.id } : { type: "new", name, kind: "historical_ai" }, remembered: false };
  }
  // "You" in a copied chat, or a line headed "Me:", is the person bringing it in
  if (/^(?:you|du|我|me|jag)$/i.test(label)) return { voice: me, remembered: false };
  // an AI that took part, named in the text ("Claude: …"): the same contributor as its exports
  const ai = /^(?:claude|chatgpt|gemini|copilot)$/i.exec(label.trim());
  if (ai) {
    const name = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", copilot: "Copilot" }[ai[0].toLowerCase() as "claude"];
    const hit = ctx.contributors.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return { voice: hit ? { type: "person", id: hit.id } : { type: "new", name, kind: "historical_ai" }, remembered: false };
  }
  const alias = ctx.aliases.find((a) => a.alias.toLowerCase() === k);
  if (alias && ctx.contributors.some((c) => c.id === alias.contributor_id)) return { voice: { type: "person", id: alias.contributor_id }, remembered: true };
  const hit = ctx.contributors.find((c) => c.name.toLowerCase() === k);
  if (hit) return { voice: { type: "person", id: hit.id }, remembered: false };
  if (GENERIC.test(label)) return { voice: { type: "anon" }, remembered: false };
  return { voice: { type: "new", name: label.replace(/^~\s*/, "").trim() || label }, remembered: false };
}

/** Prepare a received original. Same input + options → same draft, in the browser and on the server. */
export function prepare(input: PrepareInput, options: PrepareOptions, ctx: PrepareContext): Draft {
  const tz = validTimeZone(options.timeZone) ? options.timeZone : "UTC";
  const masked = { phone: 0, email: 0 };
  const recordingIso = localStringToUtc(options.recordingStart, tz);
  const date = options.conversationDate && /^\d{4}-\d{2}-\d{2}$/.test(options.conversationDate) ? options.conversationDate : null;
  const questions: Question[] = [];
  if (options.timeZone && tz !== options.timeZone) questions.push({ kind: "timezone", unsure: 0.95, text: `“${options.timeZone}” is not a timezone Ramus knows, so times are read as UTC. Choose a timezone such as Europe/Stockholm.` });
  let units: Unit[] = [];
  let recordingStated: string | null = null;
  let raw = input.text;
  let sendable = input.text;
  let format: Format;
  let readAs: Draft["readAs"];
  let received: Draft["received"] = null;
  let conversations: Draft["conversations"] = [];
  let otherBranches = 0;
  let title: string | null = input.fileName ? input.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || null : null;
  let privacy = [] as ReturnType<typeof findPrivate>;
  let warnings: string[] = [];

  const parsed = tryJson(input);
  const src: JsonSource | null = parsed !== undefined ? readJson(parsed, input.files) : null;
  if (src) {
    format = src.format;
    warnings = src.warnings ?? [];
    readAs = [{ format, confidence: 0.99 }];
    conversations = src.conversations;
    const ids = options.conversations ?? (conversations.length === 1 ? [conversations[0]!.id] : []);
    if (conversations.length > 1 && !ids.length) questions.push({ kind: "pick-conversations", unsure: 1, text: `This export holds ${conversations.length} conversations. Pick the ones to bring in.` });
    let chosen = src.pick(ids);
    const plainJson = JSON.stringify(chosen);
    sendable = plainJson;
    privacy = findPrivate(plainJson);
    if (options.mask) {
      chosen = deepMap(chosen, (s) => { const r = maskText(s, options.mask!); masked.phone += r.phone; masked.email += r.email; return r.text; }) as unknown[];
      privacy = findPrivate(JSON.stringify(chosen));
    }
    raw = JSON.stringify(chosen, null, 2);
    const b = src.build(chosen);
    units = b.units; otherBranches = b.otherBranches; received = b.received;
    title = b.title ?? (ids.length === 1 ? conversations.find((c) => c.id === ids[0])?.title ?? title : title);
  } else {
    privacy = findPrivate(raw);
    if (options.mask) { const r = maskText(raw, options.mask); raw = r.text; masked.phone = r.phone; masked.email = r.email; privacy = findPrivate(raw); }
    readAs = detect(raw);
    format = options.readAs && TEXT_FORMATS.includes(options.readAs) ? options.readAs : (readAs[0]?.format ?? "notes");
    if (format === "whatsapp") {
      const heads = toLines(raw).map((l) => waHeader(l.text)).filter((h) => h !== null);
      // a day above 12 settles it; otherwise the chat's own forward order does; only then is the person asked
      const found = waDateOrder(heads) ?? waOrderByTime(heads);
      const order = found ?? options.dateOrder ?? "DMY";
      if (!found && heads[0]) {
        const h = heads[0];
        const show = (o: "DMY" | "MDY") => { const w = waWhen(h, o, tz); return new Date(Date.UTC(w.y, w.mo - 1, w.d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
        questions.push({ kind: "date-order", unsure: 0.9, text: `Is “${h.headerText}” day first or month first?`, sample: { DMY: show("DMY"), MDY: show("MDY") } });
      }
      units = parseWhatsApp(raw, order, tz);
    } else if (format === "vtt" || format === "srt") {
      units = parseVtt(raw, recordingIso);
      if (!recordingIso) questions.push({ kind: "recording-start", unsure: 0.5, text: "When did the recording start? Without it, times stay as offsets into the recording." });
    } else if (format === "transcript" && chatCopyWins(raw, transcriptShape(raw)?.count ?? 0)) {
      const known = new Set([...ctx.contributors.map((c) => c.name.toLowerCase()), ...ctx.aliases.map((a) => a.alias.toLowerCase())]);
      const c = parseChatCopy(raw, tz, date, options.dateOrder ?? "DMY", known, options.knownVoices ?? []);
      units = c.units;
      if (c.clockOnly && !date) questions.push({ kind: "conversation-date", unsure: 0.5, text: "The lines carry clock times but no full date. On which day was this? Without it, times stay unknown." });
    } else if (format === "transcript") {
      // a start the transcript states itself (Teams .docx) is used unless the person gives another
      const stated = options.recordingStart ? null : localStringToUtc(statedRecordingStart(raw), tz);
      const t = parseTranscript(raw, tz, date, recordingIso ?? stated);
      units = t.units;
      if (stated && t.offsetMode) recordingStated = statedRecordingStart(raw);
      if (t.offsetMode && !recordingIso && !stated) questions.push({ kind: "recording-start", unsure: 0.5, text: "When did the recording start? Without it, times stay as offsets into the recording." });
      if (t.clockOnly && !date) questions.push({ kind: "conversation-date", unsure: 0.5, text: "The lines carry clock times but no date. On which day was this? Without it, times stay unknown." });
    } else if (format === "lines") {
      const known = new Set([...ctx.contributors.map((c) => c.name.toLowerCase()), ...ctx.aliases.map((a) => a.alias.toLowerCase())]);
      const s = speakerSet(raw, known, options.arePeople ?? [], options.notAPerson ?? [], options.knownVoices ?? []);
      for (const d of s.doubtful) questions.push({ kind: "not-a-person", unsure: 0.7, text: `Is “${d}” a person?`, label: d });
      units = parseLines(raw, s.speakers, tz, date);
      if (!date && units.some((u) => u.clock)) questions.push({ kind: "conversation-date", unsure: 0.5, text: "The lines carry clock times but no date. On which day was this? Without it, times stay unknown." });
    } else {
      units = parseNotes(raw);
    }
    if (!title) title = toLines(raw).map((l) => l.text.trim()).find(Boolean)?.slice(0, 60) ?? null;
  }
  if (privacy.length) questions.push({ kind: "privacy", unsure: 0.4, text: `${privacy.length} phone number${privacy.length === 1 ? "" : "s"} or email address${privacy.length === 1 ? "" : "es"} found.`, matches: privacy });

  // external ids, stable and unique inside the batch
  const seen = new Map<string, number>();
  const recording = format === "vtt" || format === "srt" || units.some((u) => u.offsetMs != null);
  const withIds = units.map((u) => {
    let id = u.externalId ?? `h${hash(`${recording ? (u.offsetMs ?? "") : (u.sentAt ?? "")}|${u.speakerLabel ?? ""}|${u.content}`)}`;
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    if (n > 1) id = `${id}#${n}`;
    return { ...u, externalId: id };
  });

  // segments: gaps over six hours (or a new day for day-only data)
  const segments: Segment[] = [];
  let seg = 0, prev: string | null = null;
  const messages: DraftMessage[] = withIds.map((u) => {
    if (u.sentAt && prev) {
      const gap = u.precision === "day" ? localDate(u.sentAt, tz) !== localDate(prev, tz) : Date.parse(u.sentAt) - Date.parse(prev) > SIX_HOURS;
      if (gap) seg++;
    }
    if (u.sentAt) prev = u.sentAt;
    const s = segments[seg] ?? (segments[seg] = { index: seg, from: null, to: null, count: 0 });
    s.count++;
    if (u.sentAt) { s.from ??= u.sentAt; s.to = u.sentAt; }
    return { ...u, segment: seg };
  });
  const chosenSegs = options.segments ? new Set(options.segments) : null;
  const kept = chosenSegs && segments.length > 1 ? messages.filter((m) => chosenSegs.has(m.segment)) : messages;
  // a few sittings are worth choosing between; a long-running group chat is simply kept whole
  if (segments.length > 1 && segments.length <= 8) questions.push({ kind: "segments", unsure: 0.6, text: `This chat falls into ${segments.length} sittings, separated by long pauses. Choose which to bring in.` });

  // voices
  // labels that only ever appear on system lines (ChatGPT "system", "tool") are not voices; their lines stay unattributed
  const byLabel = new Map<string, DraftMessage[]>();
  for (const m of messages) {
    const key = m.speakerLabel ?? (format === "notes" ? "" : null);
    if (key === null) continue;
    byLabel.set(key, [...(byLabel.get(key) ?? []), m]);
  }
  for (const [label, ms] of byLabel) if (ms.every((m) => m.hidden === "system")) byLabel.delete(label);
  const knownVoices = (options.knownVoices ?? []).map((v) => v.trim()).filter(Boolean);
  const author = format === "notes" && knownVoices.length === 1 ? knownVoices[0]! : null;
  const speakers: SpeakerInfo[] = [...byLabel.entries()].map(([label, ms]) => {
    const s = suggestVoice(label, format, ctx, author);
    return { label, count: ms.length, samples: ms.filter((m) => !m.hidden).slice(0, 2).map((m) => m.content.slice(0, 120)), suggested: s.voice, remembered: s.remembered };
  });
  const aiExport = format === "chatgpt" || format === "claude";
  const isNew = (s: SpeakerInfo) => !options.voices?.[s.label] && !s.remembered && s.suggested.type === "new" && !GENERIC.test(s.label) && !(aiExport && ["user", "human", "assistant"].includes(s.label.toLowerCase()));
  const newcomers = speakers.filter(isNew).length;
  if (newcomers > 3) questions.push({ kind: "newcomers", unsure: 0.2, text: `${newcomers} people are new to this garden and will be added under the names they use here.` });
  for (const s of speakers) {
    if (options.voices?.[s.label] || s.remembered || s.suggested.type === "person" || s.suggested.type === "none") continue;
    if (aiExport && ["user", "human", "assistant"].includes(s.label.toLowerCase())) continue;
    const generic = GENERIC.test(s.label) || /^U[A-Z0-9]{6,}$/.test(s.label);
    if (!generic && newcomers > 3) continue;
    questions.push({ kind: "unknown-voice", unsure: generic ? 0.8 : 0.3, text: generic ? `Who is “${s.label}”?` : `“${s.label}” is not yet in this garden. Add as a new person?`, label: s.label });
  }

  const setAside = { system: 0, media: 0, deleted: 0, empty: 0 } as Record<Hidden, number>;
  for (const m of kept) if (m.hidden) setAside[m.hidden]++;
  const times = kept.map((m) => m.sentAt).filter((t): t is string => !!t).sort();
  questions.sort((a, b) => b.unsure - a.unsure);
  return {
    format, readAs, raw, sendable, messages, kept, speakers, segments, conversations, received, questions,
    title, happened: times[0] ? localDate(times[0], tz) : date, warnings,
    report: {
      parser: PARSER_VERSION, format, messages: messages.length, kept: kept.length, setAside, voices: speakers.length,
      firstAt: times[0] ?? null, lastAt: times[times.length - 1] ?? null, otherBranches,
      excludedSegments: chosenSegs ? segments.filter((s) => !chosenSegs.has(s.index)) : [], masked, timeZone: tz, recordingStated,
    },
  };
}

export const NOT_PEOPLE = OFTEN_NOT_PEOPLE;

/** Final voice per label: what the person chose, else the suggestion. Anonymous voices become Voice A, B, … */
export function resolveVoices(draft: Draft, options: PrepareOptions): Map<string, Voice & { anonName?: string }> {
  const out = new Map<string, Voice & { anonName?: string }>();
  let anon = 0;
  for (const s of draft.speakers) {
    const v = options.voices?.[s.label] ?? s.suggested;
    out.set(s.label, v.type === "anon" ? { ...v, anonName: `Voice ${String.fromCharCode(65 + anon++)}` } : v);
  }
  return out;
}

/** Labels worth remembering as aliases: real names only. */
export const isRealName = (label: string, format: Format) =>
  !!label.trim() && !GENERIC.test(label.trim()) && format !== "notes" && !/^U[A-Z0-9]{6,}$/.test(label);

/** Invariants 1–3, checked on the server before writing. Returns plain-language problems. */
export function checkDraft(draft: Draft): string[] {
  const problems: string[] = [];
  const raw = draft.raw;
  for (const m of draft.messages) {
    if (m.sentAt && m.timeSource === "none") problems.push("A message has a time the source does not state.");
    if (!m.sentAt && m.timeSource !== "none") problems.push("A message claims a time source without a time.");
    if (m.rawStart != null && m.rawEnd != null && (m.rawStart < 0 || m.rawEnd > raw.length || m.rawStart > m.rawEnd)) problems.push("A message points outside its original.");
    if (m.bodyStart != null && m.rawEnd != null) {
      const ws = (s: string) => s.replace(/[\u200e\u200f\u202f\u00a0\ufeff]/g, " ").replace(/\s+/g, " ").trim();
      if (ws(m.content) !== ws(raw.slice(m.bodyStart, m.rawEnd))) problems.push("A message’s words differ from the original.");
    }
  }
  return [...new Set(problems)];
}
