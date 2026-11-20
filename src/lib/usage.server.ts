/**
 * Counting what reading costs (server only). Every model call is written to public.ai_usage with its tokens and
 * its cost in USD; the limits in src/lib/budget.ts are checked against those rows. The table has row level security
 * on and no policies, so only this server (service role) can read or write it: no one can forge, hide or inflate a
 * count from the browser.
 *
 * Load it inside server handlers: `const usage = await import("@/lib/usage.server")`.
 *
 * Until the table exists (it is created in Lovable), counts read as zero and writes are skipped, so the app keeps
 * working; Lovable's own usage limit stays the backstop.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { costOf, dayStart, type Reader, type Site, type Usage } from "./budget";

export type UsageKind = "tree" | "structure" | "inventory" | "harvest" | "regrow" | "rebuild";

// ai_usage is created by a Lovable migration; until the generated types know it, it is reached untyped.
const db = () => supabaseAdmin as unknown as SupabaseClient;

let warned = false;
function missing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const gone = error.code === "42P01" || error.code === "PGRST205" || /ai_usage/.test(error.message ?? "");
  if (!warned) { warned = true; console.warn(`[usage] ${gone ? "public.ai_usage does not exist yet; limits are not enforced" : error.message}`); }
  return true;
}

/** Is this session a guest (an anonymous sign-in that has not become an account)? */
export function isGuest(claims: unknown): boolean {
  return (claims as { is_anonymous?: unknown } | null)?.is_anonymous === true;
}

async function count(userId: string, kind: UsageKind, since: string | null): Promise<number> {
  let q = db().from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", kind);
  if (since) q = q.gte("created_at", since);
  const { count: n, error } = await q;
  return missing(error) ? 0 : n ?? 0;
}

/** What this person has used: growths today (and ever, for a guest) and reconstruction calls today. */
export async function readerOf(userId: string, guest: boolean, now = new Date()): Promise<Reader> {
  const since = dayStart(now);
  const [treesToday, treesEver, rebuildsToday] = await Promise.all([
    count(userId, "tree", since),
    guest ? count(userId, "tree", null) : Promise.resolve(0),
    count(userId, "rebuild", since),
  ]);
  return { guest, treesToday, treesEver, rebuildsToday };
}

/** What the whole site has spent on models today (UTC). */
export async function siteToday(now = new Date()): Promise<Site> {
  const { data, error } = await db().from("ai_usage").select("usd").gte("created_at", dayStart(now)).limit(10_000);
  if (missing(error)) return { spentTodayUsd: 0 };
  return { spentTodayUsd: (data ?? []).reduce((s, r) => s + Number((r as { usd: unknown }).usd ?? 0), 0) };
}

/** Write one row: a growth started ("tree", no cost) or one model call with its tokens and cost. Never throws. */
export async function record(row: { userId: string; gardenId: string | null; kind: UsageKind; guest: boolean; model?: string | null; usage?: Usage | null }): Promise<void> {
  const usage = row.usage ?? { input: 0, output: 0 };
  const { error } = await db().from("ai_usage").insert({
    user_id: row.userId, garden_id: row.gardenId, kind: row.kind, guest: row.guest, model: row.model ?? null,
    input_tokens: usage.input, output_tokens: usage.output, usd: row.model ? costOf(row.model, usage) : 0,
  });
  missing(error);
}
