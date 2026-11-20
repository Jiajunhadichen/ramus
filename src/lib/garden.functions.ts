import { planters } from "@/lib/stam/people";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateGarden, formatError, MAX_LABEL } from "./stam/validate";
import type { StamGarden, ValidationError } from "./stam/types";
import { prepare, checkDraft, resolveVoices, isRealName, type PrepareInput, type PrepareOptions, type Format } from "./intake";
import { nextColor } from "./stam/palette";
import { brokenBroom, checkHarvest, crowdedRoot, harvestPrompt, parseAnswer, regrowNote, thoughtCandidatePrompt, checkThoughtCandidates } from "./gardener/harvest";
import { inTimeOrder, parts } from "./gardener/order";
import { askGardener, helperModels } from "./gardener/ai";
import { modelsToday, mayStartGrowth, partsToRead } from "./budget";
import type { UsageKind } from "./usage.server";
import { checkUnderstanding, deterministicReading, forGardener, needsUnderstanding, understandingPrompt, understandingSummary, type AttributionBasis, type SemanticNormalization } from "./intake/semantic";
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
    // someone who deleted the example garden forever does not get it planted again
    const meta = (context.claims as { user_metadata?: { ramus_demo_dismissed?: boolean } } | undefined)?.user_metadata;
    if (meta?.ramus_demo_dismissed) return { created: false };
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
  .inputValidator((d: { title: string; rootLabel: string; rootNote: string; person: string; asMe?: boolean | undefined }) => d)
  .handler(async ({ data, context }) => {
    // planted from conversations: the root starts as the importer's, and the importer is linked to their own person
    const by = data.asMe ? importerNameOf(context) : data.person.trim() || "Me";
    const r = await importStamInto(context, {
      title: data.title.trim() || "Untitled garden", collected: new Date().toISOString().slice(0, 10),
      steps: { "1": "Start" },
      nodes: [{ id: "root", label: data.rootLabel.trim(), note: data.rootNote, by, step: 1, status: "growing", parents: [] }],
    });
    if (!r.ok) fail(r.errors.map(formatError).join("\n"));
    if (data.asMe) check(await context.supabase.from("contributors").update({ user_id: context.userId }).eq("garden_id", r.gardenId).eq("name", by));
    return { gardenId: r.gardenId };
  });

// ---------- reads ----------
export const listGardens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // "*" so the list works before and after gardens.deleted_at exists (the trash)
    const gardens = (check(await supabase.from("gardens").select("*").order("updated_at", { ascending: false })) as { id: string; title: string; specimen_no: number; updated_at: string; is_demo: boolean; created_by: string; deleted_at?: string | null }[])
      .map((g) => ({ id: g.id, title: g.title, specimen_no: g.specimen_no, updated_at: g.updated_at, is_demo: g.is_demo, mine: g.created_by === context.userId, deleted_at: g.deleted_at ?? null }));
    const ids = gardens.map((g) => g.id);
    if (!ids.length) return [];
    // one batched query per table for every listed garden, never one per garden
    const [ideas, links, people] = await Promise.all([
      supabase.from("ideas").select("id,garden_id,label,status,is_knot,is_outcome,step,contributor_id").in("garden_id", ids).eq("confirmed", true).is("rejected_at", null).order("step"),
      supabase.from("idea_links").select("garden_id,parent_id,child_id,kind").in("garden_id", ids),
      supabase.from("contributors").select("id,color").in("garden_id", ids),
    ]).then((r) => r.map((x) => check(x as any)) as [any[], any[], any[]]);
    const color = new Map(people.map((p) => [p.id, p.color as string]));
    return gardens.map((g) => {
      const gi = ideas.filter((i) => i.garden_id === g.id);
      const live = new Set(gi.map((i) => i.id));
      const gl = links.filter((l) => l.garden_id === g.id && live.has(l.child_id) && live.has(l.parent_id));
      const tree = gi.map((i) => ({
        id: i.id as string, label: "", step: i.step as number, status: i.status as "growing" | "dormant", knot: !!i.is_knot, outcome: !!i.is_outcome,
        color: color.get(i.contributor_id) ?? "var(--muted-ink)",
        parents: [...gl.filter((l) => l.child_id === i.id && l.kind === "primary"), ...gl.filter((l) => l.child_id === i.id && l.kind === "merge")].map((l) => l.parent_id as string),
      }));
      const outcome = gi.find((i) => i.is_outcome);
      const root = gi.find((i) => !gl.some((l) => l.child_id === i.id && l.kind === "primary"));
      return {
        ...g,
        ideas: gi.length, knots: gi.filter((i) => i.is_knot).length, dormant: gi.filter((i) => i.status === "dormant").length,
        merges: gl.filter((l) => l.kind === "merge").length,
        // who planted the branches, not every speaker in the conversations
        people: planters(gi),
        line: (outcome ?? root)?.label as string | undefined ?? null,
        tree: g.deleted_at ? [] : tree,
      };
    });
  });

/** A name can always be changed by the people who write in the garden. */
export const renameGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; title: string }) => {
    if (!d.title.trim()) fail("A garden needs a name.");
    if (d.title.trim().length > 120) fail("Keep the name under 120 characters.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!check(await supabase.rpc("can_write_garden", { _garden: data.gardenId }))) fail("You cannot rename this garden.");
    check(await supabase.from("gardens").update({ title: data.title.trim(), updated_at: new Date().toISOString() }).eq("id", data.gardenId));
    return { ok: true };
  });

/** The database functions for the trash arrive with migration v2.5; until then say so plainly. */
const NEEDS_TRASH = "Deleting gardens needs one database update in Lovable first (v2.5).";
function missingFunction(e: { code?: string; message?: string } | null) {
  return !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist/i.test(e.message ?? ""));
}

/** Move a garden to the trash, or bring it back. Owners only; nothing is lost. */
export const trashGarden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; trash: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: { code?: string; message?: string } | null }>)("trash_garden", { _garden: data.gardenId, _trash: data.trash });
    if (missingFunction(error)) fail(NEEDS_TRASH);
    if (error) fail(error.message ?? "The garden could not be moved.");
    return { ok: true };
  });

/** Delete a garden in the trash forever: its tree, its conversations and their original files. Owners only. */
export const deleteGardenForever = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // the original files first, while the garden still says who owns them
    const bucket = supabase.storage.from("conversation-originals");
    for (let round = 0; round < 50; round++) {
      const { data: files } = await bucket.list(data.gardenId, { limit: 100 });
      const names = (files ?? []).filter((f) => f.name && f.id).map((f) => `${data.gardenId}/${f.name}`);
      if (!names.length) break;
      const { error } = await bucket.remove(names);
      if (error) break;
    }
    const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: { code?: string; message?: string } | null }>)("delete_garden_forever", { _garden: data.gardenId });
    if (missingFunction(error)) fail(NEEDS_TRASH);
    if (error) fail(error.message ?? "The garden could not be deleted.");
    return { ok: true };
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
      supabase.from("ideas").select("id,key,label,note,contributor_id,step,status,is_knot,is_outcome,settled,position,origin,confirmed").eq("garden_id", data.id).is("rejected_at", null).order("position"),
      supabase.from("idea_links").select("parent_id,child_id,kind,position,nature,rationale,origin,confirmed").eq("garden_id", data.id).order("position"),
      supabase.from("conversations").select("id,title,happened_at,source,imported_at").eq("garden_id", data.id).order("created_at"),
    ]).then((rs) => rs.map((r: any) => check(r)) as never as [any[], any[], any[], any[], any[]]);
    const convMessages = conversations.length ? check(await supabase.from("messages").select("id,conversation_id,content,contributor_id,sequence,sent_at,time_precision,imported_at").eq("garden_id", data.id).order("sequence")) : [];
    const evidence = check(await supabase.from("idea_evidence").select("id,idea_id,message_id,role,note").eq("garden_id", data.id));
    const thoughts = check(await supabase.from("thought_events").select("id,seq,type,idea_id,related_idea_id,settled_kind,person_id,occurred_at,time_precision,recorded_at,rationale,origin,confirmed,rejected_at,corrects_event_id").eq("garden_id", data.id).order("seq"));
    const thoughtEvidence = check(await supabase.from("thought_event_evidence").select("thought_event_id,message_id").eq("garden_id", data.id));
    // what the gardener proposed (rejected suggestions stay in the record, off the tree)
    const liveIds = new Set(ideas.map((i: { id: string }) => i.id));
    const liveLinks = links.filter((l: { parent_id: string; child_id: string }) => liveIds.has(l.parent_id) && liveIds.has(l.child_id));
    const proposed = check(await supabase.from("events").select("idea_id,payload").eq("garden_id", data.id).eq("actor_kind", "ai").eq("type", "idea_created"));
    const suggestions = Object.fromEntries(proposed.filter((e) => e.idea_id && liveIds.has(e.idea_id)).map((e) => [e.idea_id!, e.payload as { why?: string | null; quote?: string | null; knot?: { kind: string; settled: string } | null; conversation_id?: string; basis?: "stated" | "inferred"; attribution?: { basis: string; likely?: string | null } }]));
    // ideas whose author a person corrected after the gardener placed them
    const corrections = check(await supabase.from("events").select("idea_id,payload").eq("garden_id", data.id).eq("actor_kind", "human").eq("type", "idea_edited"));
    const correctedIdeaIds = [...new Set(corrections.filter((e) => e.idea_id && (e.payload as { attribution?: { basis?: string } } | null)?.attribution?.basis === "user_corrected").map((e) => e.idea_id!))];
    // which conversations the gardener has read, even where it found nothing to grow
    const readings = check(await supabase.from("events").select("idea_id,payload").eq("garden_id", data.id).eq("actor_kind", "ai").eq("type", "idea_edited"));
    const readConversationIds = [...new Set([
      ...proposed.map((e) => (e.payload as { conversation_id?: string } | null)?.conversation_id),
      ...readings.flatMap((e) => (e.payload as { read?: { conversation_ids?: string[] } } | null)?.read?.conversation_ids ?? []),
    ].filter((c): c is string => !!c))];
    // where the group went back to an earlier idea and grew again from it
    const keyOfId = new Map(ideas.map((i: { id: string; key: string }) => [i.id, i.key]));
    const returns = readings.flatMap((e) => {
      const r = (e.payload as { returned?: { why: string | null; step: number | null } } | null)?.returned;
      const key = e.idea_id ? keyOfId.get(e.idea_id) : undefined;
      return r && key ? [{ key, why: r.why ?? null, step: r.step ?? null }] : [];
    });
    return { viewerId: context.userId, garden, contributors, steps, ideas, links: liveLinks, conversations, convMessages, evidence, thoughts, thoughtEvidence, suggestions, readConversationIds, returns, correctedIdeaIds };
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

/**
 * Correct who an idea came from (or say no one is known). The branch colour follows the contributor, so the
 * tree, the legend, the Story and exports change together; the archive's messages stay as they were, and the
 * correction is logged with the previous attribution so it can be seen and undone.
 */
export const setIdeaContributor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; contributorId: string | null; newName?: string | null }) => {
    const newName = typeof d.newName === "string" ? d.newName.trim().slice(0, 60) : "";
    return { gardenId: d.gardenId, key: d.key, contributorId: typeof d.contributorId === "string" ? d.contributorId : null, newName: newName || null };
  })
  .handler(async ({ data, context }) => {
    const i = check(await context.supabase.from("ideas").select("id,contributor_id").eq("garden_id", data.gardenId).eq("key", data.key).single());
    let to: string | null = data.contributorId;
    if (data.newName) to = await ensurePerson(context, data.gardenId, data.newName);
    else if (to) {
      const c = check(await context.supabase.from("contributors").select("id").eq("garden_id", data.gardenId).eq("id", to).maybeSingle());
      if (!c) fail("That person is not in this garden.");
    }
    if (to === i.contributor_id) return { ok: true, changed: false };
    check(await context.supabase.from("ideas").update({ contributor_id: to, updated_at: new Date().toISOString() }).eq("id", i.id));
    await logEvent(context, data.gardenId, "idea_edited", i.id, { before: { contributor_id: i.contributor_id }, after: { contributor_id: to }, attribution: { basis: "user_corrected" } });
    return { ok: true, changed: true };
  });

/**
 * Correct a voice everywhere at once: rename it, or — when the new name is someone already in the garden —
 * move all of its ideas to that person. Colours follow; the archive's messages keep pointing where they did.
 */
export const renameContributor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; contributorId: string; name: string }) => {
    const name = typeof d.name === "string" ? d.name.trim().slice(0, 60) : "";
    if (!name) fail("Give a name.");
    return { gardenId: d.gardenId, contributorId: d.contributorId, name };
  })
  .handler(async ({ data, context }) => {
    const all = check(await context.supabase.from("contributors").select("id,name").eq("garden_id", data.gardenId));
    const me = all.find((c) => c.id === data.contributorId);
    if (!me) fail("That person is not in this garden.");
    const other = all.find((c) => c.id !== me.id && c.name.toLowerCase() === data.name.toLowerCase());
    if (!other) {
      check(await context.supabase.from("contributors").update({ name: data.name }).eq("id", me.id));
      await logEvent(context, data.gardenId, "idea_edited", null, { contributor_renamed: { id: me.id, before: me.name, after: data.name }, attribution: { basis: "user_corrected" } });
      return { renamed: true, merged: 0 };
    }
    const moved = check(await context.supabase.from("ideas").select("id").eq("garden_id", data.gardenId).eq("contributor_id", me.id));
    if (moved.length) check(await context.supabase.from("ideas").update({ contributor_id: other.id, updated_at: new Date().toISOString() }).eq("garden_id", data.gardenId).eq("contributor_id", me.id));
    for (const i of moved) await logEvent(context, data.gardenId, "idea_edited", i.id, { before: { contributor_id: me.id }, after: { contributor_id: other.id }, attribution: { basis: "user_corrected" } });
    return { renamed: false, merged: moved.length };
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
  whatsapp: "chat", slack: "chat", chatgpt: "chat", claude: "chat", lines: "chat", transcript: "meeting", vtt: "meeting", srt: "meeting", notes: "notes", discourse: "chat",
};

/** The importer's own name if they gave one; never derived from their email address, which other members would see. */
function importerNameOf(context: { claims?: unknown }): string {
  const meta = (context.claims as { user_metadata?: { full_name?: string; name?: string } } | undefined)?.user_metadata;
  return (meta?.full_name || meta?.name || "").trim() || "Me";
}

export const whoAmI = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ name: importerNameOf(context) }));

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
    return { garden, ...ctx, importerName: importerNameOf(context), conversations };
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
    })) as { conversation_id: string; batch_id: string; accession_no: number; added: number; already_kept: number };
    return { conversationId: r.conversation_id, batchId: r.batch_id, accessionNo: r.accession_no, added: r.added, alreadyKept: r.already_kept, format: draft.format, voices: draft.speakers.length, messages: draft.kept.length };
  });

// ---------- the gardener: harvest a conversation into suggested branches ----------

/** All rows of a query, a page at a time (the API returns at most 1000 rows per request). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await page(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

type ThoughtRow = Database["public"]["Tables"]["thought_events"]["Insert"];

/**
 * The gardener grows the tree from what was brought in: one or more batches (or whole conversations),
 * read as one stream in the order things were said, one part per call (the browser asks for the next part).
 * Branches go straight onto the tree, marked as placed by the gardener; their history is written at the
 * times the words were said, as the gardener's reading. People can take any branch off again.
 */
export const growTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; batchIds?: string[] | undefined; conversationIds?: string[] | undefined; part: number; nameRoot?: boolean | undefined; nameGarden?: boolean | undefined; resumeFrom?: string | null | undefined; told?: string | null | undefined }) => {
    if (d.told && d.told.length > 600) fail("Keep the note to the gardener under 600 characters.");
    const n = (d.batchIds?.length ?? 0) + (d.conversationIds?.length ?? 0);
    if (!n) fail("Nothing to read.");
    if (n > 50) fail("At most 50 conversations can be read together.");
    if (!Number.isInteger(d.part) || d.part < 0) fail("Which part to read is missing.");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!check(await supabase.rpc("can_write_garden", { _garden: data.gardenId }))) fail("You cannot write to this garden.");
    // the daily budget (src/lib/budget.ts): a growth is allowed once, before its first reading; every reading needs the site open
    const usage = await import("@/lib/usage.server");
    const guest = usage.isGuest(context.claims);
    const site = await usage.siteToday();
    const allowed = data.part === 0 ? mayStartGrowth(await usage.readerOf(userId, guest), site) : modelsToday(site);
    if (!allowed.ok) fail(allowed.reason);
    const models = allowed.models;
    const ask = async (kind: UsageKind, system: string, user: string, use: string[]) => {
      const r = await askGardener(system, user, { models: use });
      await usage.record({ userId, gardenId: data.gardenId, kind, guest, model: r.model, usage: r.usage });
      return r;
    };
    const garden = check(await supabase.from("gardens").select("id,title").eq("id", data.gardenId).single());
    const people = check(await supabase.from("contributors").select("id,name,kind,user_id").eq("garden_id", data.gardenId));
    const person = new Map(people.map((p) => [p.id, p]));

    // what to read: messages of the given batches (or conversations), each source in its own order
    const cols = "id,sequence,conversation_id,batch_id,contributor_id,speaker_label,content,sent_at,time_precision,hidden_reason";
    const sources = [...(data.batchIds ?? []).map((id) => ({ kind: "batch" as const, id })), ...(data.conversationIds ?? []).map((id) => ({ kind: "conversation" as const, id }))];
    const rows: (Awaited<ReturnType<typeof readSource>>[number] & { conversation: number })[] = [];
    async function readSource(src: (typeof sources)[number]) {
      return allRows((a, b) => supabase.from("messages").select(cols).eq("garden_id", data.gardenId).eq(src.kind === "batch" ? "batch_id" : "conversation_id", src.id).order("sequence").range(a, b));
    }
    for (const [i, src] of sources.entries()) rows.push(...(await readSource(src)).map((m) => ({ ...m, conversation: i })));
    const convIds = [...new Set(rows.map((m) => m.conversation_id))];
    const convs = convIds.length ? check(await supabase.from("conversations").select("id,title").in("id", convIds)) : [];
    const titleOf = new Map(convs.map((c) => [c.id, c.title]));
    const visible = rows.filter((m) => !m.hidden_reason && m.content.trim());
    if (!visible.length) fail("There are no words to read in what was brought in.");
    const stream = inTimeOrder(visible.map((m) => ({ ...m, sentAt: m.sent_at, precision: m.time_precision })));
    // Bounded chronological readings: smaller discussions no longer become one generic summary.
    // longer readings keep a discussion's lines together (the stronger model reads them first)
    // a growth reads at most a few readings (src/lib/budget.ts); the rest stays in the archive, unread
    const every = parts(stream, 40000, 24);
    const all = every.slice(0, partsToRead(guest, every.map((r) => stream.slice(r.from, r.to).reduce((n, m) => n + m.content.length, 0))));
    const unread = stream.length - (all.at(-1)?.to ?? 0);
    const range = all[data.part];
    if (!range) return { grown: 0, dropped: [], part: data.part, parts: all.length, unread, read: 0, model: null, root: null, understanding: null };
    const slice = stream.slice(range.from, range.to);

    // the tree as it stands, with when each idea's first words were said
    const ideaRows = await allRows((a, b) => supabase.from("ideas").select("id,key,label,note,contributor_id,status,is_knot,step,position,rejected_at").eq("garden_id", data.gardenId).order("position").range(a, b));
    const linkRows = await allRows((a, b) => supabase.from("idea_links").select("parent_id,child_id,kind,position").eq("garden_id", data.gardenId).order("position").range(a, b));
    const stepRows = check(await supabase.from("steps").select("step").eq("garden_id", data.gardenId));
    const live = ideaRows.filter((i) => !i.rejected_at);
    const liveIds = new Set(live.map((i) => i.id));
    const keyOf = new Map(ideaRows.map((i) => [i.id, i.key]));
    const originTimes = await originTimesOf(supabase, data.gardenId);
    const parentsOf = (id: string) => linkRows.filter((l) => l.child_id === id && liveIds.has(l.parent_id)).sort((x, y) => (x.kind === "primary" ? -1 : y.kind === "primary" ? 1 : x.position - y.position)).map((l) => keyOf.get(l.parent_id)!);
    const ideas = live.map((i) => ({ key: i.key, label: i.label, note: i.note, by: person.get(i.contributor_id ?? "")?.name ?? "Unknown", parents: parentsOf(i.id), status: i.status, knot: i.is_knot, at: originTimes.get(i.id) ?? null }));
    const root = ideas.find((i) => !i.parents.length) ?? fail("This garden has no root to grow from.");
    const rootRow = live.find((i) => i.key === root.key)!;
    const nameRoot = !!data.nameRoot && data.part === 0 && live.length === 1;

    const titles = [...new Set(convIds.map((c) => titleOf.get(c)).filter(Boolean))];
    // how each source was read, and who the person said speaks in it (optional, restrictive only)
    const batchIdsRead = [...new Set(slice.map((m) => m.batch_id).filter((x): x is string => !!x))];
    const batches = batchIdsRead.length ? check(await supabase.from("intake_batches").select("id,source_format,options").in("id", batchIdsRead)) : [];
    const formatOf = new Map(batches.map((b) => [b.id, b.source_format]));
    // turns reconstructed from loose text are named only by the person (their context or confirmation)
    const rebuiltBatch = new Map(batches.flatMap((b) => {
      const r = (b.options as { reconstruction?: { voices?: { name?: unknown; basis?: unknown }[] } } | null)?.reconstruction;
      if (!r) return [];
      const voices = new Map((r.voices ?? []).filter((v) => typeof v.name === "string").map((v) => [String(v.name).toLowerCase(), String(v.basis ?? "")]));
      return [[b.id, voices] as const];
    }));
    const knownVoices = [...new Set(batches.flatMap((b) => {
      const v = (b.options as { knownVoices?: unknown } | null)?.knownVoices;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
    }))];
    const TRUSTED = new Set(["whatsapp", "chatgpt", "claude", "slack", "discourse", "vtt", "srt"]);
    const basisOf = (m: (typeof slice)[number]): AttributionBasis => {
      if (!m.contributor_id) return "unknown";
      const f = m.batch_id ? formatOf.get(m.batch_id) : undefined;
      const rebuilt = m.batch_id ? rebuiltBatch.get(m.batch_id) : undefined;
      // reconstructed turns: named by the person (context, confirmation), or read from the words (inferred)
      if (rebuilt) return rebuilt.get((m.speaker_label ?? "").toLowerCase()) === "inferred" ? "inferred" : "user_supplied";
      return f === "notes" ? "user_supplied" : f && TRUSTED.has(f) ? "source_metadata" : "explicit_header";
    };
    const heard = slice.map((m, i) => {
      const p = m.contributor_id ? person.get(m.contributor_id) : undefined;
      return { ref: `m${i + 1}`, id: m.id, speaker: p?.name ?? m.speaker_label ?? null, personId: p?.id ?? null, personIsHuman: p?.kind === "person", sentAt: m.time_precision !== "unknown" ? m.sent_at : null, content: m.content, source: titleOf.get(m.conversation_id) ?? null };
    });
    // loose material (notes, copied pages, unlabeled chats) is first read for its structure; exports and timed chats are trusted as they are
    const semanticInput = { messages: heard.map((m, i) => ({ ref: m.ref, id: m.id, content: m.content, speaker: m.personId ? m.speaker : null, basis: basisOf(slice[i]!), sentAt: m.sentAt })), knownVoices, title: titles.join("; ") };
    const loose = needsUnderstanding(slice.map((m) => (m.batch_id ? formatOf.get(m.batch_id) ?? "notes" : "notes")), semanticInput.messages);
    let reading: SemanticNormalization = deterministicReading(semanticInput);
    if (loose) {
      const u = understandingPrompt(semanticInput);
      // if the structure reading fails, the words are read as they are: nothing brought in is lost
      reading = await ask("structure", u.system, u.user, helperModels(models))
        .then((r) => checkUnderstanding(parseAnswer(r.text), semanticInput, r.model))
        .catch(() => deterministicReading(semanticInput, ["The structure reading was not available; the words were read as they are."]));
    }
    const messages = (loose ? forGardener(heard, reading).messages : heard).map((m, i) => ({ ...m, ref: `m${i + 1}` }));
    const likelyOf = new Map(reading.passages.filter((p) => p.likely).map((p) => [p.messageId, p.likely!]));
    const understanding = understandingSummary(reading);
    // where the people say it picks up again, and what they told the gardener (first part only)
    const resumeFrom = data.part === 0 && data.resumeFrom && live.some((i) => i.key === data.resumeFrom) ? data.resumeFrom : null;
    const input = { gardenTitle: garden.title, conversationTitle: titles.join("; "), rootKey: root.key, ideas, messages, skipped: 0, part: { n: data.part + 1, of: all.length }, nameRoot, resumeFrom, told: data.part === 0 ? data.told ?? null : null };

    // Pass 1 independently inventories exact-quote-grounded statements.
    // If inventory extraction fails, the original reading still runs (no loss of imports).
    const inventory = thoughtCandidatePrompt(input);
    const candidates = await ask("inventory", inventory.system, inventory.user, helperModels(models))
      .then(r => checkThoughtCandidates(parseAnswer(r.text), input)).catch(() => []);
    // Pass 2 reconstructs links, proposals, objections and outcomes from the actual words.
    const prompt = harvestPrompt({ ...input, candidates });
    let asked = await ask("harvest", prompt.system, prompt.user, models).catch((e) => fail((e as Error).message));
    let harvested = checkHarvest(parseAnswer(asked.text), { ...input, candidates });
    // a broom is kept when it is real divergence; only when the reading lost structure the discussion had (ideas raised
    // across many turns, marked as continuing something, or answering an agenda item that is missing) is it read once more,
    // and the second answer is kept only if it is less crowded and keeps nearly every idea (conservative)
    const broom = brokenBroom(harvested.proposals, { ...input, candidates });
    if (broom.reasons.length) {
      const again = await ask("regrow", prompt.system, prompt.user + regrowNote(broom.crowd, broom.reasons), models).catch(() => null);
      if (again) {
        const second = checkHarvest(parseAnswer(again.text), { ...input, candidates });
        if (crowdedRoot(second.proposals, root.key).length < broom.crowd.length && second.proposals.length >= Math.ceil(harvested.proposals.length * 0.9)) { asked = again; harvested = second; }
      }
    }
    const { proposals, stages, dropped, root: rootName, returns, reactions } = harvested;
    // words with no author whose voice the reading is reasonably sure of: the idea is credited to that person,
    // marked inferred, and the person can change it (setIdeaContributor). "Me" is whoever brought the words in.
    const inferredBy = new Map<string, string>();
    for (const p of proposals) {
      if (p.personId) continue;
      const likely = likelyOf.get(p.originMessageId);
      if (!likely) continue;
      const hit = likely === "Me" ? people.find((c) => c.user_id === userId) : people.find((c) => c.name.toLowerCase() === likely.toLowerCase());
      if (hit) { p.personId = hit.id; inferredBy.set(p.temp, likely); }
    }
    const sentOf = new Map(slice.map((m) => [m.id, m.time_precision !== "unknown" ? { at: m.sent_at, precision: m.time_precision } : null]));
    const orderOf = new Map(slice.map((m, i) => [m.id, i]));
    const speakerOf = new Map(slice.map((m) => [m.id, m.contributor_id]));
    const thoughtFor = (t: Omit<ThoughtRow, "garden_id" | "origin" | "confirmed" | "recorded_by" | "occurred_at" | "time_precision">, messageId: string | null) => {
      const when = messageId ? sentOf.get(messageId) : null;
      return { row: { ...t, garden_id: data.gardenId, origin: "ai", confirmed: false, recorded_by: userId, occurred_at: when?.at ?? null, time_precision: when?.precision ?? "unknown" } as ThoughtRow, messageId, order: messageId ? orderOf.get(messageId) ?? 1e9 : 1e9 };
    };
    const thoughts: ReturnType<typeof thoughtFor>[] = [];

    // Replies in this batch can support or challenge existing ideas without producing
    // fake child branches. Keep the evidence tied to its actual source message.
    const existingByKey = new Map(live.map(i => [i.key, i.id]));
    if (reactions.length) {
      // the same message may already rest on that idea in that role (unique); skip those rows
      const ids = [...new Set(reactions.map((r) => existingByKey.get(r.key)).filter((x): x is string => !!x))];
      const had = new Set(check(await supabase.from("idea_evidence").select("idea_id,message_id,role").in("idea_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])).map((e) => `${e.idea_id}|${e.message_id}|${e.role}`));
      const fresh = reactions.filter((r) => { const id = existingByKey.get(r.key); return id && !had.has(`${id}|${r.messageId}|${r.role}`); });
      if (fresh.length) check(await supabase.from("idea_evidence").insert(fresh.flatMap(r => {
        const id = existingByKey.get(r.key);
        return id ? [{ garden_id: data.gardenId, idea_id: id, message_id: r.messageId,
          role: r.role, note: null, created_by: userId }] : [];
      })));
      for (const r of fresh.filter(r => r.role === "challenges")) {
        const id = existingByKey.get(r.key);
        if (id) thoughts.push(thoughtFor({ type: "challenged", idea_id: id,
          person_id: speakerOf.get(r.messageId) ?? null,
          rationale: "The reply challenged an existing idea." }, r.messageId));
      }
    }

    // a new garden's root, named from the conversation
    if (rootName) {
      // the question belongs to whoever first raised it in the words, or to no one known; never to the importer by default
      check(await supabase.from("ideas").update({ label: rootName.label, note: rootName.note, ...(rootName.originMessageId ? { contributor_id: rootName.personId ?? null } : {}), updated_at: new Date().toISOString() }).eq("id", rootRow.id));
      if (rootName.originMessageId) {
        check(await supabase.from("idea_evidence").insert({ garden_id: data.gardenId, idea_id: rootRow.id, message_id: rootName.originMessageId, role: "origin", note: null, created_by: userId }));
        const seeded = check(await supabase.from("thought_events").select("id").eq("idea_id", rootRow.id).eq("type", "raised").order("seq").limit(1)).at(0);
        thoughts.push(thoughtFor({ type: "raised", idea_id: rootRow.id, person_id: rootName.personId, corrects_event_id: seeded?.id ?? null, rationale: "The gardener found where it was first raised." }, rootName.originMessageId));
      }
      // a garden planted from pasted words has only a placeholder name; it takes the root's
      if (data.nameGarden) check(await supabase.from("gardens").update({ title: rootName.label }).eq("id", data.gardenId));
      check(await supabase.from("events").insert({ garden_id: data.gardenId, actor: userId, actor_kind: "ai", type: "idea_edited", idea_id: rootRow.id, payload: { named_root: true, was: rootRow.label, label: rootName.label, model: asked.model } as never }));
    }
    // going back: the history says where the group returned to and why; what it left behind rests
    const base = Math.max(0, ...stepRows.map((s) => s.step), ...ideaRows.map((i) => i.step));
    const stepOf = new Map(stages.map((s, i) => [s.n, base + i + 1]));
    // the step where growth starts again from the point gone back to
    const stepOfReturn = (to: string) => Math.min(...proposals.filter((p) => p.parent === to && !p.parentIsNew).map((p) => stepOf.get(p.stage) ?? base + 1), Infinity);
    for (const r of returns) {
      const toRow = live.find((i) => i.key === r.to);
      if (!toRow) continue;
      thoughts.push(thoughtFor({ type: "revived", idea_id: toRow.id, person_id: r.personId, rationale: r.why }, r.messageId));
      for (const k of r.setAside) {
        const row = live.find((i) => i.key === k);
        if (!row || row.status === "dormant") continue;
        check(await supabase.from("ideas").update({ status: "dormant", updated_at: new Date().toISOString() }).eq("id", row.id));
        thoughts.push(thoughtFor({ type: "rested", idea_id: row.id, person_id: r.personId, rationale: r.why ?? `Set aside when the group went back to “${toRow.label}”.` }, r.messageId));
      }
      check(await supabase.from("events").insert({ garden_id: data.gardenId, actor: userId, actor_kind: "ai", type: "idea_edited", idea_id: toRow.id,
        payload: { returned: { why: r.why, step: Number.isFinite(stepOfReturn(r.to)) ? stepOfReturn(r.to) : stages.length ? base + 1 : null, message_id: r.messageId, set_aside: r.setAside, told: input.told }, model: asked.model } as never }));
    }

    if (!proposals.length) {
      await writeThoughts(supabase, thoughts);
      await noteReading();
      if (data.part === 0) await usage.record({ userId, gardenId: data.gardenId, kind: "tree", guest });
      return { grown: 0, dropped, part: data.part, parts: all.length, unread, read: slice.length, model: asked.model, root: rootName?.label ?? null, understanding };
    }

    // keys and steps
    const key = new Map(proposals.map((p) => [p.temp, newKey()]));
    const keyFor = (t: string, isNew: boolean) => (isNew ? key.get(t)! : t);
    const g = await loadGraph(supabase, data.gardenId);
    assertValid([...g.nodes, ...proposals.map((p) => ({ id: key.get(p.temp)!, label: p.label, parents: [keyFor(p.parent, p.parentIsNew), ...p.merges.map((m) => keyFor(m.target, m.isNew))] }))]);
    const stageDate = (n: number) => proposals.filter((p) => p.stage === n).map((p) => sentOf.get(p.originMessageId)?.at).filter((t): t is string => !!t).sort()[0]?.slice(0, 10) ?? null;
    if (stages.length) check(await supabase.from("steps").insert(stages.map((s) => ({ garden_id: data.gardenId, step: stepOf.get(s.n)!, title: s.title, date: stageDate(s.n) }))));

    const inserted = check(await supabase.from("ideas").insert(proposals.map((p, i) => ({
      garden_id: data.gardenId, key: key.get(p.temp)!, label: p.label, note: p.note, contributor_id: p.personId,
      step: stepOf.get(p.stage) ?? base + 1, status: p.status, is_knot: !!p.knot, settled: p.knot?.settled ?? null,
      origin: "ai" as const, confirmed: true, position: ideaRows.length + i, owner_user_id: userId,
    }))).select("id,key"));
    const idOf = new Map([...g.nodes.map((n) => [n.id, n.dbId] as const), ...inserted.map((r) => [r.key, r.id] as const)]);
    const dbOf = (p: (typeof proposals)[number]) => idOf.get(key.get(p.temp)!)!;
    check(await supabase.from("idea_links").insert(proposals.flatMap((p) => [
      { garden_id: data.gardenId, parent_id: idOf.get(keyFor(p.parent, p.parentIsNew))!, child_id: dbOf(p), kind: "primary" as const, nature: p.nature, rationale: p.why, origin: "ai" as const, confirmed: true, position: 0 },
      ...p.merges.map((m, j) => ({ garden_id: data.gardenId, parent_id: idOf.get(keyFor(m.target, m.isNew))!, child_id: dbOf(p), kind: "merge" as const, nature: "combines", rationale: m.why, origin: "ai" as const, confirmed: true, position: j + 1 })),
    ])));
    check(await supabase.from("idea_evidence").insert(proposals.flatMap((p) => [
      { garden_id: data.gardenId, idea_id: dbOf(p), message_id: p.originMessageId, role: "origin" as const, note: p.quote ? `“${p.quote}”` : null, created_by: userId },
      ...p.evidence.map((e) => ({ garden_id: data.gardenId, idea_id: dbOf(p), message_id: e.messageId, role: e.role, note: null, created_by: userId })),
    ])));
    // the audit log: the gardener placed these, at whose request, and why
    check(await supabase.from("events").insert(proposals.map((p) => ({
      garden_id: data.gardenId, actor: userId, actor_kind: "ai" as const, type: "idea_created" as const, idea_id: dbOf(p),
      payload: {
        placed_by_gardener: true, conversation_id: slice.find((m) => m.id === p.originMessageId)?.conversation_id ?? null, label: p.label, why: p.why, basis: p.basis, quote: p.quote, knot: p.knot, model: asked.model,
        // who said it, and how Ramus knows: a probable voice is recorded as a hint, never as the author
        attribution: inferredBy.has(p.temp) ? { basis: "inferred", likely: inferredBy.get(p.temp)! } : p.personId ? { basis: basisOf(slice.find((m) => m.id === p.originMessageId)!) } : { basis: "unknown", likely: likelyOf.get(p.originMessageId) ?? null },
        understanding: { version: reading.version, model: reading.model, fallback: reading.fallback, source_kind: reading.sourceKind },
      } as never,
    }))));
    // the discussion history, at the times the words were said
    for (const p of proposals) {
      const id = dbOf(p), parent = idOf.get(keyFor(p.parent, p.parentIsNew))!;
      thoughts.push(thoughtFor({ type: "raised", idea_id: id, related_idea_id: parent, person_id: p.personId }, p.originMessageId));
      if (p.nature === "refines") thoughts.push(thoughtFor({ type: "refined", idea_id: id, related_idea_id: parent, person_id: p.personId }, p.originMessageId));
      for (const m of p.merges) thoughts.push(thoughtFor({ type: "merged", idea_id: id, related_idea_id: idOf.get(keyFor(m.target, m.isNew))!, person_id: p.personId, rationale: m.why }, p.originMessageId));
      for (const e of p.evidence.filter((x) => x.role === "challenges")) thoughts.push(thoughtFor({ type: "challenged", idea_id: id, person_id: speakerOf.get(e.messageId) ?? null }, e.messageId));
      if (p.knot) thoughts.push(thoughtFor({ type: "settled", idea_id: id, settled_kind: p.knot.kind, rationale: p.knot.settled, person_id: p.knot.messageId ? speakerOf.get(p.knot.messageId) ?? null : null }, p.knot.messageId));
      if (p.status === "dormant") thoughts.push(thoughtFor({ type: "rested", idea_id: id }, null));
    }
    await writeThoughts(supabase, thoughts);
    await noteReading();
    // a growth counts once its first reading has grown (a failed first reading does not use up the day)
    if (data.part === 0) await usage.record({ userId, gardenId: data.gardenId, kind: "tree", guest });
    return { grown: proposals.length, dropped, part: data.part, parts: all.length, unread, read: slice.length, model: asked.model, root: rootName?.label ?? null, understanding };

    /** After the last part: the audit log says what the gardener read, so it is not offered again. */
    async function noteReading() {
      if (data.part !== all.length - 1) return;
      check(await supabase.from("events").insert({ garden_id: data.gardenId, actor: userId, actor_kind: "ai", type: "idea_edited", idea_id: rootRow.id, payload: { read: { conversation_ids: convIds, batch_ids: data.batchIds ?? [], parts: all.length, model: asked.model, understanding } } as never }));
    }
  });

/** When each idea's first words were said (from its origin evidence), where the time is known. */
async function originTimesOf(supabase: DB, gardenId: string): Promise<Map<string, string>> {
  const ev = await allRows((a, b) => supabase.from("idea_evidence").select("idea_id,message_id").eq("garden_id", gardenId).eq("role", "origin").range(a, b));
  const out = new Map<string, string>();
  for (let i = 0; i < ev.length; i += 300) {
    const chunk = ev.slice(i, i + 300);
    const ms = check(await supabase.from("messages").select("id,sent_at,time_precision").in("id", chunk.map((e) => e.message_id)));
    const at = new Map(ms.filter((m) => m.sent_at && m.time_precision !== "unknown").map((m) => [m.id, m.sent_at!]));
    for (const e of chunk) { const t = at.get(e.message_id); if (t) out.set(e.idea_id, t); }
  }
  return out;
}

/** Thought events in the order things were said, each with the message it rests on. */
async function writeThoughts(supabase: DB, thoughts: { row: ThoughtRow; messageId: string | null; order: number }[]) {
  if (!thoughts.length) return;
  const sorted = [...thoughts].sort((a, b) => a.order - b.order);
  const ids = check(await supabase.from("thought_events").insert(sorted.map((t) => t.row)).select("id,idea_id,type"));
  const evidence = sorted.flatMap((t, i) => {
    const r = ids[i];
    return r && t.messageId && r.idea_id === t.row.idea_id && r.type === t.row.type ? [{ thought_event_id: r.id, message_id: t.messageId, garden_id: t.row.garden_id }] : [];
  });
  if (evidence.length) check(await supabase.from("thought_event_evidence").insert(evidence));
}

type SuggestionGraph = {
  ideas: { id: string; key: string; confirmed: boolean; rejected_at: string | null; contributor_id: string | null; origin: string }[];
  links: { parent_id: string; child_id: string; kind: string; confirmed: boolean; origin: string }[];
};
async function suggestionGraph(supabase: DB, gardenId: string): Promise<SuggestionGraph> {
  const ideas = await allRows((a, b) => supabase.from("ideas").select("id,key,confirmed,rejected_at,contributor_id,origin,position").eq("garden_id", gardenId).order("position").range(a, b));
  const links = await allRows((a, b) => supabase.from("idea_links").select("parent_id,child_id,kind,confirmed,origin").eq("garden_id", gardenId).range(a, b));
  return { ideas, links };
}

/** Accept one suggestion, and first any suggested ideas it grows from: people decide, the history records them. */
async function acceptSuggestion(ctx: Ctx, gardenId: string, g: SuggestionGraph, ideaId: string, seen = new Set<string>()) {
  const idea = g.ideas.find((i) => i.id === ideaId);
  if (!idea || idea.confirmed || idea.rejected_at || seen.has(ideaId)) return 0;
  seen.add(ideaId);
  let n = 0;
  const parents = g.links.filter((l) => l.child_id === ideaId);
  for (const l of parents) n += await acceptSuggestion(ctx, gardenId, g, l.parent_id, seen);
  check(await ctx.supabase.from("ideas").update({ confirmed: true, updated_at: new Date().toISOString() }).eq("id", ideaId));
  check(await ctx.supabase.from("idea_links").update({ confirmed: true }).eq("child_id", ideaId).eq("origin", "ai"));
  idea.confirmed = true;
  const origin = check(await ctx.supabase.from("idea_evidence").select("message_id").eq("idea_id", ideaId).eq("role", "origin").maybeSingle());
  const primary = parents.find((l) => l.kind === "primary");
  await record(ctx, gardenId, "idea_created", ideaId, { accepted_suggestion: true, key: idea.key }, [
    { type: "raised", idea_id: ideaId, related_idea_id: primary?.parent_id ?? null, person_id: idea.contributor_id, message_id: origin?.message_id ?? null },
    ...parents.filter((l) => l.kind === "merge").map((l) => ({ type: "merged" as const, idea_id: ideaId, related_idea_id: l.parent_id, rationale: "combines" })),
  ]);
  return n + 1;
}

/**
 * Take a branch the gardener placed off the tree, with the gardener's branches that grow from it.
 * They stay in the record; their history is marked rejected. Refused when people grew their own branches from it.
 */
async function rejectSuggestion(ctx: Ctx, gardenId: string, g: SuggestionGraph, ideaId: string) {
  const out = new Set<string>([ideaId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const l of g.links) if (out.has(l.parent_id) && !out.has(l.child_id)) {
      const child = g.ideas.find((i) => i.id === l.child_id);
      if (!child || child.rejected_at) continue;
      if (child.origin !== "ai") fail("People have grown their own branches from this one, so it stays. Let it rest instead.");
      out.add(child.id); grew = true;
    }
  }
  const now = new Date().toISOString();
  check(await ctx.supabase.from("ideas").update({ rejected_at: now, updated_at: now }).in("id", [...out]).eq("origin", "ai"));
  for (const i of g.ideas) if (out.has(i.id)) i.rejected_at = now;
  const open = check(await ctx.supabase.from("thought_events").select("id").in("idea_id", [...out]).eq("origin", "ai").eq("confirmed", false).is("rejected_at", null));
  for (const t of open) check(await ctx.supabase.rpc("review_thought_event", { _id: t.id, _confirm: false }));
  await logEvent(ctx, gardenId, "idea_edited", ideaId, { taken_off: true, with_descendants: out.size - 1 });
  return out.size;
}

export const reviewSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; accept: boolean }) => d)
  .handler(async ({ data, context }) => {
    const g = await suggestionGraph(context.supabase, data.gardenId);
    const idea = g.ideas.find((i) => i.key === data.key) ?? fail("That idea is not in this garden.");
    if (idea.rejected_at) fail("This branch is already off the tree.");
    if (data.accept && idea.confirmed) fail("This branch is already on the tree.");
    if (!data.accept && idea.origin !== "ai") fail("Only branches the gardener placed can be taken off.");
    const n = data.accept ? await acceptSuggestion(context, data.gardenId, g, idea.id) : await rejectSuggestion(context, data.gardenId, g, idea.id);
    return { decided: n };
  });

export const reviewAllSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; accept: boolean }) => d)
  .handler(async ({ data, context }) => {
    const g = await suggestionGraph(context.supabase, data.gardenId);
    let n = 0;
    for (const i of g.ideas) {
      if (i.confirmed || i.rejected_at) continue;
      n += data.accept ? await acceptSuggestion(context, data.gardenId, g, i.id) : await rejectSuggestion(context, data.gardenId, g, i.id);
    }
    return { decided: n };
  });
