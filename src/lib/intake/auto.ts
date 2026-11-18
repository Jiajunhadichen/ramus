import { prepare, type Draft, type Format, type PrepareContext, type PrepareInput, type PrepareOptions } from "./prepare";

/**
 * Bringing words in without questions: Ramus makes every choice the Accession page would ask about,
 * the same way every time, and says what it chose. Pure and deterministic, like prepare().
 */
export type AutoEnv = { timeZone: string; dateOrder: "DMY" | "MDY" };
/** What the person may add on their own (never asked for): the day of a chat with clock times only, or when a recording started. */
export type AutoExtra = { conversationDate?: string | null | undefined; recordingStart?: string | null | undefined };
export type Auto = { draft: Draft; options: PrepareOptions; notes: string[] };

export const MAX_EXPORT_CONVERSATIONS = 20;

export function prepareAuto(input: PrepareInput, env: AutoEnv, ctx: PrepareContext, extra: AutoExtra = {}): Auto {
  const options: PrepareOptions = { timeZone: env.timeZone, dateOrder: env.dateOrder };
  if (extra.conversationDate) options.conversationDate = extra.conversationDate;
  if (extra.recordingStart) options.recordingStart = extra.recordingStart;
  const notes: string[] = [];
  let draft = prepare(input, options, ctx);
  // an AI-assistant export: its conversations, or the most recent ones when there are many
  if (draft.conversations.length > 1) {
    const recent = [...draft.conversations].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    options.conversations = recent.slice(0, MAX_EXPORT_CONVERSATIONS).map((c) => c.id);
    if (recent.length > MAX_EXPORT_CONVERSATIONS) notes.push(`the ${MAX_EXPORT_CONVERSATIONS} most recent of ${recent.length} conversations`);
    draft = prepare(input, options, ctx);
  }
  // phone numbers and email addresses are hidden before anything is kept or read
  const privacy = draft.questions.find((q) => q.kind === "privacy");
  if (privacy && privacy.kind === "privacy") {
    options.mask = "all";
    draft = prepare(input, options, ctx);
    notes.push(`${privacy.matches.length} phone number${privacy.matches.length === 1 ? "" : "s"} or email address${privacy.matches.length === 1 ? "" : "es"} hidden`);
  }
  return { draft, options, notes };
}

export type TimeLine =
  | { kind: "span"; from: string; to: string; all: boolean }
  | { kind: "clock" }
  | { kind: "offsets" }
  | { kind: "none" };

/** What is known about when things were said. */
export function timeLine(draft: Draft): TimeLine {
  const words = draft.kept.filter((m) => !m.hidden);
  const timed = words.filter((m) => m.sentAt);
  if (draft.report.firstAt && draft.report.lastAt) return { kind: "span", from: draft.report.firstAt, to: draft.report.lastAt, all: timed.length === words.length };
  if (words.some((m) => m.offsetMs != null)) return { kind: "offsets" };
  if (words.some((m) => m.clock)) return { kind: "clock" };
  return { kind: "none" };
}

export const KIND_LABEL: Record<Format, string> = {
  whatsapp: "WhatsApp chat", slack: "Slack", chatgpt: "ChatGPT conversation", claude: "Claude conversation",
  transcript: "Chat or transcript", lines: "Chat", vtt: "Recording transcript", srt: "Recording transcript", notes: "Notes", discourse: "Discussion",
};

const EXPORT_PREFIX = /^(?:whatsapp[ -]chat(?:t)?(?:\s+(?:with|med|mit|avec|con))?|whatsapp chat\s*-|与)\s*[-:]?\s*/i;

/** A garden's name from what was brought in: a chat's own name when there is one; otherwise a placeholder. */
export function gardenTitle(fileName: string | null, draft: Draft): { title: string; placeholder: boolean } {
  const fromFile = fileName ? fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(EXPORT_PREFIX, "").replace(/\s*的\s*WhatsApp\s*聊天$/i, "").trim() : "";
  if (fromFile && !/^(?:_?chat|conversations?|messages?|transcript)$/i.test(fromFile)) return { title: fromFile.slice(0, 80), placeholder: false };
  if (draft.title && (draft.format === "chatgpt" || draft.format === "claude" || draft.format === "slack" || draft.format === "discourse")) return { title: draft.title.slice(0, 80), placeholder: false };
  return { title: "A conversation", placeholder: true };
}
