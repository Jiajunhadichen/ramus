/**
 * The gardener's one call to a model, through Lovable's AI gateway (server only).
 * LOVABLE_API_KEY is created by Lovable for every Cloud project and never reaches the browser.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** Tried in order; a model the gateway does not know falls through to the next. */
/** The stronger model reads first: the tree's grain (every option, deep lines, merges) depends on careful reading. */
export const GARDENER_MODELS = ["openai/gpt-5.5", "google/gemini-3.7-flash"];
/** Who said what is read once per source and decides every colour on the tree: the stronger model reads it first. */
export const RECONSTRUCTION_MODELS = ["openai/gpt-5.5", "google/gemini-3.7-flash"];

export class GardenerUnavailable extends Error {}

type Fetch = typeof fetch;

function textOf(body: unknown): string {
  const c = (body as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : "")).join("");
  return "";
}

/** Ask once; returns the model's text and which model answered. Errors are plain sentences for people. */
export async function askGardener(system: string, user: string, opts: { fetchImpl?: Fetch; apiKey?: string | undefined; timeoutMs?: number; models?: string[] } = {}): Promise<{ text: string; model: string }> {
  const key = opts.apiKey ?? process.env["LOVABLE_API_KEY"];
  if (!key) throw new GardenerUnavailable("The gardener is not set up for this project yet: Lovable AI is not enabled, so there is no LOVABLE_API_KEY.");
  const doFetch = opts.fetchImpl ?? fetch;
  let lastProblem = "";
  for (const model of opts.models?.length ? opts.models : GARDENER_MODELS) {
    for (const json of [true, false]) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 150_000);
      let res: Response;
      try {
        res = await doFetch(GATEWAY, {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Lovable-API-Key": key },
          body: JSON.stringify({
            model, temperature: 0.2,
            messages: [{ role: "system", content: system }, { role: "user", content: user }],
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (e) {
        clearTimeout(timer);
        throw new GardenerUnavailable((e as Error).name === "AbortError" ? "The gardener took too long to read this conversation. Try again, or bring in a shorter part." : "The gardener could not be reached. Try again in a moment.");
      }
      clearTimeout(timer);
      if (res.ok) {
        const text = textOf(await res.json());
        if (text.trim()) return { text, model };
        lastProblem = "an empty answer";
        break;
      }
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 402) throw new GardenerUnavailable("The AI allowance for this project is used up. The gardener can read again when Lovable credits are available.");
      if (res.status === 429) throw new GardenerUnavailable("The gardener is reading too much at once. Try again in a minute.");
      if (res.status === 401 || res.status === 403) throw new GardenerUnavailable("The gardener’s key was refused. Check that Lovable AI is enabled for this project.");
      lastProblem = `${res.status} ${detail}`;
      // the JSON mode may be what the model refused; try once without it, then the next model
      if (res.status === 400 && json && /response_format|json/i.test(detail)) continue;
      break;
    }
  }
  throw new GardenerUnavailable(`The gardener could not read this conversation (${lastProblem.trim() || "no model answered"}).`);
}
