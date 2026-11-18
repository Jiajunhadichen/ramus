import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { completeness, parseTopicUrl, readWholeTopic } from "./intake/discourse";


async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Ramus (discussion archive)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (r.status === 404) throw new Error("This discussion was not found. It may be private or removed.");
  if (r.status === 403 || r.status === 401) throw new Error("This discussion is not public, so Ramus cannot read it.");
  if (r.status === 429) throw new Error("The forum asked Ramus to slow down. Try again in a minute.");
  if (!r.ok) throw new Error(`The forum answered with an error (${r.status}).`);
  if (!(r.headers.get("content-type") ?? "").includes("json")) throw new Error("This address is not a Discourse discussion.");
  return r.json();
}

/**
 * Reads a whole public Discourse topic through Discourse's JSON API, every page of posts,
 * and returns it as one JSON original. It reports what is missing instead of hiding it.
 */
export const fetchDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => {
    if (typeof d?.url !== "string" || d.url.length > 2000 || !parseTopicUrl(d.url)) throw new Error("That is not the address of a public Discourse discussion (https://…/t/…).");
    return d;
  })
  .handler(async ({ data }) => {
    const a = parseTopicUrl(data.url)!;
    const slim = await readWholeTopic(a, getJson);
    const c = completeness(slim);
    return { title: String(slim.title), url: slim.source_url as string, text: JSON.stringify(slim), expected: c.expected, received: c.received, participants: c.participants };
  });
