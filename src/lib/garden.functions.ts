import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateGarden, formatError, MAX_LABEL } from "./stam/validate";
import type { StamGarden, ValidationError } from "./stam/types";
import { splitConversation } from "./stam/split";
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
    status: n.status === "dormant" ? "dormant" : "growing", is_knot: !!n.knot, position: i, owner_user_id: ctx.userId,
  }))).select("id,key"));
  const iBy = new Map(ideas.map((i) => [i.key, i.id]));
  // insert primary links in root-to-leaf order so the cycle check walks a consistent chain
  const links = obj.nodes.flatMap((n) => n.parents.map((p, j) => ({ garden_id: garden.id, parent_id: iBy.get(p)!, child_id: iBy.get(n.id)!, kind: j === 0 ? "primary" : "merge", position: j })));
  if (links.length) check(await supabase.from("idea_links").insert(links));
  const focus = obj.focus && iBy.get(obj.focus);
  if (focus) check(await supabase.from("gardens").update({ focus_idea_id: focus }).eq("id", garden.id));
  await logEvent(ctx, garden.id, "imported", null, { nodes: obj.nodes.length, demo: !!opts.demo });
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
      supabase.from("ideas").select("id,key,label,note,contributor_id,step,status,is_knot,settled,conversation_id,message_id,source_excerpt,position").eq("garden_id", data.id).order("position"),
      supabase.from("idea_links").select("parent_id,child_id,kind,position").eq("garden_id", data.id).order("position"),
      supabase.from("conversations").select("id,title,happened_at,source").eq("garden_id", data.id).order("created_at"),
    ]).then((rs) => rs.map((r: any) => check(r)) as never as [any[], any[], any[], any[], any[]]);
    const msgIds = ideas.map((i: any) => i.message_id).filter(Boolean);
    const messages = msgIds.length ? check(await supabase.from("messages").select("id,conversation_id,content,contributor_id,position").in("id", msgIds)) : [];
    const convMessages = conversations.length ? check(await supabase.from("messages").select("id,conversation_id,content,contributor_id,position").eq("garden_id", data.id).order("position")) : [];
    return { garden, contributors, steps, ideas, links, conversations, messages, convMessages };
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const conversation = check(await supabase.from("conversations").select("*").eq("id", data.id).eq("garden_id", data.gardenId).maybeSingle());
    if (!conversation) fail("This conversation does not exist or you cannot see it.");
    const messages = check(await supabase.from("messages").select("id,position,content,contributor_id,sent_at").eq("conversation_id", data.id).order("position"));
    const contributors = check(await supabase.from("contributors").select("id,name,color").eq("garden_id", data.gardenId));
    const ideas = check(await supabase.from("ideas").select("key,label,message_id").eq("conversation_id", data.id));
    const garden = check(await supabase.from("gardens").select("id,title").eq("id", data.gardenId).single());
    return { conversation, messages, contributors, ideas, garden };
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
  .inputValidator((d: { gardenId: string; parentKey: string; label: string; note: string; contributorId?: string | undefined; newPerson?: string | undefined; step: number; newStep?: { title: string; date?: string | null } | undefined; messageId?: string | null | undefined }) => d)
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
    let conversation_id: string | null = null, source_excerpt: string | null = null;
    if (data.messageId) {
      const m = check(await context.supabase.from("messages").select("conversation_id,content").eq("id", data.messageId).eq("garden_id", data.gardenId).single());
      conversation_id = m.conversation_id; source_excerpt = m.content;
    }
    const idea = check(await context.supabase.from("ideas").insert({
      garden_id: data.gardenId, key, label, note: data.note, contributor_id: contributorId, step,
      position: g.nodes.length, owner_user_id: context.userId, message_id: data.messageId || null, conversation_id, source_excerpt,
    }).select("id").single());
    check(await context.supabase.from("idea_links").insert({ garden_id: data.gardenId, parent_id: parent.dbId, child_id: idea.id, kind: "primary" }));
    await logEvent(context, data.gardenId, "idea_created", idea.id, { key, label, parent: parent.id, step, message_id: data.messageId ?? null });
    return { key };
  });

export const graftMerge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; childKey: string; parentKey: string }) => d)
  .handler(async ({ data, context }) => {
    const g = await loadGraph(context.supabase, data.gardenId);
    const child = g.byKey.get(data.childKey) ?? fail("That idea is not in this garden.");
    const parent = g.byKey.get(data.parentKey) ?? fail("The idea to graft is not in this garden.");
    if (child.parents.includes(parent.id)) fail("These two ideas are already linked.");
    assertValid(g.nodes.map((n) => (n.id === child.id ? { ...n, parents: [...n.parents, parent.id] } : n)));
    check(await context.supabase.from("idea_links").insert({ garden_id: data.gardenId, parent_id: parent.dbId, child_id: child.dbId, kind: "merge", position: child.parents.length }));
    await logEvent(context, data.gardenId, "link_added", child.dbId, { kind: "merge", parent: parent.id, child: child.id });
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
    await logEvent(context, data.gardenId, "status_changed", i.id, { from: i.status, to: data.status });
    return { ok: true };
  });

export const setKnot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; key: string; settled: string }) => d)
  .handler(async ({ data, context }) => {
    const settled = data.settled.trim() || fail("Say in one sentence what is now settled.");
    const i = await getIdea(context, data.gardenId, data.key);
    if (i.is_knot) fail("This idea is already a knot.");
    check(await context.supabase.from("ideas").update({ is_knot: true, settled, updated_at: new Date().toISOString() }).eq("id", i.id));
    await logEvent(context, data.gardenId, "knot_set", i.id, { settled });
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
    await logEvent(context, data.gardenId, "knot_reopened", i.id, { reason, was_settled: i.settled });
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

export const addConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { gardenId: string; title: string; date: string | null; source: "meeting" | "chat" | "notes" | "other"; text: string; consent: boolean; speakers: Record<string, string> }) => d)
  .handler(async ({ data, context }) => {
    if (data.consent !== true) fail("Confirm that everyone in this conversation agreed to have it recorded here.");
    if (!data.title.trim()) fail("Give the conversation a title.");
    if (!data.text.trim()) fail("Paste the conversation text.");
    const parts = splitConversation(data.text);
    const map = new Map<string, string>();
    for (const [speaker, target] of Object.entries(data.speakers)) {
      map.set(speaker, target.startsWith("new:") ? await ensurePerson(context, data.gardenId, target.slice(4) || speaker) : target);
    }
    const conv = check(await context.supabase.from("conversations").insert({
      garden_id: data.gardenId, title: data.title.trim(), happened_at: data.date || null, source: data.source, raw_text: data.text, consent_confirmed: true, created_by: context.userId,
    }).select("id").single());
    if (parts.length) check(await context.supabase.from("messages").insert(parts.map((p, i) => ({
      garden_id: data.gardenId, conversation_id: conv.id, position: i, content: p.content, contributor_id: p.speaker ? map.get(p.speaker) ?? null : null,
    }))));
    await logEvent(context, data.gardenId, "conversation_added", null, { conversation_id: conv.id, messages: parts.length });
    return { id: conv.id };
  });
