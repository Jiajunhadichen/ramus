import { MAX_LABEL, validateGarden } from "@/lib/stam/validate";

/**
 * Harvest: the gardener reads a conversation and proposes how the group's ideas grew.
 * The model only proposes; this module checks every proposal mechanically before anything is written,
 * and people accept or reject each one. Pure: no network, no database.
 */

export type HarvestMessage = {
  ref: string; id: string; speaker: string | null; personId: string | null; personIsHuman: boolean;
  sentAt: string | null; content: string;
};
export type HarvestIdea = { key: string; label: string; note: string; by: string; parents: string[]; status: string; knot: boolean };
export type HarvestInput = {
  gardenTitle: string; conversationTitle: string; rootKey: string;
  ideas: HarvestIdea[]; messages: HarvestMessage[]; skipped: number;
};

export const NATURES = ["refines", "answers", "challenges", "splits", "combines"] as const;
export const KNOT_KINDS = ["decision", "result", "ruled_out", "conclusion"] as const;
export const EVIDENCE_ROLES = ["restated", "supports", "challenges"] as const;
export const MAX_PROPOSALS = 15;
export const MAX_KNOTS = 4;
export const MAX_STAGES = 6;

export type Proposal = {
  temp: string; label: string; note: string; personId: string; originMessageId: string; quote: string | null;
  evidence: { messageId: string; role: (typeof EVIDENCE_ROLES)[number] }[];
  parent: string; parentIsNew: boolean; nature: (typeof NATURES)[number] | null; why: string | null;
  merges: { target: string; isNew: boolean; why: string | null }[];
  status: "growing" | "dormant"; knot: { kind: (typeof KNOT_KINDS)[number]; settled: string } | null; stage: number;
};
export type Checked = { proposals: Proposal[]; stages: { n: number; title: string }[]; dropped: { label: string; reason: string }[] };

const SYSTEM = `You are the gardener of a Ramus garden. Ramus believes the best ideas grow between people.
You read a recorded group discussion and propose how the people's ideas grew out of each other: where an idea answered, refined, challenged or split from another, where two lines of thought merged, which ideas went quiet, and which questions the group settled.

You never add ideas of your own and you never summarise. Everything you return is a suggestion that people will accept or reject, so keep it checkable.

1. Ideas belong to people.
- An idea is something a person said that others could build on: a proposal, claim, question, option, decision, correction or explanation. Small talk, greetings, thanks and plain agreement are not ideas.
- Every idea has an "origin": the ref of the message where a person first says it. The author is whoever wrote that message; never choose a message by an AI assistant as an origin. If a person takes up an AI's suggestion, the origin is that person's message.
- "quote": the shortest exact words (at most 20) from the origin message that carry the idea, copied character for character.
- "label": the idea as a short name, not a sentence, in the language of the discussion: at most 12 Chinese characters or 5 English words (hard limit 24 characters).
- "note": one sentence, at most 30 words, saying what the idea is in the speaker's own terms. Do not improve, extend or judge it.
- "evidence": other messages that restate, support or challenge the idea: [{"m": "m12", "role": "restated" | "supports" | "challenges"}].

2. Lineage.
- "parent": the single idea this one most directly grew from: the key of an existing idea in the garden, or the id of another idea you propose. Ideas that start a new thread grow from the garden's root.
- "nature": how it relates to its parent: "answers", "refines", "challenges", "splits" (an alternative branching off) or "combines" (only with merges). Use null when there is no such relation, as when someone simply opens a new topic under the root; never say "answers" unless it really answers the parent.
- "why": one checkable sentence on why this is the parent. Start with "Likely:" if it is a guess.
- "merges": only when an idea explicitly combines earlier ideas: [{"with": key or id, "why": "..."}]. Similar topics are not a merge.
- Never repeat an idea that is already in the garden; attach to it instead.

3. Rest and clicks.
- "status": "dormant" when an idea was raised and then dropped or never taken up; otherwise "growing". Quiet ideas matter; keep them.
- "knot": a click, a sub-question the group clearly settled: an explicit decision, a confirmed result, an option ruled out, or a conclusion others then built on. Give {"kind": "decision" | "result" | "ruled_out" | "conclusion", "settled": "one sentence on what is now settled"}; otherwise null. Be strict: most discussions have 0 to 3.

4. Time.
- "stages": 1 to 6 natural turns of the discussion, in order, each {"n": 1, "title": "at most 6 words"}. Each idea has "stage": the stage where it first appears.

5. Honesty.
- Use only what is in the messages. Prefer fewer, well-grounded ideas over many thin ones: at most 15. Unrelated chatter is not a thread; leave it out.

Return only JSON, exactly in this shape:
{"stages":[{"n":1,"title":"..."}],"ideas":[{"id":"short-id","label":"...","note":"...","origin":"m3","quote":"...","evidence":[],"parent":"root-or-key-or-id","nature":null,"why":"...","merges":[],"status":"growing","knot":null,"stage":1}]}`;

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

/** The prompt: the garden as it stands and the conversation, with short message refs. */
export function harvestPrompt(input: HarvestInput): { system: string; user: string } {
  const tree = input.ideas.map((i) => `- ${i.key}: ${i.label}${i.note ? ` (${clip(i.note, 140)})` : ""}; by ${i.by}${i.parents.length ? `; grew from ${i.parents.join(", ")}` : "; the root"}${i.status === "dormant" ? "; resting" : ""}${i.knot ? "; knot" : ""}`).join("\n");
  const msgs = input.messages.map((m) => `${m.ref} [${m.sentAt ? m.sentAt.slice(0, 16).replace("T", " ") : "time unknown"}] ${m.speaker ?? "Unattributed"}${m.personIsHuman ? "" : " (AI)"}: ${m.content.replace(/\s*\n\s*/g, " / ")}`).join("\n");
  const user = `Garden: ${input.gardenTitle}
The root (the group's question) is "${input.rootKey}".

Ideas already in the garden:
${tree || "(only the root)"}

Conversation: ${input.conversationTitle}${input.skipped ? ` (the ${input.skipped} earliest messages are not shown)` : ""}
${msgs}`;
  return { system: SYSTEM, user };
}

/** The model's answer as JSON, tolerating a code fence around it. */
export function parseAnswer(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new Error("The gardener's answer could not be read.");
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Any = Record<string, unknown>;

/** Check every proposal against the conversation and the garden. Anything that fails is dropped with a reason. */
export function checkHarvest(answer: unknown, input: HarvestInput): Checked {
  const a = (answer && typeof answer === "object" ? answer : {}) as Any;
  const rawIdeas = Array.isArray(a["ideas"]) ? (a["ideas"] as Any[]) : [];
  const byRef = new Map(input.messages.map((m) => [m.ref, m]));
  const existing = new Map(input.ideas.map((i) => [i.key, i]));
  const known = new Set(input.ideas.map((i) => norm(i.label)));
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
    if (!origin.personId || !origin.personIsHuman) { dropped.push({ label, reason: "its first words have no human speaker" }); continue; }
    if (known.has(norm(label))) { dropped.push({ label, reason: "it is already in the garden" }); continue; }
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
      quote: quote && norm(origin.content).includes(norm(quote)) ? quote : null,
      evidence, parent: str(r["parent"]), parentIsNew: false, nature: nature && NATURES.includes(nature) ? nature : null,
      why: clip(str(r["why"]), 240) || null,
      merges: (Array.isArray(r["merges"]) ? (r["merges"] as Any[]) : []).map((x) => ({ target: str(x?.["with"]), isNew: false, why: clip(str(x?.["why"]), 240) || null })),
      status: str(r["status"]) === "dormant" ? "dormant" : "growing",
      knot: k && KNOT_KINDS.includes(kind) && settled ? { kind, settled } : null,
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
  const used = new Set(ordered.map((p) => p.stage));
  return { proposals: ordered, stages: stages.filter((s) => used.has(s.n)), dropped };
}

/** The latest messages that fit the reading budget. */
export function fitMessages<T extends { content: string }>(messages: T[], budget = 90000): { kept: T[]; skipped: number } {
  let total = 0, start = messages.length;
  while (start > 0 && total + messages[start - 1]!.content.length + 40 <= budget) { total += messages[start - 1]!.content.length + 40; start--; }
  return { kept: messages.slice(start), skipped: start };
}
