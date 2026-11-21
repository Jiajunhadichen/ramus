import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Rpc = (f: string, a: object) => Promise<{ error: { code?: string; message?: string } | null }>;

/**
 * Delete the account and everything it started: every garden this person created (its tree, its conversations
 * and their original files, for everyone in it), then the sign-in itself. Gardens other people started stay
 * theirs. The garden steps are the ones the owner takes by hand (trash, then delete forever), so the database's
 * guards apply exactly as they do there.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { confirm: string }) => {
    if (d?.confirm?.trim().toLowerCase() !== "delete") throw new Error("Type delete to confirm.");
    return d;
  })
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const rpc = supabase.rpc as unknown as Rpc;
    const { data: gardens, error } = await supabase.from("gardens").select("id,deleted_at").eq("created_by", userId);
    if (error) throw new Error(error.message);
    for (const g of gardens ?? []) {
      if (!g.deleted_at) {
        const t = await rpc("trash_garden", { _garden: g.id, _trash: true });
        if (t.error) throw new Error(`A garden could not be deleted: ${t.error.message ?? "unknown error"}. Nothing else was removed.`);
      }
      const bucket = supabase.storage.from("conversation-originals");
      for (let round = 0; round < 50; round++) {
        const { data: files } = await bucket.list(g.id, { limit: 100 });
        const names = (files ?? []).filter((f) => f.name && f.id).map((f) => `${g.id}/${f.name}`);
        if (!names.length || (await bucket.remove(names)).error) break;
      }
      const d = await rpc("delete_garden_forever", { _garden: g.id });
      if (d.error) throw new Error(`A garden could not be deleted: ${d.error.message ?? "unknown error"}. Your account is still there; try again.`);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const gone = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (gone.error) throw new Error(`Your gardens are deleted, but the account could not be: ${gone.error.message}. Try again.`);
    return { ok: true, gardens: gardens?.length ?? 0 };
  });
