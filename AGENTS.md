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
- Type (v1.5.2 printing house): only IM Fell faces for Latin (Double Pica = display, English = text, English SC = small caps/records, English Italic in --sepia = marginalia via `hand`) and Noto Serif SC upright for Chinese; Tailwind font-mono maps to the SC face; CJK runs are wrapped (runs() in src/lib/epigraphs.ts) and font-synthesis is none.
- Labels never cut the trunk: no mask or opaque box behind labels; readability is a faint low-opacity paper halo plus placement beside branches (user override of v1.5.2 masking); epigraphs come only from PAIRS in src/lib/epigraphs.ts, kept identical to docs/epigraphs.md by a test; Systema (src/lib/stam/systema.ts) is the table view of a garden.
- Tree is drawn, not rendered: #pen displacement filter, left-handed hatch patterns on branches wider than 8px, uneven merge dashes, offset double knot rings; margin notes are the StamTree `notes` prop.
- Motion is growth only (branch draw, knot tighten, tip pulse); everything is disabled under prefers-reduced-motion.
- Labels never collide: computeLayout takes measured widths and an obstacle rect (specimen card) and scores candidates against labels, nodes and sampled branch/merge points; keep src/lib/stam/focus.test.ts passing.
- Concept tooltip lines live in REASONS (src/lib/stam/focus.ts); empty states use <Seed/>; garden vocabulary only, never "generate"/magic/sparkles.
- Thought events (what happened to an idea in the discussion) live in thought_events, separate from the events audit log; every garden write records both through the record_action RPC so they share one transaction. Why: the audit log and the discussion history answer different questions and must never drift apart.
- thought_events is insert-only (no UPDATE/DELETE grants plus a guard trigger); confirmed/rejected_at are set once only via review_thought_event, and corrections are new rows with corrects_event_id. Why: history is evidence and must not be rewritten.
- Digits everywhere render from a "Ramus Digits" alias of Noto Serif SC (self-hosted in public/fonts, unicode-range 0-9) placed first in every font token. Why: IM Fell old-style zero reads as the letter o.

## Reading hierarchy
- Principle 14 — Show what matters first (Herbert Simon, “The Architecture of Complexity”, 1962): levels change emphasis, never what exists; retain every idea while showing the question, outcomes, main growth, then the full record.
- Compute main lineage and reading detail in pure src/lib/stam/reading.ts; keep layout inputs independent of reading level. Why: switching depth must preserve the mental map and remain testable.
- Outcome writes use the authenticated setOutcome server function and atomic set_idea_outcome RPC, with validation and an audit entry, never a fabricated thought event. Why: only people decide outcomes, and changing emphasis is not rewriting discussion history.
- Remember reading depth under a user-and-garden-scoped local preference. Why: another person's choice must not change this person's reading level.
- The public /genesis page reads bundled historical demo content, never authenticated archive records; English demo labels are presentation-only and export retains original labels. Why: public readings must not expose private gardens or rewrite their source.

## Intake (Accession, v2.0)
- Rule: keep the original, prepare the structure, never change the words. Full text in docs/project-knowledge.md ("Bringing words in").
- src/lib/intake is pure and deterministic (no network, no AI, no clock): prepare(input, options, context) returns a Draft. Every format has fixtures and the invariant tests in intake.test.ts (coverage, words unchanged, no invented times, determinism, stable ids, real-name aliases). Add a fixture and a test with every parser change.
- receiveBatch re-runs prepare() on the server from the original and the options, checks the invariants with checkDraft, then writes through the receive_batch RPC in one transaction. Why: the browser preview is a convenience, never the source of truth.
- Large originals are never loaded with a conversation; getBatchOriginal fetches one when someone opens it.

