import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Daily: delete guests (anonymous users) unclaimed for seven days, with their gardens and stored originals.
 *  ai_usage rows are kept (they hold no words). `?user=<uuid>` limits a run to one guest, for testing. */
export const Route = createFileRoute("/api/public/purge-guests")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const only = new URL(request.url).searchParams.get("user");
        const cutoff = Date.now() - WEEK_MS;
        const guests: string[] = [];
        for (let page = 1; page < 100; page++) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          for (const u of data.users) {
            if (!u.is_anonymous || Date.parse(u.created_at) > cutoff) continue;
            if (only && u.id !== only) continue;
            guests.push(u.id);
          }
          if (data.users.length < 1000) break;
        }
        const done: string[] = [];
        const failed: { id: string; error: string }[] = [];
        for (const id of guests) {
          try {
            const { data: gardens } = await supabaseAdmin.from("gardens").select("id").eq("created_by", id);
            for (const g of gardens ?? []) {
              const { data: files } = await supabaseAdmin.storage.from("conversation-originals").list(g.id, { limit: 1000 });
              const paths = (files ?? []).map((f) => `${g.id}/${f.name}`);
              if (paths.length) await supabaseAdmin.storage.from("conversation-originals").remove(paths);
            }
            const { error: pe } = await supabaseAdmin.rpc("purge_guest", { _user: id });
            if (pe) throw new Error(pe.message);
            const { error: de } = await supabaseAdmin.auth.admin.deleteUser(id);
            if (de) throw new Error(de.message);
            done.push(id);
          } catch (e) {
            failed.push({ id, error: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json({ purged: done.length, failed });
      },
    },
  },
});
