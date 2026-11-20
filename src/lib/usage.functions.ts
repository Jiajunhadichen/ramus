import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowance, LIMITS } from "./budget";

/** How many growths this person has left today, and whether Ramus still reads today (shown before they grow). */
export const getAllowance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const usage = await import("@/lib/usage.server");
    const guest = usage.isGuest(context.claims);
    const [reader, site] = await Promise.all([usage.readerOf(context.userId, guest), usage.siteToday()]);
    return { ...allowance(reader, site), perDay: guest ? LIMITS.guestTrees : LIMITS.treesPerDay };
  });
