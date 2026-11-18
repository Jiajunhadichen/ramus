/**
 * Several conversations read as one stream, in the order things were said.
 * Pure: no network, no database.
 *
 * - Inside one conversation the order is the source's own order; it is never rearranged.
 * - A message without a time takes its place right after the message before it.
 * - Conversations are interleaved by time where their times are known.
 * - A conversation with no times at all cannot be placed among the others: it follows them,
 *   in the order it was brought in, and the gardener is told its times are unknown.
 */
export type StreamMessage = {
  /** position of its conversation in the order the conversations were brought in */
  conversation: number;
  /** position inside its conversation */
  sequence: number;
  sentAt: string | null;
  precision: string | null;
};

const known = (m: StreamMessage) => !!m.sentAt && m.precision !== "unknown" && !Number.isNaN(Date.parse(m.sentAt));

export function inTimeOrder<T extends StreamMessage>(messages: T[]): T[] {
  const byConv = new Map<number, T[]>();
  for (const m of messages) byConv.set(m.conversation, [...(byConv.get(m.conversation) ?? []), m]);
  const timed: { m: T; at: number }[] = [];
  const untimed: T[] = [];
  for (const [, list] of [...byConv.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.sequence - b.sequence);
    const first = list.find(known);
    if (!first) { untimed.push(...list); continue; }
    // messages before the first known time share it; after that the clock only moves forward
    let at = Date.parse(first.sentAt!);
    for (const m of list) {
      if (known(m)) at = Math.max(at, Date.parse(m.sentAt!));
      timed.push({ m, at });
    }
  }
  timed.sort((a, b) => a.at - b.at || a.m.conversation - b.m.conversation || a.m.sequence - b.m.sequence);
  return [...timed.map((x) => x.m), ...untimed];
}

/** Parts of the stream that fit one reading each, in order; every message is read exactly once. */
export function parts<T extends { content: string }>(messages: T[], budget = 90000, maxMessages = Infinity): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let from = 0, size = 0;
  messages.forEach((m, i) => {
    const n = m.content.length + 40;
    if (i > from && (size + n > budget || i - from >= maxMessages)) { out.push({ from, to: i }); from = i; size = 0; }
    size += n;
  });
  if (from < messages.length) out.push({ from, to: messages.length });
  return out;
}
