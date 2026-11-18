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
- Every garden write goes through a createServerFn in src/lib/garden.functions.ts that runs validateGarden (src/lib/stam/validate.ts) before writing and logs an event. Inside a garden nothing is deleted. A whole garden can be renamed (writers), moved to the trash and restored (owner; trash_garden RPC, gardens.deleted_at), and deleted forever from the trash (owner; delete_garden_forever RPC, which alone may pass the insert-only guards, for that one garden). Why: people manage gardens like notes, while the history inside one stays evidence.
- Tree layout and validation are pure functions in src/lib/stam with vitest tests; StamTree (src/components/stam-tree) is plain SVG ported from docs/tree-prototype.html.
- Ideas carry a per-garden `key` that is the Stam JSON id, so import/export round-trips.
- Archive vs garden: conversations and messages are insert-only (DB triggers reject update/delete); ideas rest on messages via idea_evidence. ideas.message_id/conversation_id/source_excerpt are deprecated and must not be written.
- Times are never invented: missing times render via formatTime/formatDate in src/lib/stam/evidence.ts as "time unknown".

## Aesthetics (v1.5) — full text in docs/design-principles.md
- docs/tree-prototype.html is the aesthetic reference; light paper is the default theme, Night is an opt-in .dark class stored in localStorage (never follow the OS setting).
- Color only means people; states are shown by form (hollow = resting, double ring = knot, dashed = merge/unconfirmed), never by new UI colors.
- Type (v1.5.2 printing house): only IM Fell faces for Latin (Double Pica = display, English = text, English SC = small caps/records, English Italic in --sepia = marginalia via `hand`) and Noto Serif SC upright for Chinese; Tailwind font-mono maps to the SC face; CJK runs are wrapped (runs() in src/lib/epigraphs.ts) and font-synthesis is none.
- Labels never cut the trunk: no mask or opaque box behind labels; readability is a faint low-opacity paper halo plus placement beside branches (user override of v1.5.2 masking); epigraphs come only from PAIRS in src/lib/epigraphs.ts, kept identical to docs/epigraphs.md by a test; Systema (src/lib/stam/systema.ts, pure + tests) reads a garden step by step: per step, who raised each idea, how it grew, its note; reading level picks what is written out, the rest is named. Why: a column table by ancestry was unreadable even to the people who had the discussion.
- Tree is drawn, not rendered: #pen displacement filter, left-handed hatch patterns on branches wider than 8px, uneven merge dashes, offset double knot rings; margin notes are the StamTree `notes` prop.
- Motion is growth only (branch draw, knot tighten, tip pulse); everything is disabled under prefers-reduced-motion.
- Labels never collide: computeLayout takes measured widths and an obstacle rect (specimen card) and scores candidates against labels, nodes and sampled branch/merge points; keep src/lib/stam/focus.test.ts passing.
- Concept tooltip lines live in REASONS (src/lib/stam/focus.ts); empty states use <Seed/>; garden vocabulary only, never "generate"/magic/sparkles.
- Thought events (what happened to an idea in the discussion) live in thought_events, separate from the events audit log; every garden write records both through the record_action RPC so they share one transaction. Why: the audit log and the discussion history answer different questions and must never drift apart.
- thought_events is insert-only (no UPDATE/DELETE grants plus a guard trigger); confirmed/rejected_at are set once only via review_thought_event, and corrections are new rows with corrects_event_id. Why: history is evidence and must not be rewritten.
- Digits everywhere render from a "Ramus Digits" alias of Noto Serif SC (self-hosted in public/fonts, unicode-range 0-9) placed first in every font token. Why: IM Fell old-style zero reads as the letter o.

## Showing a garden (v2.4)
- Fonts are self-hosted from npm (@fontsource IM Fell Double Pica / English / English SC, Noto Serif SC 400 in unicode-range slices), imported at the top of src/styles.css; never load fonts from a third-party URL. Why: a downloaded tree must embed the exact files on screen (a cross-origin font sheet cannot be read back), and readers' browsers should not call Google.
- Download (src/components/garden/DownloadTree.tsx → src/lib/export/treeImage.ts) exports the live StamTree SVG: computed styles inlined, colors resolved to rgb through a 1×1 canvas, pan/zoom reset, hover/pulse/grow masks dropped. The SVG embeds fonts as data URLs with their unicode-range (src/lib/export/fonts.ts picks only the slices covering characters drawn in each family; pure, tested). The PNG draws the shapes as an image and then the words with canvas text in the page's loaded fonts at getStartPositionOfChar positions, because browsers rasterise an SVG image before its fonts load. Why: the shared image is the main way people see Ramus, so it must look exactly like the screen.
- Present (src/components/garden/Present.tsx) reuses StamTree and the Story's StoryEntry; slides are the question, each step, and where it has reached. Why: showing how an idea grew is half of Ramus's value, and it should not need a second design language.

## Reading hierarchy
- Principle 14 — Show what matters first (Herbert Simon, “The Architecture of Complexity”, 1962): levels change emphasis, never what exists; retain every idea while showing the question, outcomes, main growth, then the full record.
- Compute main lineage and reading detail in pure src/lib/stam/reading.ts; keep layout inputs independent of reading level. Why: switching depth must preserve the mental map and remain testable.
- Outcome writes use the authenticated setOutcome server function and atomic set_idea_outcome RPC, with validation and an audit entry, never a fabricated thought event. Why: only people decide outcomes, and changing emphasis is not rewriting discussion history.
- v2.7: workspace labels come from pure src/lib/stam/labels.ts (no reading switch); card people = distinct planters (src/lib/stam/people.ts); downloads render an off-screen poster StamTree. Why: testable rules, honest counts, whole-tree images.
- The public /genesis page reads bundled historical demo content, never authenticated archive records; English demo labels are presentation-only and export retains original labels. Why: public readings must not expose private gardens or rewrite their source.

## Intake (Accession, v2.0)
- Rule: keep the original, prepare the structure, never change the words. Full text in docs/project-knowledge.md ("Bringing words in").
- src/lib/intake is pure and deterministic (no network, no AI, no clock): prepare(input, options, context) returns a Draft. Every format has fixtures and the invariant tests in intake.test.ts (coverage, words unchanged, no invented times, determinism, stable ids, real-name aliases). Add a fixture and a test with every parser change.
- receiveBatch re-runs prepare() on the server from the original and the options, checks the invariants with checkDraft, then writes through the receive_batch RPC in one transaction. Why: the browser preview is a convenience, never the source of truth.
- Large originals are never loaded with a conversation; getBatchOriginal fetches one when someone opens it.
- Files are opened by openFiles (src/lib/intake/files.ts, fflate, pure): it picks the words out of .zip and .docx exports and returns the original to keep (never media, never a whole AI export). Tests build real zips; jsdom's TextEncoder arrays come from another realm, so tests create bytes with Buffer.
- Every page that brings words in uses useBringIn (src/hooks/use-bring-in.ts) for paste and drop and opens the window with them. The Accession page (/g/$id/accession, ?into=<conversation>) remains the close-look path for one source.
- Never teach users how to export: accept what they already have (a messy copy, any file) and work it out. The entry is one window (src/components/garden/BringInWindow.tsx) that collects any number of sources and asks nothing but "That's everything — grow the tree"; its choices come from prepareAuto (src/lib/intake/auto.ts, pure, tested), and the server re-prepares with exactly those options. Why: the user decided there are no confirmation steps; the first tree appears as soon as the material is complete.
- Chats copied off a page are read by parseChatCopy (src/lib/intake/chat.ts): it keeps the header shape a page actually uses (name and time on one line, or a name line then a time line), treats bare repeated names as speakers only when nothing better exists, and sets page furniture aside. It reports format "transcript" (the database knows no other name for it) and yields to the transcript reader when headers look like recording offsets. Add a copy-*.txt fixture for every page shape you support.
- Public Discourse discussions are read from their JSON API by fetchDiscussion (src/lib/sources.functions.ts, https-only public hosts) via pure src/lib/intake/discourse.ts (every post page, quotes kept as "> " lines, completeness checked); copied pages are flagged by pageCopySigns and, like incomplete sources, are not read until the person chooses. Why: a copied page is not the conversation.
- Speaker evidence (v3.0): a label becomes a voice only with evidence — source metadata, a real name header (src/lib/intake/names.ts nameShape: headings, Markdown, phrases and sentences are never names), a document made of name lines, a run of real names, or the person's optional "Who speaks here?" (PrepareOptions.knownVoices, restrictive only). Notes are credited to no one unless exactly one voice is named (user_supplied). People mentioned in the words are never speakers. Why: a TXT of headings and argument lines once registered dozens of sentences as contributors.
- Structure reading (src/lib/intake/semantic.ts, pure; tests in semantic.test.ts and fixtures/understanding): for loose sources growTree makes one extra model call per part (understandingPrompt → checkUnderstanding) that labels passages (heading, quote, argument, page_noise…) and may name a probable voice for unattributed words only from the allowed voices; code checks every ref, quote and name, a probable voice is recorded as an "inferred" hint in the audit payload and never becomes a contributor or a colour, and any failure falls back to deterministicReading. Page furniture is left out of the gardener's view only; the archive keeps every word. Exports and timed chats (whatsapp, chatgpt, claude, slack, discourse, vtt, srt) skip it. Why: the input format must not decide whether Ramus can help, and uncertainty about who said something stays visible.
- Format is not authorship (v3.1): reading something as notes says how it is cut, never who wrote it. Role lines copied from AI chat pages ("You said:", "ChatGPT said:", "你说：") are explicit headers (chat.ts ROLE_MARK). Loose text with no attributed voice is reconstructed before it is kept (src/lib/intake/reconstruct.ts, pure; reconstructSource in src/lib/reconstruct.functions.ts, one model call per ~12k characters): the model groups exact line spans into turns with anonymous voices S1, S2… and evidence quotes; with the person's source context ("between Me and ChatGPT", contextVoices) names come only from it; without it, a name the model is reasonably sure of (medium/high, roughly 7 in 10 or better: the person asking an AI is "Me", an AI is named by what the words show) is applied as inferred, shown as Ramus's reading and correctable, while low guesses are only offered. Code refuses names of people the model lists as mentioned, headings and sentences as names, two voices with one name, low-confidence or unevidenced blocks and overlapping blocks; byTurns fills a turn left open between two turns of the other voice when two voices clearly alternate. GPT-5.5 reads first (RECONSTRUCTION_MODELS), in parts of ~50k characters. The reconstruction travels in the batch options and prepare() applies it through validateReconstruction, so the server stores exactly what the person previewed. Why: a whole ChatGPT discussion was once credited to the importer because it was read as notes.
- Product rule (user decision, Nov 2026): a reading that is right seven or eight times in ten is applied without asking, as long as the person can correct it; Ramus never refuses to attribute only because it is not certain. Unsure still means unattributed. The gardener also credits an unattributed idea to a voice the structure reading is reasonably sure of (attribution.basis "inferred").
- An idea's author can be corrected after growing (setIdeaContributor, the author chip in Field Notes): anyone in the garden, someone new, or no one known; renameContributor renames a voice everywhere or folds it into someone already in the garden. Colour, legend, Story and exports follow the contributor; the archive's messages are untouched and the correction is logged (idea_edited, attribution.basis "user_corrected").
- PDFs are read in the browser only (src/lib/intake/pdf.ts, guarded by import.meta.env.SSR so pdf.js stays out of the server bundle); openFiles receives the extracted text and keeps the PDF.

## The gardener (harvest v2.1, grows directly since v2.2)
- src/lib/gardener/harvest.ts is pure: harvestPrompt builds the prompt (garden + messages in time order with short refs m1, m2…, sources named when several), parseAnswer reads the model's JSON, checkHarvest checks every branch (origin exists and has a known speaker, a person or an AI taking part in the conversation, never the gardener; attribution from the origin message, quotes word for word, parents/merges exist, no loops, nothing grows from/merges with/is settled by later words, stages in message order, ≤ 20 branches, ≤ 2 knots per reading; reactions attach support/challenge to existing ideas without new branches, labels ≤ 24 cut between words) and orders parents first. Change the rules there, with tests in harvest.test.ts.
- src/lib/gardener/order.ts is pure: inTimeOrder merges sources into one stream (never reorders inside a source; untimed lines keep their place; untimed sources follow); parts() splits it into readings. Tests in order.test.ts.
- src/lib/gardener/ai.ts is the only model call: Lovable AI gateway (chat completions), models tried in order, plain-language errors for 402/429/missing key. Server only; never import it into browser code.
- growTree reads the time-ordered stream in parts of ≤ 14 messages / 24,000 characters, one part per call, with two model passes (verbatim-checked thought inventory, then relationships) (the browser loops, useGrow in Gardener.tsx) and writes branches straight onto the tree: ideas/links origin 'ai' confirmed true, evidence, knots, steps dated from the messages, one audit event per branch (actor_kind 'ai'), and thought events origin 'ai', confirmed false at message times (written directly, not via record_action, which can only record people). On a fresh garden it names the root. Why: the user decided the first tree needs no confirmation; marking everything as the gardener's keeps the history honest about who said what and who placed it.
- Going back: checkHarvest reads "returns" (to an idea already in the garden, at a message, why, set_aside), keeps a return the people asked for (growTree resumeFrom, chosen with "Grow again from here") even if the model missed it, and re-parents any idea said after the return away from what was set aside. growTree writes a revived thought event on the idea gone back to, rests what was set aside (rested events with the reason), and logs an ai idea_edited event with payload.returned {why, step}; getGarden returns them as `returns` for the tree's margin notes and the Story. Why: going back and growing again from an earlier point is the core real-world use (a result turned down by another team).
- Taking a branch off (reviewSuggestion accept=false) sets rejected_at on it and the gardener's branches growing from it, rejects their open gardener thought events via review_thought_event, and refuses when people have grown their own branches from it. Older unconfirmed suggestions can still be accepted. getGarden hides rejected ideas; exports and specimen counts include only confirmed ideas.


