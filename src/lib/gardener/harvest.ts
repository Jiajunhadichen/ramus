import { ownWords } from "../intake/discourse";
import { MAX_LABEL, validateGarden } from "@/lib/stam/validate";

/**
 * Harvest: the gardener reads what was brought in and grows the tree: who raised what, and how it grew.
 * The model only answers; this module checks every branch mechanically before anything is written
 * (words, speakers, and the order things were said). People can take any branch off the tree afterwards.
 * Pure: no network, no database.
 */

export type HarvestMessage = {
  ref: string; id: string; speaker: string | null; personId: string | null; personIsHuman: boolean;
  sentAt: string | null; content: string;
  /** which conversation it comes from, shown when several are read together */
  source?: string | null | undefined;
  /** what kind of text it is, from the structure reading (src/lib/intake/semantic.ts) */
  kind?: string | null | undefined;
  /** for words with no known author: a probable voice, never confirmed and never credited */
  likely?: string | null | undefined;
};

/** How a message's author is shown to the model: a known person, an AI that took part, or nobody known. */
export function voiceLine(m: HarvestMessage): string {
  const kind = m.kind && m.kind !== "message" && m.kind !== "note" ? ` [${m.kind}]` : "";
  if (!m.personId) return `Unattributed${m.likely ? ` (possibly ${m.likely}, unconfirmed)` : ""}${kind}`;
  return `${m.speaker ?? "Unattributed"}${m.personIsHuman ? "" : " (AI)"}${kind}`;
}
/** An idea already on the tree; `at` is when its first words were said, if known. */
export type HarvestIdea = { key: string; label: string; note: string; by: string; parents: string[]; status: string; knot: boolean; at?: string | null | undefined };
/** Messages are in the order they were said (see inTimeOrder); their position is their order. */
export type HarvestInput = {
  gardenTitle: string; conversationTitle: string; rootKey: string;
  ideas: HarvestIdea[]; messages: HarvestMessage[]; skipped: number;
  /** this reading is one part of a longer stream */
  part?: { n: number; of: number } | undefined;
  /** the garden is new and its root is only a placeholder: the gardener names it */
  nameRoot?: boolean | undefined;
  /** the people say this conversation picks up again from this idea (its key) */
  resumeFrom?: string | null | undefined;
  /** what the people told the gardener about these messages, in their words */
  told?: string | null | undefined;
  /** First-pass, source-checked statements; guidance, never evidence by themselves. */
  candidates?: ThoughtCandidate[] | undefined;
};

export const NATURES = ["refines", "answers", "challenges", "splits", "combines"] as const;
export const KNOT_KINDS = ["decision", "result", "ruled_out", "conclusion"] as const;
export const EVIDENCE_ROLES = ["restated", "supports", "challenges"] as const;
export const MAX_PROPOSALS = 20;
export const MAX_KNOTS = 4;
export const MAX_STAGES = 10;
/** More new ideas than this growing straight from the root reads as a broom, not a tree: the gardener is asked once more. */
export const ROOT_CROWD = 6;

export type Proposal = {
  temp: string; label: string; note: string; personId: string | null; originMessageId: string; quote: string | null;
  /** "stated": the words themselves make the link; "inferred": the gardener's reading, shown as "Likely:". */
  basis: "stated" | "inferred";
  evidence: { messageId: string; role: (typeof EVIDENCE_ROLES)[number] }[];
  parent: string; parentIsNew: boolean; nature: (typeof NATURES)[number] | null; why: string | null;
  merges: { target: string; isNew: boolean; why: string | null }[];
  status: "growing" | "dormant"; knot: { kind: (typeof KNOT_KINDS)[number]; settled: string; messageId: string | null } | null; stage: number;
};
export type RootName = { label: string; note: string; personId: string | null; originMessageId: string | null };
/** The group went back to an earlier idea and grew again from there. */
export type Return = { to: string; messageId: string | null; personId: string | null; why: string | null; setAside: string[] };
export type Reaction = { key: string; messageId: string; role: (typeof EVIDENCE_ROLES)[number] };
export type Checked = { proposals: Proposal[]; stages: { n: number; title: string }[]; dropped: { label: string; reason: string }[]; root: RootName | null; returns: Return[]; reactions: Reaction[] };

/** One person-level thought event, before the graph is inferred. */
export type ThoughtCandidate = {
  origin: string; quote: string; kind: "proposal" | "alternative" | "objection" | "constraint" | "revision" | "decision" | "result";
  claim: string;
};
const CANDIDATE_KINDS: ThoughtCandidate["kind"][] = ["proposal", "alternative", "objection", "constraint", "revision", "decision", "result"];
const MAX_CANDIDATES = 60;

/** Stage 1: extract atomic, verbatim-grounded claims without inventing their causal relationships. */
export function thoughtCandidatePrompt(input: HarvestInput): { system: string; user: string } {
  const messages = input.messages.map(m => `${m.ref} [${when(m.sentAt)}] ${voiceLine(m)}: ${m.content.replace(/\s*\n\s*/g, " / ")}`).join("\n");
  const already = input.ideas.map(i => `${i.key}: ${i.label} (${clip(i.note, 100)})`).join("\n");
  return {
    system: `You are the first-pass reader of real recorded thought: a conversation, a transcript, notes, an article, a copied page or loose fragments, in any format. Lines marked Unattributed have no known author; their ideas still count. "(possibly X, unconfirmed)" is only a hint about who may have said it: never treat it as the author. Lines marked [heading] or [quote] are titles or quoted words, not new claims by the speaker. People who are only talked about or cited are not speakers. Ignore page furniture (menus, counters, announcements, lists of other pages). Extract individual consequential thought-events, NOT a topic summary and NOT a graph. Include distinct alternatives, objections to earlier ideas, constraints, meaningful revisions, explicit decisions and reported outcomes. When one message lists several options, directions, candidates or ranked choices, each one is its own thought-event. Concepts the discussion leans on (a theory, method or principle that is named and then used) are thought-events too. A long answer usually holds three to six. Pure agreement without new content can be omitted. Quote the shortest verbatim continuous phrase of at most 20 words from the originating message; do not invent a quote or claim. Lines starting with ">" under "[quoting name]" are quoted from someone else: never quote them as this speaker's words. Keep the original chronological order. An opening question that only repeats the garden's root is not a new proposal. The second pass will determine influence and connections. Return JSON only: {"candidates":[{"origin":"m2","quote":"exact quoted words","kind":"proposal|alternative|objection|constraint|revision|decision|result","claim":"short faithful explanation"}]}. Up to 40; do not impose a minimum or fabricate ideas.`,
    user: `Existing ideas (avoid re-proposing them verbatim):\n${already}\n\nConversation: ${input.conversationTitle}\nChronological messages:\n${messages}`,
  };
}

/** Candidate fields are hints, not evidence: every quote is checked against the source. */
export function checkThoughtCandidates(answer: unknown, input: HarvestInput): ThoughtCandidate[] {
  const obj = answer && typeof answer === "object" ? answer as Record<string, unknown> : {};
  const rows = Array.isArray(obj["candidates"]) ? obj["candidates"] : [];
  const byRef = new Map(input.messages.map(m => [m.ref, m]));
  const out: ThoughtCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const origin = typeof r['origin'] === "string" ? r['origin'].trim() : "";
    const quote = typeof r['quote'] === "string" ? r['quote'].trim() : "";
    const claim = typeof r['claim'] === "string" ? r['claim'].trim().slice(0, 180) : "";
    const kind = r['kind'] as ThoughtCandidate["kind"];
    const source = byRef.get(origin);
    if (!source || !quote || !claim || !CANDIDATE_KINDS.includes(kind)) continue;
    if (!ownWords(source.content).includes(quote) || quote.split(/\s+/).length > 22) continue;
    const key = `${origin}|${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ origin, quote, claim, kind });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

const SYSTEM = `You are the gardener of a Ramus garden. Ramus believes the best ideas grow between people.
You read recorded thought in whatever shape it arrived (a group discussion, a transcript, notes, an article, a copied web page, fragments, or several of these together) and trace how its ideas grew out of each other: where an idea answered, refined, challenged or split from another, where two lines of thought merged, which ideas went quiet, and which questions the group settled.

You never add ideas of your own and you never summarise. What you return goes straight onto the group's tree, and anyone can take it off again, so keep every branch checkable.

Messages are listed in the order they were said, across every source. Order is evidence: an idea can only grow from, merge with or be settled after something said before it.

1. Ideas belong to people.
- An idea is something a person said that others could build on: a proposal, claim, question, option, decision, correction or explanation. Small talk, greetings, thanks and plain agreement are not ideas.
- Every idea has an "origin": the ref of the message where it is first said. The author is whoever wrote that message: a person, or an AI that took part in the conversation (marked "(AI)"), or nobody known (marked "Unattributed": notes, articles, fragments). Never guess an author; unattributed ideas are kept and credited to no one, even when a line says "(possibly X, unconfirmed)". Lines marked [heading] or [quote] are titles or words quoted from others; people who are only talked about or cited (an author, a professor) are not speakers. Words that are clearly page furniture (menus, post counters, announcements, lists of other topics) are not ideas. You, the gardener, never add ideas of your own.
- "quote": the shortest exact words (at most 20) from the origin message that carry the idea, copied character for character. Lines starting with ">" (under "[quoting name]") are words the speaker quoted from someone else: never quote them as the speaker's own, and never treat them as a new idea of that speaker.
- "label": the idea as a short name, not a sentence, in the language of the discussion: at most 12 Chinese characters or 5 English words (hard limit 24 characters).
- "note": one sentence, at most 30 words, saying what the idea is in the speaker's own terms. Do not improve, extend or judge it.
- "evidence": other messages that restate, support or challenge the idea: [{"m": "m12", "role": "restated" | "supports" | "challenges"}].

2. Lineage.
- "parent": the single idea this one most directly grew from: the key of an existing idea in the garden, or the id of another idea you propose. Ideas that start a new thread grow from the garden's root.
- "nature": how it relates to its parent: "answers", "refines", "challenges", "splits" (an alternative branching off) or "combines" (only with merges). Use null when there is no such relation, as when someone simply opens a new topic under the root; never say "answers" unless it really answers the parent.
- "why": one checkable sentence on why this is the parent.
- "basis": "stated" when the words themselves make the link (a reply, a quote, "building on X", "I disagree with Y"); "inferred" when it is your reading of how the ideas relate. When unsure, say "inferred" rather than leaving the idea out or inventing evidence.
- "merges": only when an idea explicitly combines earlier ideas: [{"with": key or id, "why": "..."}]. Similar topics are not a merge.
- Never repeat an idea that is already in the garden; attach to it instead. The root is the opening QUESTION, not a proposal to duplicate as another node.
- Keep the alternatives distinct. Three people proposing three different mechanisms for the same need are three competing branches, not one topic heading; merge them only when someone actually combines them.
- Fine grain. When one message offers several options, directions, candidates or a ranking, each is its own idea, siblings under the same parent; the ones not taken forward are "dormant". A concept the discussion leans on (a theory, a method, a principle that is named and then used) is an idea. A long answer usually holds three to six ideas.
- Deep lineage. An idea grows from the latest idea it continues (the one it refines, answers, applies or objects to), not from the root, unless it really opens a new thread. Real discussions run in long lines: question → options → the chosen one → its refinement → what it is applied to.
- Sub-questions. When someone raises a sub-question or an agenda item ("what power source?", "next, the look and feel", "who is it for?"), that question is an idea of the person who raised it, and the options and decisions about it grow from it. Ideas raised together as parallel answers to the main question may all grow from the root (real divergence is not an error); but when the discussion moves through sub-questions, each idea grows from the one it answers.
- When a later idea draws on two or more earlier ideas (builds on both, joins them, finds they share one shape), give "merges"; in a real discussion this happens several times.
- A new node must be an attributable, genuinely new argument/proposal/revision/decision. When a person merely supports, restates or challenges an already-existing idea and adds no new proposal, put the evidence in "reactions" instead of inventing a new child.
- Do not confuse chronology with causal influence. For parent and merge relations, explain the actual connection with an evidence-grounded "why". Branches with no established relationship may grow from the root; do not invent merges or links simply to make a prettier tree.
- When people converge on a distinct practical solution, capture the agreed decision and actual implementation, but only if the words state them.

3. Rest and clicks.
- "status": "dormant" when an idea was raised and then dropped or never taken up; otherwise "growing". Quiet ideas matter; keep them.
- "knot": a click, a sub-question the group clearly settled: an explicit decision, a confirmed result, an option ruled out, or a conclusion others then built on. Give {"kind": "decision" | "result" | "ruled_out" | "conclusion", "settled": "one sentence on what is now settled", "m": the ref of the message where it was settled}; otherwise null. A choice between options, a ranking, an option ruled out, a confirmed result or an agreed conclusion are knots; a turn that ends with a choice usually has one. Never a knot without such words.

4. Time.
- "stages": the turns of the discussion WITHIN THIS BATCH, in the order they happened, each {"n": 1, "title": "at most 6 words"}. A new stage begins whenever the discussion turns: a new question or request, new material (a CV, feedback, data, a result), or a decision. Usually one stage per question and its answer; up to 8 in this batch. Each idea has "stage": the stage where it first appears.

5. Going back.
- Groups often go back to an earlier point: a result is turned down (the cost will not come down, a client says no, a test fails) and they return to an idea they had before and branch out again from there. When the messages go back like this, give "returns": [{"to": the key of the earlier idea in the garden they go back to, "m": the ref of the message where they go back, "why": the reason in a few words, as they put it, "set_aside": keys of ideas in the garden they now leave behind}]. Their new ideas then grow from that earlier idea (or from what grows out of it), never from what they set aside.
- Only a clear return; most readings have none; at most 3. Otherwise "returns": [].

6. Honesty.
- Use only what is in the messages. Do not reduce multiple distinguishable proposals, serious objections or meaningful refinements to a few vague topic headings. Aim to preserve each consequential contribution, up to 20 in this batch (they are kept across readings, so a long discussion grows a large tree). Do not force a quota, and omit irrelevant chatter.
- Return "reactions" for later messages that support, restate or challenge an idea that ALREADY EXISTS in the garden, using its exact existing key. This is how a new speaker can influence an earlier branch without having to invent another idea.
- Candidates from the first pass are only a grounded inventory to consider; read the source messages again and make independent judgments. Do not assume a first-pass claim or connection is correct.

A worked example of the level of detail wanted (from another garden; never copy its content). The question was "What should we build?". One answer offered five directions and the discussion went on:
- stage 1 "ChatGPT offers four directions": FitLoop for garment samples (answers root, growing), LessonPulse (answers root, dormant), SustainTrace (answers root, dormant), AzureSpend Guard (answers root, dormant), AccessSafe (an existing project, answers root, dormant); then One workflow engine (refines FitLoop, merges SustainTrace and AccessSafe: "these projects share one shape: feedback, revision, review, sign-off"; knot conclusion).
- stage 2 "Collaboration looks like evolution": Collaboration as evolution (grows from One workflow engine) → Variation · selection · retention (refines it, names a theory) → Retention is the heart (refines that).
- stage 3 "AI speeds up collaboration": AI speeds up collaboration (grows from Collaboration as evolution) → A general AI group chat (dormant: "the giants already do it") and Private channels, shared view (splits) → AI as a thermostat, A Wizard of Oz test (both refine Private channels).
Eleven ideas from three turns, every option kept, lines four deep, one merge, one knot.

Return only JSON, exactly in this shape:
{"stages":[{"n":1,"title":"..."}],"root":null,"returns":[],"reactions":[{"key":"existing-idea-key","m":"m5","role":"supports"}],"ideas":[{"id":"short-id","label":"...","note":"...","origin":"m3","quote":"...","evidence":[],"parent":"root-or-key-or-id","nature":null,"why":"...","basis":"inferred","merges":[],"status":"growing","knot":null,"stage":1}]}`;

/** How sure a link is: stated in the words, or the gardener's inference, which always reads "Likely: …". */
export function withBasis(why: string, basis: string): { why: string | null; basis: "stated" | "inferred" } {
  const guessed = basis === "inferred" || /^likely:/i.test(why.trim()) || !why.trim();
  const plain = why.trim().replace(/^(?:likely|stated):\s*/i, "");
  if (!guessed) return { why: clip(plain, 240), basis: "stated" };
  return { why: plain ? clip(`Likely: ${plain}`, 240) : null, basis: "inferred" };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** A long label is cut at a word boundary, never mid-word ("Socket overload trips fu"). */
export function shorten(label: string): string {
  const chars = [...label];
  if (chars.length <= MAX_LABEL) return label;
  const head = chars.slice(0, MAX_LABEL + 1).join("");
  const space = head.lastIndexOf(" ");
  if (space >= MAX_LABEL / 2) {
    let cut = head.slice(0, space).replace(/[\s,;:–—-]+$/, "");
    // Don't end on a little word: "Submit a fault report to" → "Submit a fault report".
    const little = /\s+(?:a|an|the|to|of|and|or|for|in|on|at|by|with|och|att|en|ett|av|på|i|med|för|från)$/i;
    while (little.test(cut)) cut = cut.replace(little, "");
    return cut;
  }
  return chars.slice(0, MAX_LABEL).join("").trim();
}

const when = (t: string | null | undefined) => (t ? t.slice(0, 16).replace("T", " ") : "time unknown");

/** The prompt: the garden as it stands and the messages in the order they were said, with short refs. */
export function harvestPrompt(input: HarvestInput): { system: string; user: string } {
  const tree = input.ideas.map((i) => `- ${i.key}: ${i.label}${i.note ? ` (${clip(i.note, 140)})` : ""}; by ${i.by}${i.at ? `, ${when(i.at)}` : ""}${i.parents.length ? `; grew from ${i.parents.join(", ")}` : "; the root"}${i.status === "dormant" ? "; resting" : ""}${i.knot ? "; knot" : ""}`).join("\n");
  const several = new Set(input.messages.map((m) => m.source ?? "")).size > 1;
  const msgs = input.messages.map((m) => `${m.ref} [${when(m.sentAt)}]${several && m.source ? ` (${m.source})` : ""} ${voiceLine(m)}: ${m.content.replace(/\s*\n\s*/g, " / ")}`).join("\n");
  const root = input.nameRoot ? `

This garden is new: its root "${input.rootKey}" is only a placeholder. Also return "root": {"label": the question or subject the group keeps coming back to, as a short name (same limits as idea labels), "note": one sentence, "origin": the ref of the message where a person first raised it, or null when it is the group's shared subject rather than one person's words}. Ideas that start a thread still grow from "${input.rootKey}".` : "";
  const resume = input.resumeFrom && input.ideas.some((i) => i.key === input.resumeFrom)
    ? `\n\nThe people say these messages pick up again from "${input.resumeFrom}". Unless the words clearly say otherwise, record that return in "returns" and grow the new ideas from there.` : "";
  const told = input.told?.trim() ? `\n\nThe people told the gardener about these messages: “${clip(input.told.trim(), 600)}”` : "";
  const part = input.part && input.part.of > 1 ? ` (part ${input.part.n} of ${input.part.of}; the ideas of earlier parts are already in the garden above)` : "";
  const inventory = input.candidates?.length
    ? `\n\nFirst-pass source-verified statements to consider (not final ideas):\n${input.candidates.map(c => `- ${c.origin}: [${c.kind}] ${c.claim} | exact words: “${c.quote}”`).join("\n")}`
    : "";
  const user = `Garden: ${input.gardenTitle}
The root (the group's question) is "${input.rootKey}".${root}${resume}${told}

Ideas already in the garden:
${tree || "(only the root)"}

${several ? "Conversations" : "Conversation"}: ${input.conversationTitle}${part}${input.skipped ? ` (the ${input.skipped} earliest messages are not shown)` : ""}
Times are UTC. Messages in the order they were said:
${msgs}${inventory}`;
  return { system: SYSTEM, user };
}

/** The model's answer as JSON, tolerating a code fence around it. */
export function parseAnswer(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error("The gardener’s answer could not be read.");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
/** A deliberately conservative near-duplicate check for two short names of the SAME idea.
 * It is only applied to a named root when the origin message is identical. */
export function rootNameEquivalent(a: string, b: string): boolean {
  if (norm(a) === norm(b)) return true;
  const stop = new Set(["a", "an", "the", "of", "for", "to", "on", "in", "with", "and", "how", "we", "our"]);
  const words = (s: string) => [...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(w => !stop.has(w)).map(w => w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w)
    .map(w => w.length > 6 ? w.slice(0, 6) : w))];
  const wa = words(a), wb = words(b);
  if (wa.length < 2 || wb.length < 2) return false;
  const common = wa.filter(w => wb.includes(w)).length;
  return common >= 2 && common / Math.max(wa.length, wb.length) >= 0.8;
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Any = Record<string, unknown>;

/** Check every proposal against the conversation and the garden. Anything that fails is dropped with a reason. */
export function checkHarvest(answer: unknown, input: HarvestInput): Checked {
  const a = (answer && typeof answer === "object" ? answer : {}) as Any;
  const rawIdeas = Array.isArray(a["ideas"]) ? (a["ideas"] as Any[]) : [];
  const byRef = new Map(input.messages.map((m) => [m.ref, m]));
  const existing = new Map(input.ideas.map((i) => [i.key, i]));
  const rootName = readRoot(a["root"], input, byRef);
  const namedRootLabel = rootName?.label ?? existing.get(input.rootKey)?.label ?? "";
  const known = new Set(input.ideas.map((i) => norm(i.label)));
  if (rootName) known.add(norm(rootName.label));
  const dropped: Checked["dropped"] = [];
  const stagesIn = Array.isArray(a["stages"]) ? (a["stages"] as Any[]) : [];
  const stages = stagesIn.slice(0, MAX_STAGES).map((s, i) => ({ n: i + 1, title: clip(str(s["title"]) || `Part ${i + 1}`, 60) }));
  if (!stages.length) stages.push({ n: 1, title: clip(input.conversationTitle || "Harvest", 60) });
  const stageOf = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= stages.length ? n : 1; };

  // 1. each idea on its own
  const out: Proposal[] = [];
  const temps = new Set<string>();
  for (const r of rawIdeas) {
    if (!r || typeof r !== "object") continue;
    let label = str(r["label"]).replace(/^["“'「]+|["”'」]+$/g, "");
    if ([...label].length > MAX_LABEL) label = shorten(label);
    if (!label) { dropped.push({ label: "(no label)", reason: "it had no label" }); continue; }
    const origin = byRef.get(str(r["origin"]));
    if (!origin) { dropped.push({ label, reason: "its origin is not a message in this conversation" }); continue; }
    // ideas belong to whoever said them in the conversation, a person or an AI taking part; never to the gardener
    // words with no known author (notes, an article, a fragment) still carry ideas; they are credited to no one, never to a guessed person
    if (known.has(norm(label))) { dropped.push({ label, reason: "it is already in the garden" }); continue; }
    if (rootName?.originMessageId === origin.id && rootNameEquivalent(label, namedRootLabel)) {
      dropped.push({ label, reason: "it repeats the opening question" }); continue;
    }
    let temp = str(r["id"]) || `new-${out.length + 1}`;
    while (temps.has(temp) || existing.has(temp)) temp += "'";
    temps.add(temp);
    known.add(norm(label));
    const quote = str(r["quote"]);
    const ev = Array.isArray(r["evidence"]) ? (r["evidence"] as Any[]) : [];
    const evidence: Proposal["evidence"] = [];
    for (const e of ev) {
      const m = byRef.get(str(e?.["m"] ?? e?.["message"]));
      const role = str(e?.["role"]) as Proposal["evidence"][number]["role"];
      if (m && m.id !== origin.id && EVIDENCE_ROLES.includes(role) && !evidence.some((x) => x.messageId === m.id)) evidence.push({ messageId: m.id, role });
    }
    const k = r["knot"] as Any | null;
    const kind = str(k?.["kind"]) as NonNullable<Proposal["knot"]>["kind"];
    const settled = clip(str(k?.["settled"]), 240);
    const nature = str(r["nature"]) as Proposal["nature"];
    out.push({
      temp, label, note: clip(str(r["note"]), 280), personId: origin.personId, originMessageId: origin.id,
      quote: quote && norm(ownWords(origin.content)).includes(norm(quote)) ? quote : null,
      evidence, parent: str(r["parent"]), parentIsNew: false, nature: nature && NATURES.includes(nature) ? nature : null,
      ...withBasis(str(r["why"]), str(r["basis"])),
      merges: (Array.isArray(r["merges"]) ? (r["merges"] as Any[]) : []).map((x) => ({ target: str(x?.["with"]), isNew: false, why: clip(str(x?.["why"]), 240) || null })),
      status: str(r["status"]) === "dormant" ? "dormant" : "growing",
      knot: k && KNOT_KINDS.includes(kind) && settled ? { kind, settled, messageId: byRef.get(str(k["m"]))?.id ?? null } : null,
      stage: stageOf(r["stage"]),
    });
    if (out.length >= MAX_PROPOSALS) break;
  }
  if (rawIdeas.length > out.length + dropped.length) dropped.push({ label: `${rawIdeas.length - out.length - dropped.length} more`, reason: `only ${MAX_PROPOSALS} suggestions are kept per reading` });

  // 2. lineage: parents and merges must exist; anything unknown grows from the root
  const newIds = new Set(out.map((p) => p.temp));
  for (const p of out) {
    if (p.parent === p.temp || !(existing.has(p.parent) || newIds.has(p.parent))) p.parent = input.rootKey;
    p.parentIsNew = newIds.has(p.parent);
    p.merges = p.merges.filter((m, i, all) => m.target !== p.temp && m.target !== p.parent && (existing.has(m.target) || newIds.has(m.target)) && all.findIndex((x) => x.target === m.target) === i).slice(0, 2)
      .map((m) => ({ ...m, isNew: newIds.has(m.target) }));
    if (p.nature === "combines" && !p.merges.length) p.nature = null;
  }
  // a loop among proposals is broken at the root
  for (const p of out) {
    const seen = new Set<string>([p.temp]);
    for (let q = out.find((x) => x.temp === p.parent); q; q = out.find((x) => x.temp === q!.parent)) {
      if (seen.has(q.temp)) { p.parent = input.rootKey; p.parentIsNew = false; break; }
      seen.add(q.temp);
    }
  }
  // 2a. going back: after the group returns to an earlier idea, nothing grows from what they set aside
  const returns = readReturns(a["returns"], input, byRef, existing);
  const at = new Map(input.messages.map((m, i) => [m.id, i]));
  for (const r of returns) {
    const from = r.messageId ? at.get(r.messageId)! : 0;
    const aside = new Set(r.setAside);
    for (const p of out) {
      if (at.get(p.originMessageId)! < from) continue;
      if (aside.has(p.parent)) {
        p.parent = r.to; p.parentIsNew = false; p.nature = null;
        p.why = `Grows again from “${existing.get(r.to)!.label}” after the group went back${r.why ? `: ${r.why}` : ""}.`;
      }
      p.merges = p.merges.filter((m) => !aside.has(m.target));
      if (p.nature === "combines" && !p.merges.length) p.nature = null;
    }
  }

  // 2b. order is evidence: nothing grows from, merges with or is settled by something said later
  const index = new Map(input.messages.map((m, i) => [m.id, i]));
  const sentAt = new Map(input.messages.map((m) => [m.id, m.sentAt]));
  const proposal = new Map(out.map((p) => [p.temp, p]));
  const saidAfter = (key: string, child: Proposal): boolean => {
    const np = proposal.get(key);
    if (np) return index.get(np.originMessageId)! > index.get(child.originMessageId)!;
    const at = existing.get(key)?.at, ct = sentAt.get(child.originMessageId);
    return !!(at && ct && Date.parse(at) > Date.parse(ct));
  };
  const parentOf = (key: string) => proposal.get(key)?.parent ?? existing.get(key)?.parents[0] ?? input.rootKey;
  for (const p of [...out].sort((a, b) => index.get(a.originMessageId)! - index.get(b.originMessageId)!)) {
    let moved = false;
    for (let guard = 0; p.parent !== input.rootKey && saidAfter(p.parent, p) && guard <= out.length + input.ideas.length; guard++) { p.parent = parentOf(p.parent); moved = true; }
    if (moved) {
      if (saidAfter(p.parent, p)) p.parent = input.rootKey;
      p.parentIsNew = proposal.has(p.parent);
      p.nature = null;
      p.why = "Placed by the order of the messages: what it seemed to grow from was said later.";
    }
    p.merges = p.merges.filter((m) => !saidAfter(m.target, p) && m.target !== p.parent);
    if (p.nature === "combines" && !p.merges.length) p.nature = null;
    if (p.knot?.messageId && index.get(p.knot.messageId)! < index.get(p.originMessageId)!) p.knot.messageId = null;
  }

  // strict about knots
  let knots = 0;
  for (const p of out) if (p.knot && ++knots > MAX_KNOTS) p.knot = null;

  // 3. the whole garden must still validate (merges that would loop are let go)
  const graph = () => [
    ...input.ideas.map((i) => ({ id: i.key, label: i.label, parents: i.parents })),
    ...out.map((p) => ({ id: p.temp, label: p.label, parents: [p.parent, ...p.merges.map((m) => m.target)] })),
  ];
  if (validateGarden(graph()).length) { for (const p of out) p.merges = []; }

  // 4. parents before children, so they can be written in order
  const ordered: Proposal[] = [];
  const placed = new Set<string>();
  const place = (p: Proposal, depth = 0) => {
    if (placed.has(p.temp) || depth > out.length) return;
    for (const dep of [p.parent, ...p.merges.map((m) => m.target)]) { const d = out.find((x) => x.temp === dep); if (d) place(d, depth + 1); }
    if (!placed.has(p.temp)) { placed.add(p.temp); ordered.push(p); }
  };
  out.forEach((p) => place(p));

  // 5. stages in the order they happened; a branch never appears before what it grows from
  const first = new Map<number, number>();
  for (const p of ordered) first.set(p.stage, Math.min(first.get(p.stage) ?? Infinity, index.get(p.originMessageId)!));
  const rank = new Map([...first.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([n], i) => [n, i + 1]));
  const title = new Map(stages.map((s) => [s.n, s.title]));
  const usedTitles = [...rank.entries()].sort((a, b) => a[1] - b[1]).map(([n, r]) => ({ n: r, title: title.get(n)! }));
  const stageOfTemp = new Map<string, number>();
  for (const p of ordered) {
    const parentStage = stageOfTemp.get(p.parent) ?? 1;
    p.stage = Math.max(rank.get(p.stage)!, parentStage, ...p.merges.map((m) => stageOfTemp.get(m.target) ?? 1));
    stageOfTemp.set(p.temp, p.stage);
  }
  const used = new Set(ordered.map((p) => p.stage));

  const reactions: Reaction[] = [];
  const seenReactions = new Set<string>();
  const rawReactions = Array.isArray(a["reactions"]) ? a["reactions"] as Any[] : [];
  for (const r of rawReactions.slice(0, 120)) {
    if (!r || typeof r !== "object") continue;
    const key = str(r["key"]), msg = byRef.get(str(r["m"]));
    const role = str(r["role"]) as Reaction["role"];
    if (!existing.has(key) || !msg || !EVIDENCE_ROLES.includes(role)) continue;
    const token = `${key}|${msg.id}|${role}`;
    if (seenReactions.has(token)) continue;
    seenReactions.add(token);
    reactions.push({ key, messageId: msg.id, role });
  }
  return { proposals: ordered, stages: usedTitles.filter((s) => used.has(s.n)), dropped, root: rootName, returns, reactions };
}

/**
 * Where the group went back to an earlier idea. Only ideas already in the garden can be gone back to or set
 * aside; the idea gone back to and its ancestors are never set aside. When the people said where it picks up,
 * that return is kept even if the model missed it.
 */
function readReturns(v: unknown, input: HarvestInput, byRef: Map<string, HarvestMessage>, existing: Map<string, HarvestIdea>): Return[] {
  const ancestors = (key: string) => {
    const up = new Set<string>();
    for (let k = existing.get(key)?.parents[0]; k && !up.has(k); k = existing.get(k)?.parents[0]) up.add(k);
    return up;
  };
  const out: Return[] = [];
  for (const raw of (Array.isArray(v) ? v : []).slice(0, 3)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Any;
    const to = str(r["to"]);
    if (!existing.has(to) || out.some((x) => x.to === to)) continue;
    const m = byRef.get(str(r["m"]));
    const up = ancestors(to);
    const setAside = [...new Set((Array.isArray(r["set_aside"]) ? r["set_aside"] : []).map(str))]
      .filter((k) => existing.has(k) && k !== to && k !== input.rootKey && !up.has(k));
    out.push({ to, messageId: m?.id ?? null, personId: m?.personId ?? null, why: str(r["why"]) ? clip(str(r["why"]), 140) : null, setAside });
  }
  const hint = input.resumeFrom;
  if (hint && existing.has(hint) && !out.some((x) => x.to === hint)) {
    const first = input.messages.find((m) => m.personIsHuman && m.personId) ?? input.messages[0];
    out.unshift({ to: hint, messageId: first?.id ?? null, personId: first?.personId ?? null, why: input.told?.trim() ? clip(input.told.trim(), 140) : null, setAside: [] });
  }
  return out;
}

/** The name the gardener gives a new garden's root; its words, if any, belong to whoever said them. */
function readRoot(v: unknown, input: HarvestInput, byRef: Map<string, HarvestMessage>): RootName | null {
  if (!input.nameRoot || !v || typeof v !== "object") return null;
  const r = v as Any;
  let label = str(r["label"]).replace(/^["“'「]+|["”'」]+$/g, "");
  if ([...label].length > MAX_LABEL) label = shorten(label);
  if (!label) return null;
  const origin = byRef.get(str(r["origin"]));
  const said = origin && origin.personId ? origin : null;
  return { label, note: clip(str(r["note"]), 280), personId: said?.personId ?? null, originMessageId: said?.id ?? null };
}

/** The latest messages that fit the reading budget. */
export function fitMessages<T extends { content: string }>(messages: T[], budget = 90000): { kept: T[]; skipped: number } {
  let total = 0, start = messages.length;
  while (start > 0 && total + messages[start - 1]!.content.length + 40 <= budget) { total += messages[start - 1]!.content.length + 40; start--; }
  return { kept: messages.slice(start), skipped: start };
}

/** New ideas in this reading that grow straight from the root (the broom the origin tree never has). */
export function crowdedRoot(proposals: Proposal[], rootKey: string): Proposal[] {
  return proposals.filter((p) => p.parent === rootKey && !p.parentIsNew && !p.merges.length);
}

/**
 * A broom is not wrong in itself: ideas raised together in answer to the question, which nobody took further, are
 * a real divergence and stay on the root. It is wrong when the discussion had structure that the reading lost:
 * the ideas were raised across many turns, the gardener itself marked them as refining or challenging something,
 * or an agenda item / sub-question that they answer was not kept. Only then is the gardener asked again.
 */
export function brokenBroom(proposals: Proposal[], input: HarvestInput): { crowd: Proposal[]; reasons: string[] } {
  const crowd = crowdedRoot(proposals, input.rootKey);
  if (crowd.length <= ROOT_CROWD) return { crowd, reasons: [] };
  const reasons: string[] = [];
  const pos = new Map(input.messages.map((m, i) => [m.id, i]));
  // 1. raised across the discussion, not in one burst
  const byStage = new Map<number, number>();
  for (const p of crowd) byStage.set(p.stage, (byStage.get(p.stage) ?? 0) + 1);
  const at = crowd.map((p) => pos.get(p.originMessageId) ?? 0);
  const span = (Math.max(...at) - Math.min(...at) + 1) / Math.max(1, input.messages.length);
  if (byStage.size >= 3 && Math.max(...byStage.values()) / crowd.length < 0.6 && span > 0.5) reasons.push(`they were raised in ${byStage.size} different turns of the discussion, not together`);
  // 2. the gardener itself said they continue something
  const continuing = crowd.filter((p) => p.nature === "refines" || p.nature === "challenges" || p.nature === "combines");
  if (continuing.length >= 2) reasons.push(`${continuing.map((p) => `“${p.label}”`).join(", ")} were marked as refining or challenging something, yet grew from the root`);
  // 3. an agenda item or sub-question that some of them answer is not an idea (answering the main question itself does not count)
  const origins = new Set(proposals.map((p) => p.originMessageId));
  const AGENDA = /[?？]\s*$|^(?:next|now|moving on|let'?s (?:talk|move|discuss|look)|what about|how about|接下来|下一个|然后说|再说|关于|那么)/i;
  const agenda = input.messages.map((m, i) => ({ m, i })).filter(({ m }) => !origins.has(m.id) && AGENDA.test(m.content.trim()));
  for (const [n, { m, i }] of agenda.entries()) {
    // what follows it, up to the next agenda item
    const until = agenda[n + 1]?.i ?? input.messages.length;
    const answered = crowd.filter((p) => { const k = pos.get(p.originMessageId) ?? -1; return k > i && k < until; });
    if (answered.length >= 2 && answered.length <= crowd.length * 0.6) {
      reasons.push(`${m.ref} (“${clip(m.content.trim(), 60)}”) raises a sub-question that ${answered.map((p) => `“${p.label}”`).join(", ")} answer, but it is not an idea`);
      break;
    }
  }
  return { crowd, reasons };
}

/** What the gardener is told when a reading lost the discussion's structure: why, and that real divergence may stay. */
export function regrowNote(crowd: Proposal[], reasons: string[] = []): string {
  return `\n\nYour previous answer grew ${crowd.length} ideas straight from the root (${crowd.map((p) => `“${p.label}”`).join(", ")}).${reasons.length ? ` But ${reasons.join("; ")}.` : ""} Read the messages again: find the sub-questions, agenda items or ideas these continue (raise a sub-question as an idea where someone actually raised it), and give each idea the parent it continues. Ideas that really were raised together as parallel answers to the main question, and not taken further, may stay on the root. Keep every idea that is grounded in the words; return the complete answer again.`;
}
