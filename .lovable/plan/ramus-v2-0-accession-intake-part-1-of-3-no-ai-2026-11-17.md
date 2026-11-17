# Ramus v2.0 — Accession (Intake, part 1 of 3, no AI)

Release rule (added to docs/project-knowledge.md and AGENTS.md): "Keep the original. Prepare the structure. Never change the words."

## 1. Database (one migration, archive stays insert-only)
- New `intake_batches` (insert-only, guard trigger, members read / writers insert): garden, conversation, per-garden `accession_no`, `raw_text`, `source_format`, `original_file`, `parser_version`, `options`, `report`.
- `messages` gains `batch_id`, `raw_start`, `raw_end`, `speaker_label`, `offset_ms`, `hidden_reason` (system/media/deleted/empty).
- Widen checks: source formats (paste, lines, whatsapp, vtt, srt, transcript, notes, slack, chatgpt, claude, other), `time_source` adds `recording_offset`, event type `batch_received`.
- New `speaker_aliases` (garden preference, writers insert/update, audited; generic labels refused by a trigger).
- Backfill one batch per existing conversation (`legacy-name-colon`, numbered by created_at); messages are not touched and triggers stay on.
- `receive_batch(...)` RPC: one transaction for batch, conversation, new people, aliases, messages, and `record_action('batch_received')`, with no thought events.

## 2. Preparation library `src/lib/intake/` (pure, `intake-1.0`)
- `prepare(input, options, context) → Draft` with detectors and confidence plus a "Read as" override.
- Parsers: WhatsApp (iOS, Android, SE, US, 12/24h, 上午/下午, invisible marks, date order inferred or asked), VTT/SRT (Teams `<v>`, Zoom "Name:", merges same-speaker cues under 3 s, offsets), transcript blocks (Otter, Teams, WeChat, Chinese placeholders), Name lines (speaker rules plus "Is 'Note' a person?"), Notes (paragraphs, one person), ChatGPT and Claude JSON (visible thread, branches counted), Slack day files.
- Segments split at gaps over 6 h or date changes. Stable external ids (from the source or a hash), duplicate detection, phone/email masking.
- Vitest fixtures for every format (Chinese, Swedish, US, messy "Note:"/URL paste, two-day WhatsApp with a 9 h gap), with the six invariants as tests.

## 3. Accession page `/g/$id/accession`
- Ways in: the "Bring in a conversation" button, plus pasting 2+ lines or dropping a file on the garden page (handed over via sessionStorage).
- Receive: one drop/paste area that takes several .txt/.vtt/.srt/.json files at once, with formats listed in small caps.
- Prepare, updating live:
  - Specimen-label summary with "Read as".
  - "Look at these first" (max 5, or "Nothing needs your eye.").
  - Voices mapping (existing / new / anonymous / not a person, "remembered").
  - Original | Prepared columns with linked highlight both ways, tabs on phones.
  - Title, Happened, Timezone and recording start fields, consent wording by source, and "Keep in the archive".
- Keep: an oval accession stamp, plus "Read the conversation" and "Back to the garden".
- AddConversationDialog is removed and its callers point to the new page.

## 4. Conversation page
- Batch stamps in the header, plus a "Show set-aside lines" toggle (off by default).
- "See in original" side panel with the message's span highlighted.
- Same person within 2 minutes is grouped on screen only, and recordings show "12:31 into the recording".

## 5. Server
- `receiveBatch` (authenticated):
  - Validates consent, size (5 MB / 20,000 messages) and membership.
  - Re-runs `prepare()` from the original and options, checks invariants 1–3, then calls `receive_batch`.
  - Returns the conversation id and accession number.
- The original file uploads to the private bucket only when nothing was masked.
- ChatGPT/Claude exports keep only the chosen conversation's JSON.

## 6. Verification
- All existing and new tests pass.
- Browser checks at desktop and phone width:
  - WhatsApp: paste, hover, map voices, keep, stamp.
  - Receiving the same file again shows "0 new messages".
  - VTT with a recording start time.
  - ChatGPT conversations.json with one conversation picked.
- Update docs, AGENTS.md (Intake section) and roadmap.md.

## Out of scope
Screenshots, audio, any AI call, harvesting, changing set-aside status after keeping, Telegram/Discord/.docx.

## Technical notes
- Legacy messages (batch_id null) are read as belonging to their conversation's first batch.
- New conversations keep `raw_text` empty; the original lives in the batch.
- The legacy `addConversation` server function is removed unless a test needs it.
