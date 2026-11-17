/** People (or AIs taking part) who planted at least one idea that is in the tree. Ramus remembers who planted the branches. */
export function planters(ideas: { contributor_id: string | null; confirmed?: boolean | null; rejected_at?: string | null }[]): number {
  return new Set(ideas.filter((i) => i.contributor_id && i.confirmed !== false && !i.rejected_at).map((i) => i.contributor_id)).size;
}
