/** "12:31 into the recording" */
export function formatOffset(ms: number | null | undefined): string {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")} into the recording`;
}
export const HIDDEN_NOTE: Record<string, string> = { system: "set aside: system line", media: "set aside: media placeholder", deleted: "set aside: deleted message", empty: "set aside: empty" };
export function formatWhen(iso: string | null, tz?: string) {
  if (!iso) return "time unknown";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
}
export function browserDateOrder(): "DMY" | "MDY" {
  try {
    const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2000, 10, 22));
    return parts.find((p) => p.type === "month" || p.type === "day")?.type === "month" ? "MDY" : "DMY";
  } catch { return "DMY"; }
}
/** Display only: consecutive messages by the same person within two minutes read as one block. */
export function groupMessages<T extends { contributor_id: string | null; sent_at: string | null }>(ms: T[]): T[][] {
  const out: T[][] = [];
  for (const m of ms) {
    const g = out[out.length - 1], p = g?.[g.length - 1];
    if (g && p && m.contributor_id && p.contributor_id === m.contributor_id && p.sent_at && m.sent_at && Date.parse(m.sent_at) - Date.parse(p.sent_at) <= 120000) g.push(m);
    else out.push([m]);
  }
  return out;
}

/** For each line of the original, the message it belongs to (or -1), found in one pass. */
export function lineOwners(lines: { start: number }[], messages: { rawStart: number | null; rawEnd: number | null }[]): number[] {
  const order = messages.map((_, i) => i).filter((i) => messages[i]!.rawStart != null).sort((a, b) => messages[a]!.rawStart! - messages[b]!.rawStart!);
  const out: number[] = [];
  let k = 0;
  for (const l of lines) {
    while (k < order.length && messages[order[k]!]!.rawEnd! < l.start) k++;
    const i = order[k];
    out.push(i != null && messages[i]!.rawStart! <= l.start && l.start <= messages[i]!.rawEnd! ? i : -1);
  }
  return out;
}
