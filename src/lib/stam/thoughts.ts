import { formatTime } from "./evidence";

export type ThoughtType = "raised" | "challenged" | "refined" | "merged" | "rested" | "revived" | "settled" | "reopened";
export type Thought = {
  id: string; seq: number; type: ThoughtType | string; idea_id: string; related_idea_id: string | null;
  settled_kind: string | null; person_id: string | null; occurred_at: string | null; time_precision: string;
  rationale: string | null; origin: string; confirmed: boolean; rejected_at: string | null;
};

export const SETTLED_KINDS = [
  ["decision", "a decision"],
  ["result", "a confirmed result"],
  ["ruled_out", "an alternative ruled out"],
  ["conclusion", "a conclusion others built on"],
] as const;
export const settledKindLabel = (k: string | null) => SETTLED_KINDS.find(([v]) => v === k)?.[1] ?? null;

const known = (t: Thought) => !!t.occurred_at && t.time_precision !== "unknown";

/** Replay order: events with a known time by occurred_at; events with unknown time follow in sequence order. Rejected events are left out. */
export function replayOrder<T extends Thought>(list: T[]): T[] {
  const live = list.filter((t) => !t.rejected_at);
  const dated = live.filter(known).sort((a, b) => a.occurred_at!.localeCompare(b.occurred_at!) || a.seq - b.seq);
  const undated = live.filter((t) => !known(t)).sort((a, b) => a.seq - b.seq);
  return [...dated, ...undated];
}

/** One idea's life, in the same order replay uses (rejected events kept but marked). */
export function lifeOf<T extends Thought>(list: T[], ideaId: string): T[] {
  const mine = list.filter((t) => t.idea_id === ideaId);
  const order = new Map(replayOrder(mine).map((t, i) => [t.id, i]));
  return [...mine].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.seq - b.seq);
}

type Names = { idea: (id: string | null) => string | null; person: (id: string | null) => string | null };

/** The verb phrase for the timeline, e.g. "challenged by “X”". */
export function thoughtPhrase(t: Thought, n: Names): string {
  const rel = n.idea(t.related_idea_id);
  switch (t.type) {
    case "raised": return rel ? `raised, from “${rel}”` : "raised";
    case "challenged": return rel ? `challenged by “${rel}”` : "challenged";
    case "refined": return rel ? `refined “${rel}”` : "refined";
    case "merged": return rel ? `merged with “${rel}”` : "merged";
    case "rested": return "rested";
    case "revived": return "revived";
    case "settled": { const k = settledKindLabel(t.settled_kind); return k ? `settled as ${k}` : "settled"; }
    case "reopened": return "reopened";
    default: return String(t.type);
  }
}

/** One sentence for replay: who, what happened to which idea, and when. */
export function thoughtSentence(t: Thought, n: Names): string {
  const who = n.person(t.person_id);
  const idea = n.idea(t.idea_id) ?? "an idea";
  const when = formatTime(t.occurred_at, t.time_precision);
  return `${who ? who + ": " : ""}“${idea}” ${thoughtPhrase(t, n)} · ${when}.`;
}
