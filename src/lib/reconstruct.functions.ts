import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askGardener } from "./gardener/ai";
import { mayRebuild } from "./budget";
import { parseAnswer } from "./gardener/harvest";
import { checkReconstructionPart, contextVoices, readingParts, reconstructionPrompt, type ReVoice } from "./intake/reconstruct";

/** Beyond this the request is refused outright; the budget (src/lib/budget.ts) sets the length actually reconstructed. */
const MAX_TEXT = 400_000;

/**
 * Reconstruct one part of loose text: which lines form each message, and which anonymous voice says it.
 * The browser calls this part after part with the masked words it previewed, then keeps the merged result with
 * the source's options, so the server later applies exactly that (prepare → validateReconstruction).
 * With the person's context, names come only from it; without it, names the model is reasonably sure of are
 * applied as inferred (shown as Ramus's reading, correctable), and low guesses come back as suggestions.
 */
export const reconstructSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; context: string | null; knownVoices: string[]; part: number; voices: ReVoice[] }) => {
    if (typeof d?.text !== "string" || !d.text.trim()) throw new Error("There are no words to read.");
    if (d.text.length > MAX_TEXT) throw new Error("This is too long to reconstruct; it will be kept and grown with the words unattributed.");
    if (!Number.isInteger(d.part) || d.part < 0) throw new Error("Unknown part.");
    return {
      text: d.text,
      context: typeof d.context === "string" ? d.context.slice(0, 500) : null,
      knownVoices: (Array.isArray(d.knownVoices) ? d.knownVoices : []).filter((v): v is string => typeof v === "string").slice(0, 20),
      part: d.part,
      voices: (Array.isArray(d.voices) ? d.voices : []).slice(0, 20),
    };
  })
  .handler(async ({ data, context }) => {
    const parts = readingParts(data.text);
    const part = parts[data.part];
    const participants = [...new Set([...data.knownVoices, ...contextVoices(data.context)].map((v) => v.trim()).filter(Boolean))];
    if (!part) return { parts: parts.length, blocks: [], voices: data.voices, warnings: [], model: null as string | null, participants };
    // within the person's and the site's daily budget; when over it, the words are kept and grown unattributed
    const usage = await import("@/lib/usage.server");
    const guest = usage.isGuest(context.claims);
    const allowed = mayRebuild(await usage.readerOf(context.userId, guest), await usage.siteToday(), data.text.length);
    if (!allowed.ok) throw new Error(allowed.reason);
    const p = reconstructionPrompt(data.text, part, { participants, context: data.context, voices: data.voices });
    const asked = await askGardener(p.system, p.user, { models: allowed.models });
    await usage.record({ userId: context.userId, gardenId: null, kind: "rebuild", guest, model: asked.model, usage: asked.usage });
    const checked = checkReconstructionPart(parseAnswer(asked.text), data.text, part, participants, data.voices);
    return { parts: parts.length, ...checked, model: asked.model as string | null, participants };
  });
