export type EvidenceRole = "origin" | "restated" | "supports" | "challenges";
export const ROLE_ORDER: EvidenceRole[] = ["origin", "restated", "supports", "challenges"];
export const ROLE_LABEL: Record<EvidenceRole, string> = { origin: "Origin", restated: "Restated", supports: "Supports", challenges: "Challenges" };
export const NATURES = ["refines", "answers", "challenges", "splits", "combines"] as const;
export type Nature = (typeof NATURES)[number];

/** Origin first, then restated, supports, challenges; stable by message sequence. */
export function sortEvidence<T extends { role: string; sequence?: number | null }>(list: T[]): T[] {
  const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r as EvidenceRole); return i < 0 ? 99 : i; };
  return [...list].sort((a, b) => rank(a.role) - rank(b.role) || (a.sequence ?? 0) - (b.sequence ?? 0));
}

/** Format a stored time at its precision. Missing times read "time unknown" — never today's date. */
export function formatTime(value: string | null | undefined, precision: string = "unknown"): string {
  if (!value || precision === "unknown") return "time unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "time unknown";
  const iso = d.toISOString();
  if (precision === "day") return iso.slice(0, 10);
  if (precision === "minute") return iso.slice(0, 16).replace("T", " ");
  return iso.slice(0, 19).replace("T", " ");
}
/** For date-only columns (e.g. conversations.happened_at). */
export const formatDate = (value: string | null | undefined) => (value ? value.slice(0, 10) : "time unknown");
