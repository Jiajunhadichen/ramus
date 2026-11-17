# Ramus v1 — the garden and the tree (no AI)

## 0. Repo setup
- Save `docs/project-knowledge.md`, `docs/tree-prototype.html`, `docs/sample-garden.json` (copied verbatim from uploads).
- Save the core principles + design tokens to project memory; record architecture rules in `AGENTS.md`.
- Herbarium design system in `src/styles.css`: paper/sheet/ink/muted/rule tokens (light + dark, converted to oklch), person palette tokens, fonts Noto Serif SC / Noto Sans SC / IBM Plex Mono via `<link>` in root head. 1px rules, 4-6px radius, no gradients.

## 1. Backend (Lovable Cloud)
- Enable Cloud, email + password auth (sign in / sign up page at `/auth`).
- One migration: gardens, garden_members, contributors, conversations, messages, steps, ideas, idea_links, events — fields exactly as in the project knowledge, with GRANTs + RLS.
  - Access via `is_garden_member(garden_id)` / `can_write_garden(garden_id)` security-definer helpers.
  - Private ideas readable only by `owner_user_id`.
  - Owner member row created by trigger on garden insert.
  - events: SELECT + INSERT policies only, plus a trigger blocking UPDATE/DELETE. No DELETE policy on ideas (no hard delete).
  - Unique partial index: one primary link per child.
  - conversations: CHECK `consent_confirmed = true`.
- DB-side guard trigger on idea_links (primary chain no cycle, same garden) as a backstop.

## 2. Pure modules (unit-tested with vitest)
- `src/lib/stam/validate.ts` — single `validateGarden(nodes)` used by every write and import: exactly one root ("Exactly one root is needed, found 2"), parents exist, no cycle in primary chain, label <= 24 chars, unique ids. Returns plain-word errors: idea, problem, fix.
- `src/lib/stam/layout.ts` — port of prototype `computeLayout`, `curve`, `taper`, `mergePath`, `thick` unchanged.
- `src/lib/stam/convert.ts` — Stam JSON <-> DB rows; `snapshotAtStep(step)` for replay.
- `src/lib/conversation/split.ts` — split pasted text by `Name:` lines, fallback single message.
- Tests for each rule (two roots, missing parent, cycle, long label, split parsing, step snapshot).

## 3. Server functions (createServerFn + auth middleware)
- Every mutation: load garden graph, apply change in memory, run `validateGarden`, then write rows + an event (idea_created, idea_edited, link_added, status_changed, knot_set, knot_reopened, conversation_added, imported).
- `ensureDemoGarden` on first sign-in: seeds "The origin of Ramus" from sample-garden.json (ChatGPT, Claude = historical_ai; 你 = person), once per user.
- `importGarden` validates first, creates nothing on error. `exportGarden` returns Stam JSON.

## 4. Pages
- `/` landing: Ramus, "Ideas grow between people.", the one-sentence description, demo tree auto-replaying (from bundled sample JSON, no login), "Start a garden" button.
- `/gardens`: specimen cards (name, specimen no., ideas · knots · dormant · merges · people, last change); "New garden" (title + root idea) and "Import Stam JSON" (paste/upload, inline errors).
- `/g/$id`: timeline bar (Play growth, step slider 1..N, step title + date), StamTree with specimen label card top-left + legend, Field notes panel right. Default selection = focus, else newest. Replay keeps selection or moves to a visible idea; new-in-step ideas get a one-time ring (respects reduced motion). Export button.
- `/g/$id/conversations/$cid`: messages colored by speaker; messages that birthed ideas are marked and link to `/g/$id?idea=...`.
- All authenticated routes under `_authenticated` layout.

## 5. Field notes panel actions
- Grow a branch (label <=24, note, person, current step or new step with title/date, optional source message -> "Heard in" quote).
- Graft a merge (pick extra parent).
- Let it rest / Revive.
- Mark as knot ("What is now settled?"), Reopen knot (requires reason).
- Edit label and note. No delete anywhere.
- Add a conversation dialog: title, date, source, pasted text, required consent checkbox; speaker -> person mapping (existing or new person with next palette color).

## 6. StamTree component (`src/components/stam-tree/`)
- Plain SVG React port of the prototype: tapered branches, person colors, dashed merges, double-ring knots, 30% dormant + hollow tip, growing pulse, label collision handling as in prototype; viewBox scaling so nothing clips at 1280px.

## 7. Verification
- Run vitest suites; Playwright check at 1280px: demo garden render, play growth 1->10, grow/graft/rest/revive/knot each add an event, consent block, two-root import error, second test account sees no gardens of the first.

Out of scope: AI, multiple members, realtime, sharing.
