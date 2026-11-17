/**
 * English readings of the historical demo, from the curated edition docs/sample-garden.en.json.
 * Display only: never used for user-authored ideas, and the stored records stay the historical original.
 */
import en from "../../../docs/sample-garden.en.json";

type EnNode = { id: string; label: string; note?: string; by: string };
const nodes = (en as { nodes: EnNode[] }).nodes;

export const DEMO_LABELS: Record<string, string> = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
export const DEMO_NOTES: Record<string, string> = Object.fromEntries(nodes.filter((n) => n.note).map((n) => [n.id, n.note!]));
export const DEMO_STEPS: Record<number, string> = Object.fromEntries(Object.entries(en.steps as Record<string, string>).map(([k, v]) => [Number(k), v]));
export const DEMO_COLLECTED: string = en.collected;
export const DEMO_PEOPLE: Record<string, string> = { 你: "Founder" };

/** The demo read in English: label, note and contributor. */
export function demoInEnglish<T extends { id: string; label: string; by: string; note?: string | null }>(n: T): T {
  return { ...n, label: DEMO_LABELS[n.id] ?? n.label, by: DEMO_PEOPLE[n.by] ?? n.by, ...(n.note != null || DEMO_NOTES[n.id] ? { note: DEMO_NOTES[n.id] ?? n.note } : {}) };
}
