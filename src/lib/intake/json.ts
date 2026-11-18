import type { ConversationChoice } from "./types";
import type { Unit } from "./text";
import { hash } from "./util";
import { completeness, isTopic, topicMessages } from "./discourse";

type Any = any; // source exports are untyped JSON
export type JsonSource = {
  format: "chatgpt" | "claude" | "slack" | "discourse";
  /** what the source says is missing */
  warnings?: string[];
  conversations: ConversationChoice[];
  /** the chosen conversations, as received */
  pick: (ids: string[]) => Any[];
  build: (chosen: Any[]) => { units: Unit[]; otherBranches: number; received: { role: string; text: string }[]; title: string | null };
};

const iso = (secs: unknown) => (typeof secs === "number" && Number.isFinite(secs) ? new Date(Math.round(secs * 1000)).toISOString() : null);
const isoStr = (s: unknown) => (typeof s === "string" && !Number.isNaN(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : null);
const unit = (label: string | null, content: string, sentAt: string | null, externalId: string, parent: string | null, hidden: Unit["hidden"]): Unit => ({
  speakerLabel: label, content, rawStart: null, rawEnd: null, bodyStart: null, sentAt, precision: sentAt ? "second" : "unknown",
  timeSource: sentAt ? "source_export" : "none", offsetMs: null, externalId, parentExternalId: parent, hidden,
});

function chatgptPath(c: Any): Any[] {
  const out: Any[] = [];
  let id = c.current_node;
  const seen = new Set<string>();
  while (id && c.mapping?.[id] && !seen.has(id)) { seen.add(id); out.push(c.mapping[id]); id = c.mapping[id].parent; }
  return out.reverse();
}
const chatgptText = (m: Any) => (Array.isArray(m?.content?.parts) ? m.content.parts.filter((p: unknown) => typeof p === "string").join("\n") : typeof m?.content?.text === "string" ? m.content.text : "");
const cid = (c: Any, i: number) => String(c.id ?? c.conversation_id ?? c.uuid ?? `c${i}-${hash(JSON.stringify(c.title ?? c.name ?? ""))}`);

export function readJson(value: unknown, files?: { name: string; text: string }[]): JsonSource | null {
  // a Discourse topic, as fetched by Ramus (one topic) or kept as [topic]
  const one = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (isTopic(one)) {
    const t: Any = one;
    const c = completeness(t);
    const warnings = c.missing.length || c.received < c.expected
      ? [`Only ${c.received} of ${c.expected} posts in this discussion were received; ${c.expected - c.received} are missing.`] : [];
    return {
      format: "discourse", warnings,
      conversations: [{ id: `discourse:${t.id}`, title: String(t.title), date: isoStr(t.created_at), count: c.received }],
      pick: () => [t],
      build: (chosen) => {
        const topic = chosen[0] ?? t;
        const ms = topicMessages(topic);
        return {
          units: ms.map((m) => unit(m.label, m.content, m.sentAt, m.externalId, m.parent, m.hidden)),
          otherBranches: 0, received: ms.map((m) => ({ role: m.label, text: m.content })), title: String(topic.title ?? "") || null,
        };
      },
    };
  }
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  if (list.length && list.every((c: Any) => c && typeof c === "object" && c.mapping)) {
    return {
      format: "chatgpt",
      conversations: list.map((c: Any, i) => ({ id: cid(c, i), title: String(c.title ?? "Untitled"), date: iso(c.create_time), count: chatgptPath(c).filter((n) => n.message).length })),
      pick: (ids) => list.filter((c: Any, i) => ids.includes(cid(c, i))),
      build: (chosen) => {
        const units: Unit[] = [], received: { role: string; text: string }[] = [];
        let otherBranches = 0;
        for (const c of chosen) {
          const path = chatgptPath(c);
          const on = new Set(path.map((n) => n.id));
          otherBranches += Object.values(c.mapping ?? {}).filter((n: Any) => n?.message && !on.has(n.id) && ["user", "assistant"].includes(n.message.author?.role)).length;
          for (const n of path) {
            const m = n.message;
            if (!m) continue;
            const role = String(m.author?.role ?? "unknown");
            const text = chatgptText(m);
            received.push({ role, text });
            const hidden = role === "system" || role === "tool" || !text.trim() ? (role === "user" || role === "assistant" ? "empty" : "system") : null;
            units.push(unit(role, text, iso(m.create_time), String(m.id ?? n.id), null, hidden));
          }
        }
        return { units, otherBranches, received, title: chosen.length === 1 ? String(chosen[0].title ?? "") || null : null };
      },
    };
  }
  if (list.length && list.every((c: Any) => c && typeof c === "object" && Array.isArray(c.chat_messages))) {
    const text = (m: Any) => (typeof m.text === "string" && m.text ? m.text : Array.isArray(m.content) ? m.content.filter((p: Any) => p?.type === "text").map((p: Any) => p.text).join("\n") : "");
    return {
      format: "claude",
      conversations: list.map((c: Any, i) => ({ id: cid(c, i), title: String(c.name || "Untitled"), date: isoStr(c.created_at), count: c.chat_messages.length })),
      pick: (ids) => list.filter((c: Any, i) => ids.includes(cid(c, i))),
      build: (chosen) => {
        const units: Unit[] = [], received: { role: string; text: string }[] = [];
        for (const c of chosen) for (const m of c.chat_messages) {
          const role = String(m.sender ?? "unknown"), t = text(m);
          received.push({ role, text: t });
          units.push(unit(role, t, isoStr(m.created_at), String(m.uuid), null, t.trim() ? (role === "human" || role === "assistant" ? null : "system") : "empty"));
        }
        return { units, otherBranches: 0, received, title: chosen.length === 1 ? String(chosen[0].name ?? "") || null : null };
      },
    };
  }
  const days = files?.length ? files.map((f) => ({ name: f.name, rows: safe(f.text) })) : [{ name: "", rows: list }];
  const rows = days.flatMap((d) => (Array.isArray(d.rows) ? d.rows : []));
  if (rows.length && rows.every((r: Any) => r && typeof r === "object" && typeof r.ts === "string")) {
    const label = (r: Any) => r.user_profile?.real_name || r.user_profile?.display_name || r.user || r.username || null;
    // a workspace export holds several channels (channel/2026-11-17.json); each channel is one choice
    const channelOf = (name: string) => name.split("/").slice(-2, -1)[0] ?? "";
    const byTs = (a: Any, b: Any) => Number(a.ts) - Number(b.ts);
    const channels = [...new Set(days.map((d) => channelOf(d.name)))];
    const rowsOf = (ch: string) => days.filter((d) => channelOf(d.name) === ch).flatMap((d) => (Array.isArray(d.rows) ? d.rows : []));
    const single = channels.length <= 1;
    return {
      format: "slack",
      conversations: single
        ? [{ id: "slack", title: channels[0] ? `#${channels[0]}` : "Slack", date: iso(Number(rows[0].ts)), count: rows.length }]
        : channels.map((ch) => { const r = rowsOf(ch).sort(byTs); return { id: `slack:${ch}`, title: `#${ch}`, date: iso(Number(r[0]?.ts)), count: r.length }; }),
      pick: (ids) => (single ? [...rows] : ids.flatMap((id) => rowsOf(id.replace(/^slack:/, "")))).sort(byTs),
      build: (chosen) => {
        const received = chosen.map((r: Any) => ({ role: String(label(r) ?? "unknown"), text: String(r.text ?? "") }));
        const units = chosen.map((r: Any) => unit(label(r), String(r.text ?? ""), iso(Number(r.ts)), r.ts, r.thread_ts && r.thread_ts !== r.ts ? r.thread_ts : null,
          r.subtype && r.subtype !== "thread_broadcast" && r.subtype !== "bot_message" ? "system" : String(r.text ?? "").trim() ? null : "empty"));
        const title = single && channels[0] ? `#${channels[0]}` : null;
        return { units, otherBranches: 0, received, title };
      },
    };
  }
  return null;
}

function safe(t: string): unknown { try { return JSON.parse(t); } catch { return null; } }

/** Mask string values only, so the JSON stays valid. */
export function deepMap(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === "string") return f(v);
  if (Array.isArray(v)) return v.map((x) => deepMap(x, f));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x, f)]));
  return v;
}
