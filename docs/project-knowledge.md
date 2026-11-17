
# Ramus — project knowledge

## What we are building
Ramus is a web app where a group's thinking grows as a living tree. Every idea someone says becomes a node. New ideas branch from the ideas they grew out of; ideas the group stops developing go dormant but stay on the tree; ideas from different people merge. The tree shows something every group has and nobody can see: how their thinking actually developed, and who it came from.
Belief: the best ideas grow between people. Ramus is a humanistic tool. People think and decide; the AI is only a gardener.
Tagline: "Ideas grow between people."

## The garden (fixed architecture)
- Idea graph, engine name "Stam": Postgres tables ideas + idea_links + events, a DAG with an event log. This is the tree itself and the real asset.
- Web app: React front end + Lovable Cloud backend. The garden where the tree lives and people look, prune and graft.
- Gardener agent: LLM + tools in edge functions. Records what people said, proposes links and knots for people to confirm, points to dormant branches and voices not yet heard, asks questions. It never plants ideas of its own.
- Harvest instructions: docs/gardener-harvest-prompt.md (added in phase 2). Its JSON format is the contract between all parts.

## Product principles (rules, not decoration)
1. Retention is the heart (Dawkins, cumulative selection). Never hard-delete ideas; "remove" means dormant. Every change writes an event.
2. Make the click audible (Herbert Simon's safe: a dial that clicks when it is right). A knot marks a confirmed intermediate result. Knots are stable: reopening one needs an explicit action and a reason.
3. Build on stable subassemblies (Simon's watchmaker). New work builds on knots. A knot's branch can collapse into one node.
4. Near-decomposability (Simon). Branches are explored semi-independently; cross-branch influence is drawn as light merge lines.
5. Keep the recipe, not only the blueprint (Simon). Store the process (events), not just current state, so any past step can be replayed.
6. Recognition over articulation (Dawkins' biomorphs). People can choose between visible alternatives before they can put the reason into words, so show siblings side by side.
7. AI proposes, people decide. Anything the gardener creates (links, knots, harvested ideas) is a suggestion (confirmed = false) until a person accepts it. An AI-inferred link is a hypothesis, not a fact; semantic similarity is not influence.
8. Don't converge too fast (James March). In Explore mode the gardener widens the space with questions. It helps narrow down only in Converge mode, which only people switch on.
9. Private before shared (Chris Argyris). Private thoughts stay private until their author grafts them onto the shared tree. The gardener never reveals private content.
10. Cooperation without consensus (Star & Griesemer). The tree is a boundary object: one tree, different lenses. Disagreement is shown, not forced away.
11. Ideas recombine. One primary parent per idea plus optional merge parents. The primary chain is acyclic and each garden has exactly one root.
12. Branches belong to people; the gardener only tends. Every idea on the tree has a human author. The gardener never contributes ideas of its own: it records, structures, reminds and asks. Only people get branch colors; the gardener has none. Reason: AI-generated ideas make a group's ideas more alike, and human differences are what make thinking together valuable.
13. Every voice counts. Quiet people often hold what the group is missing. Ramus helps people think on their own first, then share, and shows ideas only one person raised.
14. Show what matters first. A complex system is understood through its levels. Ramus keeps every idea, but the tree is read from the outside in: first the question and where it has reached, then the main line of growth, then every branch and every word. Levels change what is emphasised, never what exists. (Herbert Simon, “The Architecture of Complexity”, 1962.)
Exception: the demo garden "The origin of Ramus" is the historical record of how Ramus was born in conversations with two AIs. It keeps them as contributors and ends with the knot "相信人与人" (trust in people).

## Archive and garden (two layers)
What people said and our reading of it are two separate layers.
- Archive (raw): conversations and messages are the words people actually said. Nobody edits or overwrites them, the gardener included. Corrections are new rows. The database rejects any update or delete.
- Garden (derived): ideas, idea_links and idea_evidence are our reading of the archive. They can be edited, accepted and rejected.
- Never invent a time. A message without a known time shows "time unknown". "Happened" and "imported" are shown separately.

## Bringing words in (Accession, v2.0)
Keep the original. Prepare the structure. Never change the words.
- The original is kept exactly as received, as a batch (intake_batches). Every prepared message points back to its exact span of that original (raw_start, raw_end).
- Preparing decides only who spoke, when, where one message ends, and which lines are set aside (system lines, media placeholders, deleted messages, empty lines). Words are never rewritten, corrected or summarised.
- Set-aside lines stay in the original and as hidden messages; they can always be shown. Nothing is dropped silently.
- Masking phone numbers and email addresses is the only change to words. The bring-in window does it whenever it finds any (the Accession page leaves it to the person); it applies to the original and the messages alike, is recorded in the report, and then the original file is not uploaded.
- Preparation is deterministic code (src/lib/intake, no AI). The server never trusts prepared messages from the browser: it prepares again from the original and the person's choices.
- Generic labels (Speaker 1, user, assistant, …) are never remembered as names.
- Do what people already do; never teach them. They copy a chat straight off the page (Slack, Teams, Discord, Messenger, Google Chat, Telegram, WeChat, WhatsApp Web), page furniture and all, or drop whatever file they have. Ramus works out the speakers and times and sets the furniture (reactions, "Reply", "Edited", date dividers, the message box) aside; nothing is dropped.
- Files arrive as they are: .zip (WhatsApp on iPhone, ChatGPT, Claude, Slack), .docx, .pdf, saved web pages, .vtt, .srt, .txt, .md, .json. Ramus opens them on the device (src/lib/intake/files.ts; PDFs with pdf.js loaded only when needed) and says what it opened and what it left out. Photos, voice notes and the rest of an AI export are never uploaded.
- Screenshots and recordings are not read yet; Ramus says so plainly instead of failing.
- One simple window, no questions (v2.2). People drop or paste everything that belongs together (several chats, meeting notes, transcripts, any files); the window lists what each one is, how many messages and voices, and when it was said. The only thing they say is "That's everything — grow the tree". Every choice the Accession page would ask about is made the same way every time (src/lib/intake/auto.ts): the device's timezone and date order, every voice under the name it uses, all of a chat, phone numbers and email addresses hidden, the 20 most recent conversations of a large AI export. Only when a source has clock times without a day, or recording offsets without a start, does its row offer an optional date.
- From the gardens page the window plants a new garden (named after the chat when the file says it, otherwise by the gardener); inside a garden it is "Add more". Words already kept go into the conversation that keeps them, so nothing is kept twice. The Accession page stays as the place to look closely at one source.
- Order is evidence. A WhatsApp chat whose dates read either way (03/04/26) is read the way that runs forward in time. Several sources are read as one stream in the order things were said (src/lib/gardener/order.ts): each source keeps its own order, a line without a time stays right after the one before it, sources are interleaved by time, and a source with no times follows the others in the order it was brought in.

## The gardener grows the tree (harvest, v2.1; no confirmation step since v2.2)
- Once what was brought in is kept, the gardener reads it and grows the tree: what was raised, what answered, refined, challenged or split from what, what merged, what went quiet, what was settled. Nobody has to accept anything first (the user's decision, v2.2): the tree appears.
- What the gardener places is marked as its own: ideas and links with origin 'ai' (confirmed true, so they are on the tree and exported), an audit event per branch (actor_kind 'ai', with why and quote), and thought events with origin 'ai' at the times the words were said, shown as "the gardener's reading". Anyone can take a branch off ("Not right? Take it off the tree"): it and the gardener's branches growing from it leave the tree, stay in the record, and their history is marked rejected. It refuses when people have grown their own branches from it.
- Ideas belong to people: every branch is attributed to whoever wrote its origin message, whatever the model claims; messages by an AI are never an origin; quotes are checked word for word. Branches whose origin, evidence or quote do not check out are dropped before anything is written.
- Order is evidence: nothing grows from, merges with or is settled by something said later. A branch that seemed to grow from later words moves up to the nearest earlier ancestor (or the root) and says why; stages follow the order of the messages; step dates and thought-event times come from the messages.
- A new garden's root starts as a placeholder; the gardener names it from the conversation (the question or subject the group keeps returning to), attributed to whoever first raised it.
- Knots: the gardener ties a knot only for an explicit decision, confirmed result, ruled-out option or conclusion others built on (at most 4 per reading), settled at the message where it was settled.
- Going back (v2.3). Groups often reach a result, have it turned down (the cost won't come down, a client says no) and go back to an earlier point to branch out again. The tree grows again from that point: a new bud takes over. On any idea, "Grow again from here" opens the window picking up from it, with one optional line to tell the gardener what happened in their own words. Without it, the gardener still recognises a clear return in the messages. A return is recorded as the gardener's reading: a "revived" thought event on the idea gone back to (who, when, why), the ideas left behind rest (with the reason), new ideas said after the return never grow from what was set aside, the tree shows a margin note "went back here · why", and the Story says "The group went back to “X”: why, and grew again from there."
- The model is called through Lovable's AI gateway from the server (LOVABLE_API_KEY); prompts and keys never reach the browser. Long material is read in parts of ~90,000 characters, in order; each part sees the tree the earlier parts grew.

## Glossary
Garden = a group's space for one long discussion or project. Idea = node. Primary link = "grew from". Merge link = "recombined with". Conversation = a recorded discussion (meeting notes, chat export, transcript). Step = one stage of the discussion, the time axis. Knot = a click, a confirmed milestone. Dormant = stopped growing, kept, can be revived. Suggestion = an older gardener proposal awaiting review (before v2.2). Harvest = turning a conversation into ideas. Nursery = a member's private space. Gardener = the AI agent. Evidence = a message an idea rests on, with a role (origin, restated, supports, challenges). Nature = how a link grew (refines, answers, challenges, splits, combines).

## Data rules
- Tables: gardens, garden_members, contributors, conversations, messages, steps, ideas, idea_links, events.
- contributors: name, color, kind ('person' | 'historical_ai'), user_id (nullable). Only the demo garden uses 'historical_ai'.
- conversations (insert-only): title, source ('meeting' | 'chat' | 'notes' | 'other'), source_format ('paste' | 'lines' | 'whatsapp' | 'vtt' | 'srt' | 'transcript' | 'notes' | 'slack' | 'chatgpt' | 'claude' | 'other'), happened_at (nullable), raw_text (legacy; new conversations keep it empty), original_file (path in the private conversation-originals bucket), imported_at, consent_confirmed.
- intake_batches (insert-only): conversation_id, accession_no (per garden, in order received), raw_text (the original as received, after any masking asked for), source_format, original_file, parser_version, options (the person's choices), report (counts and warnings). Legacy conversations have one backfilled batch; their messages have batch_id null.
- messages (insert-only): conversation_id, sequence (always set), contributor_id, sent_at (nullable; never invented), time_precision ('second' | 'minute' | 'day' | 'unknown'), time_source ('source_export' | 'user_entered' | 'recording_offset' | 'none'), parent_message_id, external_id (source id or a stable hash; re-imports do not duplicate), imported_at, content, batch_id, raw_start, raw_end, speaker_label (the name as the source wrote it), offset_ms (time into a recording), hidden_reason ('system' | 'media' | 'deleted' | 'empty' | null).
- speaker_aliases: alias → contributor per garden, remembered when a person maps a real name; editable, audited.
- idea_evidence: idea_id, message_id, role ('origin' | 'restated' | 'supports' | 'challenges'), note. At most one origin per idea. Replaces ideas.message_id / conversation_id / source_excerpt (deprecated, kept, not written).
- steps: step, title, date (optional).
- ideas: is_outcome (human-set; several allowed), label (max 24 chars), note, contributor_id, step, status ('growing' | 'dormant'), is_knot, settled, origin ('human' | 'ai'), confirmed, rejected_at, visibility ('shared' | 'private'), owner_user_id, conversation_id, message_id, source_excerpt.
- idea_links: parent_id, child_id, kind ('primary' | 'merge'), nature ('refines' | 'answers' | 'challenges' | 'splits' | 'combines'), origin, confirmed, rationale. At most one primary link per child.
- events: insert-only; actor, actor_kind ('human' | 'ai'), type, idea_id, payload jsonb.
- Import/export always uses the Stam JSON format of docs/sample-garden.json: { title, collected, focus, steps, nodes: [{ id, label, by, step, status, knot, parents, note }] }. parents[0] is the primary parent.
- Validate every write: one root per garden, parents exist in the same garden, no cycle in the primary chain. Show errors in plain words.

## Security and consent
- RLS on every table. Members read their gardens' shared ideas; private ideas only by their owner; only owner and editor roles write.
- A conversation can be stored only after someone confirms everyone in it agreed to have it recorded.
- API keys only in Cloud secrets and edge functions, never in client code.

## Design direction: herbarium sheet
The tree is a pressed botanical specimen on a sheet of paper. The side panel is the collector's field notes.
- Light: --paper #E9EDE6, --sheet #F4F6F1, --ink #1C2520, --muted #5B685F, --rule #C5CEC3.
- Dark: --paper #0F1511, --sheet #151D18, --ink #DCE4DD, --muted #90A096, --rule #29342D.
- Person palette, assigned in order: light #2A7652, #98610F, #4A50A0, #9C4A63, #2F7F94; dark #66C79A, #E4AE55, #A3A8EF, #E59AB3, #6CC3D6.
- Fonts: Noto Serif SC (display), Noto Sans SC (body; renders Chinese), IBM Plex Mono (metadata).
- 1px rules, 4-6px radius, no gradients, no glassmorphism, no glowing effects, no robot or sparkle icons for the gardener (use a small trowel or leaf).
- Each tree has a specimen label card: specimen no., title, collected, collectors, counts.
- Branch color = person color. Dormant = 30% opacity + hollow tip. Merge = thin dashed line. Knot = double ring. Growing leaf = soft pulse that respects prefers-reduced-motion.
- UI copy in English. Idea content may be in any language.

## Coding rules
- The tree is plain SVG in a React component (src/components/stam-tree/), ported from docs/tree-prototype.html. Keep its layout algorithm. No d3 unless asked.
- Keep layout and validation as pure functions with unit tests.
- Keep a copy of this knowledge in docs/project-knowledge.md.
- Don't change the principles, design tokens or the Stam JSON format unless asked.

