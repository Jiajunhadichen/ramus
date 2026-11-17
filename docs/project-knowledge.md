
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
Exception: the demo garden "The origin of Ramus" is the historical record of how Ramus was born in conversations with two AIs. It keeps them as contributors and ends with the knot "相信人与人" (trust in people).

## Glossary
Garden = a group's space for one long discussion or project. Idea = node. Primary link = "grew from". Merge link = "recombined with". Conversation = a recorded discussion (meeting notes, chat export, transcript). Step = one stage of the discussion, the time axis. Knot = a click, a confirmed milestone. Dormant = stopped growing, kept, can be revived. Suggestion = gardener proposal awaiting review. Harvest = turning a conversation into ideas. Nursery = a member's private space. Gardener = the AI agent.

## Data rules
- Tables: gardens, garden_members, contributors, conversations, messages, steps, ideas, idea_links, events.
- contributors: name, color, kind ('person' | 'historical_ai'), user_id (nullable). Only the demo garden uses 'historical_ai'.
- conversations: title, source ('meeting' | 'chat' | 'notes' | 'other'), happened_at, raw_text, consent_confirmed. messages: conversation_id, position, contributor_id, sent_at, content.
- steps: step, title, date (optional).
- ideas: label (max 24 chars), note, contributor_id, step, status ('growing' | 'dormant'), is_knot, settled, origin ('human' | 'ai'), confirmed, rejected_at, visibility ('shared' | 'private'), owner_user_id, conversation_id, message_id, source_excerpt.
- idea_links: parent_id, child_id, kind ('primary' | 'merge'), origin, confirmed, rationale. At most one primary link per child.
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

