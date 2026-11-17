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
};
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
  status: "growing" | "dormant"; knot: { kind: (typeof KNOT_KINDS)[number]; settled: string; messageId: string | null } | null; stage: number;
};
export type RootName = { label: string; note: string; personId: string | null; originMessageId: string | null };
/** The group went back to an earlier idea and grew again from there. */
export type Return = { to: string; messageId: string | null; personId: string | null; why: string | null; setAside: string[] };
export type Checked = { proposals: Proposal[]; stages: { n: number; title: string }[]; dropped: { label: string; reason: string }[]; root: RootName | null; returns: Return[] };

const SYSTEM = `You are the gardener of a Ramus garden. Ramus believes the best ideas grow between people.
You read a recorded group discussion and trace how the people's ideas grew out of each other: where an idea answered, refined, challenged or split from another, where two lines of thought merged, which ideas went quiet, and which questions the group settled.

You never add ideas of your own and you never summarise. What you return goes straight onto the group's tree, and anyone can take it off again, so keep every branch checkable.

Messages are listed in the order they were said, across every source. Order is evidence: an idea can only grow from, merge with or be settled after something said before it.

1. Ideas belong to people.
- An idea is something a person said that others could build on: a proposal, claim, question, option, decision, correction or explanation. Small talk, greetings, thanks and plain agreement are not ideas.
- Every idea has an "origin": the ref of the message where it is first said. The author is whoever wrote that message: a person, or an AI that took part in the conversation (marked "(AI)"). You, the gardener, never add ideas of your own.
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
- "knot": a click, a sub-question the group clearly settled: an explicit decision, a confirmed result, an option ruled out, or a conclusion others then built on. Give {"kind": "decision" | "result" | "ruled_out" | "conclusion", "settled": "one sentence on what is now settled", "m": the ref of the message where it was settled}; otherwise null. Be strict: most discussions have 0 to 3.

4. Time.
- "stages": 1 to 6 natural turns of the discussion, in the order they happened, each {"n": 1, "title": "at most 6 words"}. Each idea has "stage": the stage where it first appears.

5. Going back.
- Groups often go back to an earlier point: a result is turned down (the cost will not come down, a client says no, a test fails) and they return to an idea they had before and branch out again from there. When the messages go back like this, give "returns": [{"to": the key of the earlier idea in the garden they go back to, "m": the ref of the message where they go back, "why": the reason in a few words, as they put it, "set_aside": keys of ideas in the garden they now leave behind}]. Their new ideas then grow from that earlier idea (or from what grows out of it), never from what they set aside.
- Only a clear return; most readings have none; at most 3. Otherwise "returns": [].

6. Honesty.
- Use only what is in the messages. Prefer fewer, well-grounded ideas over many thin ones: at most 15. Unrelated chatter is not a thread; leave it out.

Return only JSON, exactly in this shape:
{"stages":[{"n":1,"title":"..."}],"root":null,"returns":[],"ideas":[{"id":"short-id","label":"...","note":"...","origin":"m3","quote":"...","evidence":[],"parent":"root-or-key-or-id","nature":null,"why":"...","merges":[],"status":"growing","knot":null,"stage":1}]}`;

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
  const msgs = input.messages.map((m) => `${m.ref} [${when(m.sentAt)}]${several && m.source ? ` (${m.source})` : ""} ${m.speaker ?? "Unattributed"}${m.personIsHuman ? "" : " (AI)"}: ${m.content.replace(/\s*\n\s*/g, " / ")}`).join("\n");
  const root = input.nameRoot ? `

This garden is new: its root "${input.rootKey}" is only a placeholder. Also return "root": {"label": the question or subject the group keeps coming back to, as a short name (same limits as idea labels), "note": one sentence, "origin": the ref of the message where a person first raised it, or null when it is the group's shared subject rather than one person's words}. Ideas that start a thread still grow from "${input.rootKey}".` : "";
  const resume = input.resumeFrom && input.ideas.some((i) => i.key === input.resumeFrom)
    ? `\n\nThe people say these messages pick up again from "${input.resumeFrom}". Unless the words clearly say otherwise, record that return in "returns" and grow the new ideas from there.` : "";
  const told = input.told?.trim() ? `\n\nThe people told the gardener about these messages: “${clip(input.told.trim(), 600)}”` : "";
  const part = input.part && input.part.of > 1 ? ` (part ${input.part.n} of ${input.part.of}; the ideas of earlier parts are already in the garden above)` : "";
  const user = `Garden: ${input.gardenTitle}
The root (the group's question) is "${input.rootKey}".${root}${resume}${told}

Ideas already in the garden:
${tree || "(only the root)"}

${several ? "Conversations" : "Conversation"}: ${input.conversationTitle}${part}${input.skipped ? ` (the ${input.skipped} earliest messages are not shown)` : ""}
Times are UTC. Messages in the order they were said:
${msgs}`;
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
    // ideas belong to whoever said them in the conversation, a person or an AI taking part; never to the gardener
    if (!origin.personId) { dropped.push({ label, reason: "its first words have no known speaker" }); continue; }
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

  return { proposals: ordered, stages: usedTitles.filter((s) => used.has(s.n)), dropped, root: readRoot(a["root"], input, byRef), returns };
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
