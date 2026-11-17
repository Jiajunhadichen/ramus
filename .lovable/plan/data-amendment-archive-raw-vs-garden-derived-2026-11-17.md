# Data amendment: Archive (raw) vs Garden (derived)

## 1. Database (one migration)
- **messages**: add `sequence` (int, backfilled from `position`, then NOT NULL), `time_precision` ('second' | 'minute' | 'day' | 'unknown', default 'unknown'), `time_source` ('source_export' | 'user_entered' | 'none', default 'none'), `parent_message_id` (self reference, nullable), `external_id` (nullable, unique per conversation), `imported_at` (default now()). `sent_at` stays nullable and is never filled in by the app.
  - Messages become insert-only: drop the update policy, revoke UPDATE/DELETE, and add a trigger that rejects update and delete. That blocks the gardener and admin code too.
- **conversations**: add `source_format` (paste | whatsapp | vtt | srt | slack | chatgpt | claude | other, default 'paste'), `original_file` (nullable path), `imported_at` (default now()). `happened_at` is already nullable. Conversations become insert-only the same way, since they are raw archive.
- **idea_evidence** (new): `idea_id`, `message_id`, `role` (origin | restated | supports | challenges), `note`, `garden_id`. Grants and RLS mirror ideas: members can read if the idea is visible to them, writers can insert and update, nobody can delete. Unique (idea_id, message_id, role); at most one 'origin' row per idea.
  - Backfill: an 'origin' row for every idea that has `message_id`. Mark `ideas.message_id`, `ideas.conversation_id` and `ideas.source_excerpt` DEPRECATED (kept for the live app, no longer written).
- **idea_links**: add `nature` (refines | answers | challenges | splits | combines, nullable).
- **Storage**: a private bucket `conversation-originals`. Members of a garden can read and insert files under `<garden_id>/…`; nobody can update or delete.

## 2. Server functions
- `addConversation`: writes `sequence`, `time_precision='unknown'`, `time_source='none'` for pasted text (no invented times). Optional uploaded original file → `original_file`. Re-imports skip messages whose `external_id` already exists.
- `growBranch`: writes an 'origin' evidence row instead of `ideas.message_id`; accepts an optional `nature` for the primary link.
- New `addEvidence` (idea, message, role, note) with an event (`link_added` payload kind 'evidence').
- `graftMerge`: optional `nature` (defaults to 'combines').
- `getGarden` / `getConversation`: return evidence with message, speaker, sent_at, precision and imported_at.
- Stam export is unchanged (contract).

## 3. UI
- Field notes "Heard in": every evidence item, origin first, then restated, supports, challenges. Each shows role, speaker (in their color), quote, time or "time unknown", and "Read in conversation" linking to `#message-id`. A small "Add evidence" action picks a message and a role.
- "Grew from … · answers": link nature next to each parent. Grow and Graft dialogs get a "How did it grow?" select.
- Conversation page: header shows "Happened: <date | time unknown>" and "Imported: <date>" separately. Each message shows its time or "time unknown", ordered by `sequence`. Messages that gave rise to ideas list their role ("origin of …", "supports …").
- Timeline: a step's date comes from the step itself or else from the earliest evidence message `sent_at` of the ideas born in it. With no date it shows "time unknown". It never falls back to today.

## 4. Docs and tests
- docs/project-knowledge.md: add the Archive / Garden principle and the new fields to Data rules and Glossary (Evidence).
- Tests:
  - Evidence ordering helper: origin first.
  - Time formatting helper: null gives "time unknown", never today.
  - Conversation splitting gives each message a sequence and no time.
- Checks:
  - An API update on a message fails.
  - A browser test of an idea with three evidence rows shows all three quotes, origin first.
  - A pasted conversation shows "time unknown".

## Technical notes
- Messages and conversations no longer allow updates. Today the app never updates either, so nothing currently in use breaks.
- `ideas.message_id` stays in the database as deprecated to avoid a breaking change; the app stops reading it after the backfill.
