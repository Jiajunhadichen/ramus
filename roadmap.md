# Ramus v2.4 — Showing it
- [x] Download: the tree as PNG (3×) or SVG, fonts embedded, "grown with Ramus".
- [x] Present: full screen, step by step, with the Story as captions; ends on the outcome.
- [ ] Public share link (needs a schema change by Lovable and a privacy decision: tree and notes, not the raw messages).
- [ ] Growth as a video or GIF.

# Ramus v2.3 — Grow again from an earlier point; readable at first sight
- [x] Story (was Systema): the garden read step by step; who raised each idea, how it grew, its note; reading level picks what is written out.
- [x] Going back: "Grow again from here" + an optional note to the gardener; the gardener also recognises a clear return; abandoned line rests with the reason; margin note on the tree; line in the Story.
- [x] Idea panel: one main action, the rest under More.
- [ ] Check in the preview with a real two-round discussion (needs Lovable AI credits).

# Ramus v2.2 — Straight to the tree
- [x] One collecting window: drop or paste everything, see what each source is and when it was said, then "That's everything — grow the tree". No questions; automatic choices in src/lib/intake/auto.ts.
- [x] Order is evidence: WhatsApp day/month order from chronology; several sources read as one time-ordered stream; no branch grows from later words; stages, step dates and history at message times.
- [x] The gardener grows the tree directly (marked as its own), names a new garden's root, reads long material in parts; "Not right? Take it off the tree".
- [x] Gardens page plants a new tree; inside a garden the same window is "Add more".
- [ ] Check in the preview with real conversations (needs Lovable AI enabled and AI credits).
- [ ] When older material is added later, renumber steps so the tree's steps follow time too (replay by events already does).

# Ramus v2.1 — The gardener reads (harvest)
- [x] Pure harvest rules and checks (src/lib/gardener/harvest.ts) with tests; Lovable AI gateway client with fallbacks and plain errors.
- [x] harvestConversation: proposals written as unconfirmed ideas, dashed on the tree; accept / reject one by one or all; knots only by people.
- [x] Entry points: "Let the gardener read it" after keeping a conversation, on the conversation page, and on the garden when a conversation is unread.
- [ ] Check in the preview with real conversations (needs Lovable AI enabled and AI credits).
- [ ] Reading very long chats in parts instead of only the latest ~90,000 characters.

# Ramus v2.0 — Accession (intake, part 1 of 3: no AI)
- [x] Migration 0006: intake_batches, message spans and set-aside reasons, speaker_aliases, receive_batch.
- [x] src/lib/intake: WhatsApp (exports and desktop copies), VTT/SRT, transcript blocks, name lines, notes, ChatGPT, Claude, Slack; invariant tests.
- [x] Accession page (Receive, Prepare, Keep) and paste/drop on the garden page.
- [x] Conversation page: accession stamps, set-aside toggle, See in original (loaded on demand).
- [x] Open .zip exports (WhatsApp iPhone, ChatGPT, Claude, Slack workspace) and .docx transcripts; UTF-16; plain reasons for screenshots, recordings and PDFs.
- [x] Teams .docx start time used automatically; Google Meet markers; Zoom captions and meeting chat.
- [x] One simple window to paste or drop anything, from the garden, an empty garden, the gardens page (which garden / new garden) and Bring in more. No export guide: users are not taught, their messy copies are understood.
- [x] Chats copied off a page (Slack, Teams, Discord, Messenger, Google Chat, Telegram, WeChat); short two-person exchanges; PDFs and saved web pages.
- [ ] Browser check with real exports at desktop and phone width.
- [ ] Link the importer's new person to their account (needs a receive_batch change).
- [ ] Part 2: AI cut points for unknown formats and screenshots. Part 3: audio.

# Ramus v1.8
- [x] Verify lining digits and three Field notes sections.
- [x] Add human-set outcomes, audit recording, and demo outcome.
- [x] Add pure main-lineage and reading-level rules with tests.
- [x] Add question/outcomes, reading controls, Systema emphasis, and public Form view.
- [x] Add principle 14 and verify browser flows at desktop and phone sizes.
