import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateGarden, formatError, MAX_LABEL } from "./stam/validate";
import type { StamGarden, ValidationError } from "./stam/types";
import { prepare, checkDraft, resolveVoices, isRealName, type PrepareInput, type PrepareOptions, type Format } from "./intake";
import { nextColor } from "./stam/palette";
import sample from "../../docs/sample-garden.json";

type DB = SupabaseClient<Database>;
type Ctx = { supabase: DB; userId: string };

const newKey = () => Math.random().toString(36).slice(2, 10);
function fail(msg: string): never { throw new Error(msg); }
function check<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) fail(r.error.message);
  return r.data as NonNullable<T>;
}

async function loadGraph(supabase: DB, gardenId: string) {
  const ideas = check(await supabase.from("ideas").select("id,key,label,step,position").eq("garden_id", gardenId).order("position"));
  const links = check(await supabase.from("idea_links").select("parent_id,child_id,kind,position").eq("garden_id", gardenId).order("position"));
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const nodes = ideas.map((i) => {
    const mine = links.filter((l) => l.child_id === i.id);
    const prim = mine.filter((l) => l.kind === "primary").map((l) => byId.get(l.parent_id)!.key);
    const merges = mine.filter((l) => l.kind === "merge").map((l) => byId.get(l.parent_id)!.key);
    return { id: i.key, label: i.label, step: i.step, parents: [...prim, ...merges], dbId: i.id };
  });
  return { nodes, byKey: new Map(nodes.map((n) => [n.id, n])) };
}

function assertValid(nodes: { id: string; label: string; parents: string[] }[]) {
  const errs = validateGarden(nodes);
  if (errs.length) fail(errs.map(formatError).join("\n"));
}

type Thought = { type: "raised" | "challenged" | "refined" | "merged" | "rested" | "revived" | "settled" | "reopened"; idea_id: string; related_idea_id?: string | null; settled_kind?: string | null; person_id?: string | null; message_id?: string | null; rationale?: string | null };
/** Audit event + its thought events in one database transaction (record_action). */
async function record(ctx: Ctx, gardenId: string, type: Database["public"]["Tables"]["events"]["Insert"]["type"], ideaId: string | null, payload: Record<string, unknown>, thoughts: Thought[]) {
  check(await ctx.supabase.rpc("record_action", { _garden: gardenId, _audit_type: type, _idea: ideaId as string, _payload: payload as never, _thoughts: thoughts as never }));
}

async function logEvent(ctx: Ctx, gardenId: string, type: Database["public"]["Tables"]["events"]["Insert"]["type"], ideaId: string | null, payload: Record<string, unknown>) {
  check(await ctx.supabase.from("events").insert({ garden_id: gardenId, actor: ctx.userId, actor_kind: "human", type, idea_id: ideaId, payload: payload as never }));
}

// ---------- import (shared by demo seed, new garden and Stam import) ----------
async function importStamInto(ctx: Ctx, obj: StamGarden, opts: { demo?: boolean } = {}) {
  const errs = validateGarden(obj?.nodes as never);
  if (errs.length) return { ok: false as const, errors: errs };
  const { supabase } = ctx;
  const garden = check(await supabase.from("gardens").insert({ title: obj.title || "Untitled garden", collected: obj.collected ?? "", is_demo: !!opts.demo, created_by: ctx.userId }).select("id").single());
  const people = [...new Set(obj.nodes.map((n) => n.by || "Unknown"))];
  const contribs = check(await supabase.from("contributors").insert(people.map((name, i) => ({
    garden_id: garden.id, name, color: nextColor(i),
    kind: opts.demo && (name === "ChatGPT" || name === "Claude") ? "historical_ai" : "person",
    user_id: opts.demo && name === "你" ? ctx.userId : null,
  }))).select("id,name"));
  const cBy = new Map(contribs.map((c) => [c.name, c.id]));
  const steps = Object.entries(obj.steps ?? {}).map(([k, title]) => ({ garden_id: garden.id, step: Number(k), title: String(title) })).filter((s) => s.step >= 1);
  if (steps.length) check(await supabase.from("steps").insert(steps));
  const ideas = check(await supabase.from("ideas").insert(obj.nodes.map((n, i) => ({
    garden_id: garden.id, key: n.id, label: n.label, note: n.note ?? "",
    contributor_id: cBy.get(n.by || "Unknown")!, step: Math.max(1, Math.round(Number(n.step) || 1)),
    status: n.status === "dormant" ? "dormant" : "growing", is_knot: !!n.knot, is_outcome: !!opts.demo && n.id === "humans", position: i, owner_user_id: ctx.userId,
  }))).select("id,key"));
  const iBy = new Map(ideas.map((i) => [i.key, i.id]));
  // insert primary links in root-to-leaf order so the cycle check walks a consistent chain
  const links = obj.nodes.flatMap((n) => n.parents.map((p, j) => ({ garden_id: garden.id, parent_id: iBy.get(p)!, child_id: iBy.get(n.id)!, kind: j === 0 ? "primary" : "merge", position: j })));
  if (links.length) check(await supabase.from("idea_links").insert(links));
  const focus = obj.focus && iBy.get(obj.focus);
  if (focus) check(await supabase.from("gardens").update({ focus_idea_id: focus }).eq("id", garden.id));
  await logEvent(ctx, garden.id, "imported", null, { nodes: obj.nodes.length, demo: !!opts.demo });
  check(await supabase.rpc("seed_thought_events", { _garden: garden.id, _by: ctx.userId }));
  return { ok: true as const, gardenId: garden.id, errors: [] as ValidationError[] };
}

export const ensureDemoGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const existing = check(await context.supabase.from("gardens").select("id").eq("is_demo", true).eq("created_by", context.userId).limit(1));
    if (existing.length) return { created: false };
    await importStamInto(context, { ...(sample as StamGarden), title: "The origin of Ramus" }, { demo: true });
    return { created: true };
  });

export const importGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { json: unknown }) => d)
  .handler(async ({ data, context }) => {
    const obj = data.json as StamGarden;
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.nodes))
      return { ok: false as const, errors: [{ idea: null, problem: "This is not Stam JSON: there is no nodes list.", fix: 'Paste an object like { "title": ..., "nodes": [...] }.' }] };
    return importStamInto(context, obj);
  });

export const createGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; rootLabel: string; rootNote: string; person: string }) => d)
  .handler(async ({ data, context }) => {
    const r = await importStamInto(context, {
      title: data.title.trim() || "Untitled garden", collected: new Date().toISOString().slice(0, 10),
      steps: { "1": "Start" },
      nodes: [{ id: "root", label: data.rootLabel.trim(), note: data.rootNote, by: data.person.trim() || "Me", step: 1, status: "growing", parents: [] }],
    });
    if (!r.ok) fail(r.errors.map(formatError).join("\n"));
    return { gardenId: r.gardenId };
  });

// ---------- reads ----------
export const listGardens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const gardens = check(await supabase.from("gardens").select("id,title,specimen_no,updated_at,is_demo").order("updated_at", { ascending: false }));
    const ids = gardens.map((g) => g.id);
    if (!ids.length) return [];
    const ideas = check(await supabase.from("ideas").select("garden_id,status,is_knot").in("garden_id", ids));
    const merges = check(await supabase.from("idea_links").select("garden_id").eq("kind", "merge").in("garden_id", ids));
    const people = check(await supabase.from("contributors").select("garden_id").in("garden_id", ids));
    return gardens.map((g) => {
      const gi = ideas.filter((i) => i.garden_id === g.id);
      return {
        ...g,
        ideas: gi.length, knots: gi.filter((i) => i.is_knot).length, dormant: gi.filter((i) => i.status === "dormant").length,
        merges: merges.filter((m) => m.garden_id === g.id).length, people: people.filter((p) => p.garden_id === g.id).length,
      };
    });
  });

export const getGarden = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const garden = check(await supabase.from("gardens").select("*").eq("id", data.id).maybeSingle());
    if (!garden) fail("This garden does not exist or you cannot see it.");
    const [contributors, steps, ideas, links, conversations] = await Promise.all([
      supabase.from("contributors").select("id,name,color,kind").eq("garden_id", data.id).order("created_at"),
      supabase.from("steps").select("step,title,date").eq("garden_id", data.id).order("step"),
      supabase.from("ideas").select("id,key,label,note,contributor_id,step,status,is_knot,is_outcome,settled,position").eq("garden_id", data.id).order("position"),
      supabase.from("idea_links").select("parent_id,child_id,kind,position,nature").eq("garden_id", data.id).order("position"),
      supabase.from("conversations").select("id,title,happened_at,source,imported_at").eq("garden_id", data.id).order("created_at"),
    ]).then((rs) => rs.map((r: any) => check(r)) as never as [any[], any[], any[], any[], any[]]);
    const convMessages = conversations.length ? check(await supabase.from("messages").select("id,conversation_id,content,contributor_id,sequence,sent_at,time_precision,imported_at").eq("garden_id", data.id).order("sequence")) : [];
    const evidence = check(await supabase.from("idea_evidence").select("id,idea_id,message_id,role,note").eq("garden_id", data.id));
    const thoughts = check(await supabase.from("thought_events").select("id,seq,type,idea_id,related_idea_id,settled_kind,person_id,occurred_at,time_precision,recorded_at,rationale,origin,confirmed,rejected_at,corrects_event_id").eq("garden_id", data.id).order("seq"));
    const thoughtEvidence = check(await supabase.from("thought_event_evidence").select("thought_event_id,message_id").eq("garden_id", data.id));
    return { viewerId: context.userId, garden, contributors, steps, ideas, links, conversations, convMessages, evidence, thoughts, thoughtEvidence };
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const conversation = check(await supabase.from("conversations").select("*").eq("id", data.id).eq("garden_id", data.gardenId).maybeSingle());
    if (!conversation) fail("This conversation does not exist or you cannot see it.");
    const messages = check(await supabase.from("messages").select("id,sequence,content,contributor_id,sent_at,time_precision,time_source,imported_at,parent_message_id,batch_id,raw_start,raw_end,speaker_label,offset_ms,hidden_reason").eq("conversation_id", data.id).order("sequence"));
    // originals can be megabytes: they are fetched one at a time by getBatchOriginal when someone opens them
    const batches = check(await supabase.from("intake_batches").select("id,accession_no,created_at,source_format,parser_version,report").eq("conversation_id", data.id).order("accession_no"));
    const contributors = check(await supabase.from("contributors").select("id,name,color").eq("garden_id", data.gardenId));
    const ids = messages.map((m) => m.id);
    const ev = ids.length ? check(await supabase.from("idea_evidence").select("message_id,role,idea_id").in("message_id", ids)) : [];
    const ideaRows = ev.length ? check(await supabase.from("ideas").select("id,key,label").in("id", [...new Set(ev.map((e) => e.idea_id))])) : [];
    const ib = new Map(ideaRows.map((i) => [i.id, i]));
    const ideas = ev.filter((e) => ib.has(e.idea_id)).map((e) => ({ message_id: e.message_id, role: e.role, key: ib.get(e.idea_id)!.key, label: ib.get(e.idea_id)!.label }));
    const garden = check(await supabase.from("gardens").select("id,title").eq("id", data.gardenId).single());
    return { conversation, messages, contributors, ideas, garden, batches };
  });

/** One batch original, as received (after any masking the person asked for). */
export const getBatchOriginal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; batchId: string }) => d)
  .handler(async ({ data, context }) => {
    const b = check(await context.supabase.from("intake_batches").select("id,raw_text").eq("id", data.batchId).eq("garden_id", data.gardenId).maybeSingle());
    if (!b) fail("This original does not exist or you cannot see it.");
    return { id: b.id, raw: b.raw_text };
  });

// ---------- writes (each validates, then writes and logs an event) ----------
async function ensureStep(ctx: Ctx, gardenId: string, step: number, newStep?: { title: string; date?: string | null | undefined } | undefined) {
  if (!newStep) return step;
  const existing = check(await ctx.supabase.from("steps").select("step").eq("garden_id", gardenId));
  const ideas = check(await ctx.supabase.from("ideas").select("step").eq("garden_id", gardenId));
  const next = Math.max(0, ...existing.map((s) => s.step), ...ideas.map((i) => i.step)) + 1;
  check(await ctx.supabase.from("steps").insert({ garden_id: gardenId, step: next, title: newStep.title.trim(), date: newStep.date || null }));
  return next;
}

async function ensurePerson(ctx: Ctx, gardenId: string, name: string) {
  const all = check(await ctx.supabase.from("contributors").select("id,name").eq("garden_id", gardenId));
  const hit = all.find((c) => c.name === name.trim());
  if (hit) return hit.id;
  return check(await ctx.supabase.from("contributors").insert({ garden_id: gardenId, name: name.trim(), color: nextColor(all.length), kind: "person" }).select("id").single()).id;
}

export const growBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; parentKey: string; label: string; note: string; contributorId?: string | undefined; newPerson?: string | undefined; step: number; newStep?: { title: string; date?: string | null } | undefined; messageId?: string | null | undefined; nature?: string | null | undefined }) => d)
  .handler(async ({ data, context }) => {
    const label = data.label.trim();
    if (!label) fail("Give the idea a label.");
    if ([...label].length > MAX_LABEL) fail(`The label is too long. Keep it to ${MAX_LABEL} characters; put the rest in the note.`);
    const g = await loadGraph(context.supabase, data.gardenId);
    const parent = g.byKey.get(data.parentKey) ?? fail("The parent idea is not in this garden.");
    const key = newKey();
    assertValid([...g.nodes, { id: key, label, parents: [parent.id] }]);
    const contributorId = data.newPerson?.trim() ? await ensurePerson(context, data.gardenId, data.newPerson) : data.contributorId ?? fail("Choose who said it.");
    const step = await ensureStep(context, data.gardenId, data.step, data.newStep);
    if (data.messageId) check(await context.supabase.from("messages").select("id").eq("id", data.messageId).eq("garden_id", data.gardenId).single());
    const idea = check(await context.supabase.from("ideas").insert({
      garden_id: data.gardenId, key, label, note: data.note, contributor_id: contributorId, step,
      position: g.nodes.length, owner_user_id: context.userId,
    }).select("id").single());
    check(await context.supabase.from("idea_links").insert({ garden_id: data.gardenId, parent_id: parent.dbId, child_id: idea.id, kind: "primary", nature: data.nature || null }));
    if (data.messageId) check(await context.supabase.from("idea_evidence").insert({ garden_id: data.gardenId, idea_id: idea.id, message_id: data.messageId, role: "origin", created_by: context.userId }));
    const msg = data.messageId ?? null;
    await record(context, data.gardenId, "idea_created", idea.id, { key, label, parent: parent.id, step, message_id: msg, nature: data.nature ?? null }, [
      { type: "raised", idea_id: idea.id, related_idea_id: parent.dbId, person_id: contributorId, message_id: msg },
      ...(data.nature === "refines" ? [{ type: "refined" as const, idea_id: idea.id, related_idea_id: parent.dbId, person_id: contributorId, message_id: msg }] : []),
    ]);
    return { key };
  });

export const graftMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; childKey: string; parentKey: string; nature?: string | null | undefined }) => d)
  .handler(async ({ data, context }) => {
    const g = await loadGraph(context.supabase, data.gardenId);
    const child = g.byKey.get(data.childKey) ?? fail("That idea is not in this garden.");
    const parent = g.byKey.get(data.parentKey) ?? fail("The idea to graft is not in this garden.");
    if (child.parents.includes(parent.id)) fail("These two ideas are already linked.");
    assertValid(g.nodes.map((n) => (n.id === child.id ? { ...n, parents: [...n.parents, parent.id] } : n)));
    check(await context.supabase.from("idea_links").insert({ garden_id: data.gardenId, parent_id: parent.dbId, child_id: child.dbId, kind: "merge", position: child.parents.length, nature: data.nature || "combines" }));
    await record(context, data.gardenId, "link_added", child.dbId, { kind: "merge", parent: parent.id, child: child.id }, [
      { type: "merged", idea_id: child.dbId, related_idea_id: parent.dbId, rationale: data.nature || "combines" },
    ]);
    return { ok: true };
  });

async function getIdea(ctx: Ctx, gardenId: string, key: string) {
  return check(await ctx.supabase.from("ideas").select("id,label,note,status,is_knot,settled").eq("garden_id", gardenId).eq("key", key).single());
}

export const setStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; status: "growing" | "dormant" }) => d)
  .handler(async ({ data, context }) => {
    const i = await getIdea(context, data.gardenId, data.key);
    assertValid((await loadGraph(context.supabase, data.gardenId)).nodes);
    check(await context.supabase.from("ideas").update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", i.id));
    await record(context, data.gardenId, "status_changed", i.id, { from: i.status, to: data.status },
      i.status === data.status ? [] : [{ type: data.status === "dormant" ? "rested" : "revived", idea_id: i.id }]);
    return { ok: true };
  });

export const setKnot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; settled: string; kind: "decision" | "result" | "ruled_out" | "conclusion" }) => d)
  .handler(async ({ data, context }) => {
    const settled = data.settled.trim() || fail("Say in one sentence what is now settled.");
    const i = await getIdea(context, data.gardenId, data.key);
    if (i.is_knot) fail("This idea is already a knot.");
    check(await context.supabase.from("ideas").update({ is_knot: true, settled, updated_at: new Date().toISOString() }).eq("id", i.id));
    if (!["decision", "result", "ruled_out", "conclusion"].includes(data.kind)) fail("Say what kind of knot this is.");
    await record(context, data.gardenId, "knot_set", i.id, { settled, kind: data.kind }, [{ type: "settled", idea_id: i.id, settled_kind: data.kind, rationale: settled }]);
    return { ok: true };
  });

export const reopenKnot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; reason: string }) => d)
  .handler(async ({ data, context }) => {
    const reason = data.reason.trim() || fail("Reopening a knot needs a reason.");
    const i = await getIdea(context, data.gardenId, data.key);
    if (!i.is_knot) fail("This idea is not a knot.");
    check(await context.supabase.from("ideas").update({ is_knot: false, updated_at: new Date().toISOString() }).eq("id", i.id));
    await record(context, data.gardenId, "knot_reopened", i.id, { reason, was_settled: i.settled }, [{ type: "reopened", idea_id: i.id, rationale: reason }]);
    return { ok: true };
  });

export const editIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; label: string; note: string }) => d)
  .handler(async ({ data, context }) => {
    const label = data.label.trim();
    const g = await loadGraph(context.supabase, data.gardenId);
    assertValid(g.nodes.map((n) => (n.id === data.key ? { ...n, label } : n)));
    const i = await getIdea(context, data.gardenId, data.key);
    check(await context.supabase.from("ideas").update({ label, note: data.note, updated_at: new Date().toISOString() }).eq("id", i.id));
    await logEvent(context, data.gardenId, "idea_edited", i.id, { before: { label: i.label, note: i.note }, after: { label, note: data.note } });
    return { ok: true };
  });

export const addEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; messageId: string; role: "origin" | "restated" | "supports" | "challenges"; note?: string | undefined }) => d)
  .handler(async ({ data, context }) => {
    const i = await getIdea(context, data.gardenId, data.key);
    check(await context.supabase.from("messages").select("id").eq("id", data.messageId).eq("garden_id", data.gardenId).single());
    const r = await context.supabase.from("idea_evidence").insert({ garden_id: data.gardenId, idea_id: i.id, message_id: data.messageId, role: data.role, note: data.note?.trim() || null, created_by: context.userId });
    if (r.error) fail(r.error.code === "23505" ? (data.role === "origin" ? "This idea already has an origin message." : "This message is already linked with that role.") : r.error.message);
    let related: string | null = null;
    if (data.role === "challenges") {
      const o = check(await context.supabase.from("idea_evidence").select("idea_id").eq("message_id", data.messageId).eq("role", "origin").neq("idea_id", i.id).limit(1));
      related = o[0]?.idea_id ?? null;
    }
    await record(context, data.gardenId, "link_added", i.id, { kind: "evidence", role: data.role, message_id: data.messageId },
      data.role === "challenges" ? [{ type: "challenged", idea_id: i.id, related_idea_id: related, message_id: data.messageId, rationale: data.note?.trim() || null }] : []);
    return { ok: true };
  });

export const reviewThought = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; confirm: boolean }) => d)
  .handler(async ({ data, context }) => {
    check(await context.supabase.rpc("review_thought_event", { _id: data.id, _confirm: data.confirm }));
    return { ok: true };
  });

export const setOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; outcome: boolean }) => {
    if (typeof d.outcome !== "boolean") fail("Choose whether this is an outcome.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const graph = await loadGraph(context.supabase, data.gardenId);
    assertValid(graph.nodes);
    const idea = graph.byKey.get(data.key) ?? fail("That idea is not in this garden.");
    check(await context.supabase.rpc("set_idea_outcome", { _garden: data.gardenId, _idea: idea.dbId, _outcome: data.outcome }));
    return { ok: true };
  });

// ---------- accession (intake) ----------
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES = 20000;
const SOURCE_OF: Record<Format, "meeting" | "chat" | "notes" | "other"> = {
  whatsapp: "chat", slack: "chat", chatgpt: "chat", claude: "chat", lines: "chat", transcript: "meeting", vtt: "meeting", srt: "meeting", notes: "notes",
};

async function intakeContext(supabase: DB, gardenId: string, userId: string) {
  const contributors = check(await supabase.from("contributors").select("id,name,color,kind,user_id").eq("garden_id", gardenId));
  const aliases = check(await supabase.from("speaker_aliases").select("alias,contributor_id").eq("garden_id", gardenId));
  const me = contributors.find((c) => c.user_id === userId);
  return { contributors, aliases, importerContributorId: me?.id ?? null };
}

export const getAccessionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string }) => d)
  .handler(async ({ data, context }) => {
    const garden = check(await context.supabase.from("gardens").select("id,title").eq("id", data.gardenId).maybeSingle());
    if (!garden) fail("This garden does not exist or you cannot see it.");
    const ctx = await intakeContext(context.supabase, data.gardenId, context.userId);
    const conversations = check(await context.supabase.from("conversations").select("id,title").eq("garden_id", data.gardenId).order("created_at"));
    // the importer's own name if they gave one; never derived from their email address, which other members would see
    const meta = (context.claims as { user_metadata?: { full_name?: string; name?: string } } | undefined)?.user_metadata;
    const importerName = (meta?.full_name || meta?.name || "").trim() || "Me";
    return { garden, ...ctx, importerName, conversations };
  });

/** Which existing conversations already keep some of these messages. */
export const checkOverlap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; externalIds: string[] }) => {
    if (!Array.isArray(d.externalIds) || d.externalIds.length > MAX_MESSAGES) fail("Too many messages.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const counts = new Map<string, number>();
    for (let i = 0; i < data.externalIds.length; i += 300) {
      const rows = check(await context.supabase.from("messages").select("conversation_id").eq("garden_id", data.gardenId).in("external_id", data.externalIds.slice(i, i + 300)));
      for (const r of rows) counts.set(r.conversation_id, (counts.get(r.conversation_id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([conversationId, kept]) => ({ conversationId, kept })).sort((a, b) => b.kept - a.kept);
  });

export const receiveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; conversationId: string | null; newConversation: { title: string; happenedAt: string | null } | null; input: PrepareInput; options: PrepareOptions; consent: boolean; originalFilePath: string | null }) => {
    if (d.consent !== true) fail("Confirm that everyone in this conversation agreed to have it recorded here.");
    const size = new TextEncoder().encode(d.input?.text ?? "").length + (d.input?.files ?? []).reduce((a, f) => a + f.text.length, 0);
    if (size > MAX_BYTES) fail("The original is larger than 5 MB.");
    if (!d.conversationId && !d.newConversation?.title?.trim()) fail("Give the conversation a title.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!check(await supabase.rpc("can_write_garden", { _garden: data.gardenId }))) fail("You cannot write to this garden.");
    const ctx = await intakeContext(supabase, data.gardenId, userId);
    // never trust prepared messages from the browser: prepare again from the original and the choices
    const draft = prepare(data.input, data.options, ctx);
    if (draft.kept.length > MAX_MESSAGES) fail("The original holds more than 20,000 messages.");
    if (!draft.kept.length) fail("Nothing to keep: no messages were found in the original.");
    const problems = checkDraft(draft);
    if (problems.length) fail(problems.join("\n"));
    if (data.options.mask && data.originalFilePath) fail("A masked original cannot keep its unmasked file.");
    if (data.originalFilePath && !data.originalFilePath.startsWith(data.gardenId + "/")) fail("The original file is not in this garden.");

    const voices = resolveVoices(draft, data.options);
    const ids = new Set(ctx.contributors.map((c) => c.id));
    const taken = new Set(ctx.contributors.map((c) => c.name));
    const people: { ref: string; name: string; kind: string }[] = [];
    const refOf = new Map<string, string | null>();
    let letter = 0;
    for (const [label, v] of voices) {
      if (v.type === "person") { if (!ids.has(v.id)) fail("A chosen person is not in this garden."); refOf.set(label, v.id); }
      else if (v.type === "none") refOf.set(label, null);
      else {
        let name = v.type === "new" ? v.name.trim() : "";
        if (v.type === "anon") { do name = `Voice ${String.fromCharCode(65 + letter++)}`; while (taken.has(name)); taken.add(name); }
        if (!name) fail(`Give a name for “${label}”.`);
        const ref = `new:${name}`;
        if (!people.some((p) => p.ref === ref)) people.push({ ref, name, kind: v.type === "new" && v.kind === "historical_ai" ? "historical_ai" : "person" });
        refOf.set(label, ref);
      }
    }
    const aliases = [...voices.entries()].filter(([label, v]) => (v.type === "person" || v.type === "new") && isRealName(label, draft.format) && !["chatgpt", "claude"].includes(draft.format))
      .map(([label]) => ({ alias: label, person: refOf.get(label) }));
    const messages = draft.kept.map((m) => ({
      person: refOf.get(m.speakerLabel ?? (draft.format === "notes" ? "" : "\u0000")) ?? null,
      content: m.content, sent_at: m.sentAt, precision: m.precision, time_source: m.timeSource, external_id: m.externalId, parent_external_id: m.parentExternalId,
      raw_start: m.rawStart, raw_end: m.rawEnd, speaker_label: m.speakerLabel, offset_ms: m.offsetMs, hidden: m.hidden,
    }));
    const r = check(await supabase.rpc("receive_batch", {
      _garden: data.gardenId,
      _conversation: data.conversationId as string,
      _new_conversation: data.newConversation ? { title: data.newConversation.title.trim(), happened_at: data.newConversation.happenedAt || "", source: SOURCE_OF[draft.format] } : {},
      _batch: { raw_text: draft.raw, source_format: draft.format, original_file: data.originalFilePath ?? "", parser_version: draft.report.parser, options: { ...data.options }, report: draft.report },
      _people: people, _aliases: aliases, _messages: messages,
    })) as { conversation_id: string; accession_no: number; added: number; already_kept: number };
    return { conversationId: r.conversation_id, accessionNo: r.accession_no, added: r.added, alreadyKept: r.already_kept, format: draft.format, voices: draft.speakers.length, messages: draft.kept.length };
  });
