export const PARSER_VERSION = "intake-1.0";
export type Format = "whatsapp" | "vtt" | "srt" | "transcript" | "lines" | "notes" | "chatgpt" | "claude" | "slack" | "discourse";
export const FORMAT_LABEL: Record<Format, string> = {
  whatsapp: "WhatsApp export", vtt: "WebVTT transcript", srt: "SubRip transcript", transcript: "Transcript blocks",
  lines: "Name lines", notes: "Notes", chatgpt: "ChatGPT export", claude: "Claude export", slack: "Slack export", discourse: "Discourse discussion",
};
export type Hidden = "system" | "media" | "deleted" | "empty";
export type Precision = "second" | "minute" | "day" | "unknown";
export type TimeSource = "source_export" | "user_entered" | "recording_offset" | "none";

export type Voice =
  | { type: "person"; id: string }
  | { type: "new"; name: string; kind?: "person" | "historical_ai" }
  | { type: "anon" }
  | { type: "none" };

export type PrepareOptions = {
  readAs?: Format | undefined;
  dateOrder?: "DMY" | "MDY" | undefined;
  timeZone?: string | undefined;
  /** local wall time "YYYY-MM-DDTHH:MM[:SS]" when the recording started */
  recordingStart?: string | null | undefined;
  /** "YYYY-MM-DD", the day of a chat whose lines only carry clock times */
  conversationDate?: string | null | undefined;
  /** labels the person confirmed are people (overrides the "often not a person" list) */
  arePeople?: string[] | undefined;
  /** labels the person said are not people: their lines join the previous message */
  notAPerson?: string[] | undefined;
  /** chosen segment indexes; undefined = all */
  segments?: number[] | undefined;
  /** chosen conversation ids in an AI-assistant export */
  conversations?: string[] | undefined;
  /** "all" or the exact matches to mask */
  mask?: "all" | string[] | undefined;
  voices?: Record<string, Voice> | undefined;
};

export type PrepareInput = { kind: "text" | "json"; text: string; fileName?: string | undefined; files?: { name: string; text: string }[] | undefined };
export type PrepareContext = {
  contributors: { id: string; name: string; kind?: string | null }[];
  aliases: { alias: string; contributor_id: string }[];
  importerContributorId: string | null;
  importerName?: string | undefined;
};

export type DraftMessage = {
  speakerLabel: string | null;
  content: string;
  rawStart: number | null;
  rawEnd: number | null;
  /** where the words begin inside the raw span (after the header) */
  bodyStart: number | null;
  sentAt: string | null;
  precision: Precision;
  timeSource: TimeSource;
  offsetMs: number | null;
  externalId: string;
  parentExternalId: string | null;
  hidden: Hidden | null;
  segment: number;
  /** clock time read from the source without a date, shown but never stored as a time */
  clock?: string | null | undefined;
};

export type SpeakerInfo = { label: string; count: number; samples: string[]; suggested: Voice; remembered: boolean };
export type Question =
  | { kind: "pick-conversations"; unsure: number; text: string }
  | { kind: "date-order"; unsure: number; text: string; sample: { DMY: string; MDY: string } }
  | { kind: "unknown-voice"; unsure: number; text: string; label: string }
  | { kind: "not-a-person"; unsure: number; text: string; label: string }
  | { kind: "segments"; unsure: number; text: string }
  | { kind: "recording-start"; unsure: number; text: string }
  | { kind: "conversation-date"; unsure: number; text: string }
  | { kind: "privacy"; unsure: number; text: string; matches: { kind: "phone" | "email"; value: string }[] }
  | { kind: "timezone"; unsure: number; text: string }
  | { kind: "newcomers"; unsure: number; text: string };

export type Segment = { index: number; from: string | null; to: string | null; count: number };
export type ConversationChoice = { id: string; title: string; date: string | null; count: number };

export type Draft = {
  format: Format;
  readAs: { format: Format; confidence: number }[];
  /** what will be stored as the batch original (masked, and for AI exports only the chosen conversations) */
  raw: string;
  /** what the browser sends to the server: the original text, or for exports only the chosen part (unmasked; the server masks again) */
  sendable: string;
  messages: DraftMessage[];
  /** messages that will be kept (chosen segments) */
  kept: DraftMessage[];
  speakers: SpeakerInfo[];
  segments: Segment[];
  conversations: ConversationChoice[];
  /** for JSON sources: the conversation as received, for the Original column */
  received: { role: string; text: string }[] | null;
  questions: Question[];
  title: string | null;
  happened: string | null;
  report: Report;
  /** what the source itself says is missing (e.g. posts a discussion lists but did not send) */
  warnings: string[];
};

export type Report = {
  parser: string;
  format: Format;
  messages: number;
  kept: number;
  setAside: Record<Hidden, number>;
  voices: number;
  firstAt: string | null;
  lastAt: string | null;
  otherBranches: number;
  excludedSegments: Segment[];
  masked: { phone: number; email: number };
  timeZone: string;
  /** a recording start the transcript states itself, as local wall time; null when none or the person gave one */
  recordingStated: string | null;
};
