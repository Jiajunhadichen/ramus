/**
 * What Ramus may spend on reading, and how much each person may grow (pure, no clock, no network).
 *
 * The numbers are the product's budget (user decision, Nov 2026): at most about 1000 SEK a month on Lovable,
 * on the Pro plan with 200 credits. A credit is worth $0.25 of model cost, and roughly 140 credits a month go to
 * reading (the rest to building), so the whole site may spend about $1.15 of model cost a day. Change the
 * numbers here; nothing else needs to move.
 */

/** Model prices in USD per million tokens. Flash is counted at its standard price from 2027, not the 2026 introductory one. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "openai/gpt-5.5": { input: 5, output: 30 },
  "google/gemini-3.7-flash": { input: 1.5, output: 7.5 },
};

export const STRONG_MODEL = "openai/gpt-5.5";
export const CHEAP_MODEL = "google/gemini-3.7-flash";

export const LIMITS = {
  /** growths a signed-up person may start per UTC day (a new tree, or more words grown onto one) */
  treesPerDay: 3,
  /** growths a guest may start before signing up */
  guestTrees: 1,
  /** characters read per growth, and readings per growth (a reading is up to 24 messages or 40,000 characters):
   *  each reading is one answer from the model, and answers cost more than the words read, so both are capped.
   *  The rest is kept in the archive, unread. */
  maxChars: { member: 120_000, guest: 40_000 },
  maxParts: { member: 8, guest: 3 },
  /** characters of loose text reconstructed (who said what) per source */
  maxRebuildChars: { member: 120_000, guest: 40_000 },
  /** reconstruction calls per UTC day (one call reads up to ~50,000 characters) */
  rebuildsPerDay: { member: 12, guest: 3 },
  /** the whole site per UTC day: up to here the strong model reads */
  strongUsd: 0.8,
  /** the whole site per UTC day: from strongUsd to here the cheaper model reads; beyond it nothing is read until tomorrow */
  dailyUsd: 1.15,
} as const;

export type Usage = { input: number; output: number };

/** Model cost of one call in USD. Unknown models are priced as the strong one, so a new name never reads as free. */
export function costOf(model: string, usage: Usage): number {
  const p = PRICES[model] ?? PRICES[STRONG_MODEL]!;
  return (Math.max(0, usage.input) * p.input + Math.max(0, usage.output) * p.output) / 1_000_000;
}

/** When the gateway does not report tokens: about 2.5 characters a token for mixed Chinese and English, and a full answer. */
export function guessUsage(promptChars: number): Usage {
  return { input: Math.ceil(promptChars / 2.5), output: 8000 };
}

/** Read the token counts an OpenAI-style answer reports, if it reports them. */
export function usageOf(body: unknown): Usage | null {
  const u = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  if (!u || typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number") return null;
  return { input: u.prompt_tokens, output: u.completion_tokens };
}

export type Reader = {
  /** an anonymous session that has not signed up */
  guest: boolean;
  /** growths this person started today (UTC) */
  treesToday: number;
  /** growths this person ever started (only counted for guests) */
  treesEver: number;
  /** reconstruction calls this person made today (UTC) */
  rebuildsToday: number;
};
export type Site = { spentTodayUsd: number };

export type Decision = { ok: true; models: string[] } | { ok: false; reason: string };

const SITE_FULL = "Ramus has read as much as it can today. The garden opens again tomorrow (00:00 UTC); what you brought in is kept.";

/** Which models read now, or why nothing does: the strong model while the day's budget lasts, then the cheaper one. */
export function modelsToday(site: Site): Decision {
  if (site.spentTodayUsd >= LIMITS.dailyUsd) return { ok: false, reason: SITE_FULL };
  return { ok: true, models: site.spentTodayUsd < LIMITS.strongUsd ? [STRONG_MODEL, CHEAP_MODEL] : [CHEAP_MODEL] };
}

/** May this person start a growth now? Checked once, before the first reading of a growth. */
export function mayStartGrowth(r: Reader, site: Site): Decision {
  if (r.guest && r.treesEver >= LIMITS.guestTrees) return { ok: false, reason: "That was your free tree. Sign up to keep it and grow more; it stays yours." };
  if (!r.guest && r.treesToday >= LIMITS.treesPerDay) return { ok: false, reason: `You have grown ${LIMITS.treesPerDay} trees today. You can grow more tomorrow (00:00 UTC); what you brought in is kept.` };
  return modelsToday(site);
}

/** May this person have loose text read for who said what? When not, the words are still kept, unattributed. */
export function mayRebuild(r: Reader, site: Site, chars: number): Decision {
  const max = r.guest ? LIMITS.maxRebuildChars.guest : LIMITS.maxRebuildChars.member;
  if (chars > max) return { ok: false, reason: `This is longer than ${max.toLocaleString("en")} characters, so Ramus keeps it and grows it with the words unattributed.` };
  const perDay = r.guest ? LIMITS.rebuildsPerDay.guest : LIMITS.rebuildsPerDay.member;
  if (r.rebuildsToday >= perDay) return { ok: false, reason: "Ramus has read enough voices for you today; this is kept and grown with the words unattributed." };
  return modelsToday(site);
}

/** How many readings of a growth are read, given each reading's length in characters: the leading readings that fit
 *  the length and the count, and always the first one. The rest stays in the archive. */
export function partsToRead(guest: boolean, sizes: number[]): number {
  const maxChars = guest ? LIMITS.maxChars.guest : LIMITS.maxChars.member;
  const maxParts = guest ? LIMITS.maxParts.guest : LIMITS.maxParts.member;
  let n = 0, chars = 0;
  for (const size of sizes) {
    if (n >= maxParts || (n > 0 && chars + size > maxChars)) break;
    chars += size; n++;
  }
  return n;
}

/** What the person is told before they start: how many growths are left, and whether the site still reads today. */
export function allowance(r: Reader, site: Site): { guest: boolean; left: number; siteOpen: boolean } {
  const left = r.guest ? Math.max(0, LIMITS.guestTrees - r.treesEver) : Math.max(0, LIMITS.treesPerDay - r.treesToday);
  return { guest: r.guest, left, siteOpen: site.spentTodayUsd < LIMITS.dailyUsd };
}

/** Midnight UTC of the day `now` falls in, as an ISO string (the day the limits count). */
export function dayStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
