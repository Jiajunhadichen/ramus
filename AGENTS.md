<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Ramus architecture
- Product knowledge lives in docs/project-knowledge.md; its principles are product rules.
- Every garden write goes through a createServerFn in src/lib/garden.functions.ts that runs validateGarden (src/lib/stam/validate.ts) before writing and logs an event; there is no delete path.
- Tree layout and validation are pure functions in src/lib/stam with vitest tests; StamTree (src/components/stam-tree) is plain SVG ported from docs/tree-prototype.html.
- Ideas carry a per-garden `key` that is the Stam JSON id, so import/export round-trips.
- Archive vs garden: conversations and messages are insert-only (DB triggers reject update/delete); ideas rest on messages via idea_evidence. ideas.message_id/conversation_id/source_excerpt are deprecated and must not be written.
- Times are never invented: missing times render via formatTime/formatDate in src/lib/stam/evidence.ts as "time unknown".

## Aesthetics (v1.5) — full text in docs/design-principles.md
- docs/tree-prototype.html is the aesthetic reference; light paper is the default theme, Night is an opt-in .dark class stored in localStorage (never follow the OS setting).
- Color only means people; states are shown by form (hollow = resting, double ring = knot, dashed = merge/unconfirmed), never by new UI colors.
- Type (v1.5.1 notebook): EB Garamond (+Noto Serif SC) for headings, body and tree labels; IM Fell English Italic in --sepia only for margin notes/questions/quotes (`hand` utility); IBM Plex Mono for records. No East Asian decorative motifs, no fake parchment.
- Tree is drawn, not rendered: #pen displacement filter, left-handed hatch patterns on branches wider than 6px, uneven merge dashes, offset double knot rings; margin notes are the StamTree `notes` prop.
- Motion is growth only (branch draw, knot tighten, tip pulse); everything is disabled under prefers-reduced-motion.
- Labels never collide: computeLayout takes measured widths and an obstacle rect (specimen card) and scores candidates against labels, nodes and sampled branch/merge points; keep src/lib/stam/focus.test.ts passing.
- Concept tooltip lines live in REASONS (src/lib/stam/focus.ts); empty states use <Seed/>; garden vocabulary only, never "generate"/magic/sparkles.
