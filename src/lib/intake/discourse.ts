/**
 * Public Discourse discussions, read from Discourse's own JSON instead of a copied page.
 * Pure: no network, no clock. The server function in src/lib/sources.functions.ts does the fetching.
 */
type Any = any; // Discourse JSON is untyped

export type TopicAddress = { origin: string; topicId: number; url: string };

const PRIVATE_HOST = /^(?:localhost|.*\.local|.*\.internal|\d{1,3}(?:\.\d{1,3}){3}|\[.*\])$/i;

/** A Discourse topic address: https://host/t/slug/123, https://host/t/123, optionally with a post number. */
export function parseTopicUrl(s: string): TopicAddress | null {
  let u: URL;
  try { u = new URL(s.trim()); } catch { return null; }
  if (u.protocol !== "https:" || !u.hostname.includes(".") || PRIVATE_HOST.test(u.hostname) || u.username || u.password || u.port) return null;
  const m = u.pathname.match(/^\/t\/(?:[^/]+\/)?(\d+)(?:\/\d+)?\/?(?:\.json)?$/);
  if (!m) return null;
  const topicId = Number(m[1]);
  if (!Number.isSafeInteger(topicId) || topicId <= 0) return null;
  return { origin: u.origin, topicId, url: `${u.origin}/t/${topicId}` };
}

/** The first Discourse topic address mentioned anywhere in a text. */
export function findTopicUrl(text: string): TopicAddress | null {
  for (const m of text.matchAll(/https:\/\/[^\s<>"'()]+\/t\/[^\s<>"'()]+/g)) {
    const a = parseTopicUrl(m[0].replace(/[.,;:!?]+$/, ""));
    if (a) return a;
  }
  return null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all; }
  return ENT[e.toLowerCase()] ?? all;
});

function inline(html: string): string {
  return html
    .replace(/<img[^>]*class="[^"]*emoji[^"]*"[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(?:p|div|h[1-6]|pre|ul|ol|table|tr|blockquote|details|summary)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "");
}
const tidy = (s: string) => decode(s).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/**
 * A post's words as plain text. Quotes of other people stay, marked line by line with "> "
 * under a "[quoting name]" line, so the author's own words are never confused with what they quoted.
 */
export function postText(cooked: string, nameOf: (username: string) => string = (u) => u): string {
  let html = String(cooked ?? "");
  // link previews (oneboxes) become their address
  html = html.replace(/<aside[^>]*class="[^"]*onebox[^"]*"[^>]*>[\s\S]*?<\/aside>/gi, (block) => {
    const href = block.match(/href="([^"]+)"/i)?.[1];
    return href ? `<p>${href}</p>` : "";
  });
  // quotes, innermost first
  for (let guard = 0; guard < 20 && /<aside[^>]*class="[^"]*quote/i.test(html); guard++) {
    html = html.replace(/<aside([^>]*class="[^"]*quote[^"]*"[^>]*)>((?:(?!<aside)[\s\S])*?)<\/aside>/gi, (_all, attrs: string, inner: string) => {
      const user = attrs.match(/data-username="([^"]+)"/i)?.[1];
      const body = inner.match(/<blockquote>([\s\S]*)<\/blockquote>/i)?.[1] ?? inner.replace(/<div class="title">[\s\S]*?<\/div>\s*<\/div>|<div class="title">[\s\S]*?<\/div>/i, "");
      const lines = tidy(inline(body)).split("\n");
      return `\n\n${["[quoting " + (user ? nameOf(decode(user)) : "someone") + "]", ...lines].map((l) => (l ? `> ${l}` : ">")).join("\n")}\n\n`;
    });
  }
  // plain blockquotes without an author
  html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_a, inner: string) => `\n\n${tidy(inline(inner)).split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n")}\n\n`);
  return tidy(inline(html));
}

/** Only the lines a person wrote themselves: quoted lines ("> …") are someone else's words. */
export const ownWords = (content: string) => content.split("\n").filter((l) => !/^>(?:\s|$)/.test(l)).join("\n").trim();

/** Whether a parsed JSON value is a Discourse topic. */
export const isTopic = (v: Any) => !!v && typeof v === "object" && !Array.isArray(v) && Array.isArray(v.post_stream?.posts) && typeof v.title === "string" && (typeof v.id === "number" || typeof v.id === "string");

/** The fields Ramus keeps from a topic and its posts (the source's words and facts, nothing about the viewer). */
export function slimTopic(topic: Any, posts: Any[], sourceUrl: string): Any {
  const keep = ["id", "post_number", "username", "name", "created_at", "updated_at", "cooked", "post_type", "reply_to_post_number", "reply_to_user", "hidden", "deleted_at", "user_deleted", "post_url"];
  const pick = (p: Any) => Object.fromEntries(keep.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
  // inline <svg> icons are drawing instructions, not words; their numbers would read as phone numbers
  const clean = (p: Any) => (typeof p.cooked === "string" ? { ...p, cooked: p.cooked.replace(/<svg[\s\S]*?<\/svg>/gi, "") } : p);
  const byNo = [...new Map(posts.map((p: Any) => [p.id, p])).values()].sort((a: Any, b: Any) => a.post_number - b.post_number);
  return {
    source: "discourse", source_url: sourceUrl,
    id: topic.id, title: topic.title, slug: topic.slug, created_at: topic.created_at,
    posts_count: topic.posts_count, participant_count: topic.participant_count,
    post_stream: { stream: Array.isArray(topic.post_stream?.stream) ? topic.post_stream.stream : byNo.map((p: Any) => p.id), posts: byNo.map((p: Any) => pick(clean(p))) },
  };
}

/** What is known to be missing: post ids the topic lists but did not send. */
export function completeness(topic: Any): { expected: number; received: number; missing: number[]; participants: number | null } {
  const posts: Any[] = topic?.post_stream?.posts ?? [];
  const stream: number[] = Array.isArray(topic?.post_stream?.stream) ? topic.post_stream.stream : [];
  const have = new Set(posts.map((p) => p.id));
  const missing = stream.filter((id) => !have.has(id));
  const expected = Math.max(stream.length, typeof topic?.posts_count === "number" ? topic.posts_count : 0, posts.length);
  return { expected, received: posts.length, missing, participants: typeof topic?.participant_count === "number" ? topic.participant_count : null };
}

export type DiscourseUnit = { label: string; content: string; sentAt: string | null; externalId: string; parent: string | null; hidden: "system" | "deleted" | "empty" | null };

/** One message per post, in post order, with who wrote it, when, and which post it answers. */
export function topicMessages(topic: Any): DiscourseUnit[] {
  const posts: Any[] = [...(topic.post_stream?.posts ?? [])].sort((a, b) => a.post_number - b.post_number);
  const names = new Map<string, string>(posts.map((p) => [String(p.username ?? ""), String(p.name || p.username || "")]));
  const idOfNo = new Map<number, string>(posts.map((p) => [p.post_number, `discourse:${topic.id}:${p.post_number}`]));
  return posts.map((p) => {
    const content = postText(p.cooked ?? "", (u) => names.get(u) || u);
    const at = typeof p.created_at === "string" && !Number.isNaN(Date.parse(p.created_at)) ? new Date(Date.parse(p.created_at)).toISOString() : null;
    const gone = p.deleted_at || p.user_deleted || p.hidden;
    return {
      label: String(p.name || p.username || "") || "Unknown",
      content, sentAt: at,
      externalId: idOfNo.get(p.post_number)!,
      parent: p.reply_to_post_number ? idOfNo.get(p.reply_to_post_number) ?? null : null,
      hidden: p.post_type !== undefined && p.post_type !== 1 ? "system" : gone ? "deleted" : content ? null : "empty",
    };
  });
}

/**
 * A copied web page rather than a conversation: navigation, announcements, counters, "load more" lines.
 * Returns what gave it away, so the person is told instead of the page being read as messages.
 */
export function pageCopySigns(text: string): { looksLikePage: boolean; signs: string[]; url: TopicAddress | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const signs: string[] = [];
  const add = (s: string) => { if (!signs.includes(s)) signs.push(s); };
  for (const l of lines) {
    if (/^(?:skip to (?:main )?content|log ?in|sign ?up|sign in|search|menu|categories|tags|latest|top|unread|new|bookmarks|my posts|topics|more|faq|about|privacy|terms of service|powered by discourse)$/i.test(l)) add("navigation links");
    else if (/^(?:suggested topics|related topics|new & unread topics|want to read more\?|there are \d+ (?:new|unread)|topic\s+replies\s+views\s+activity|replies\s+views\s+activity)/i.test(l)) add("a list of other topics");
    else if (/^\d+\s*\/\s*\d+$/.test(l) || /^(?:jump to post|load more|show more|read \d+ more repl(?:y|ies)|\d+ more repl(?:y|ies)|view \d+ hidden repl)/i.test(l)) add("a page counter or “load more” line — the page did not show every post");
    else if (/^(?:announcement|pinned|banner|security (?:notice|advisory)|important notice|dismiss)\b/i.test(l) || /\b(?:security incident|certificate authority|has been compromised)\b/i.test(l) && l.length < 200) add("an announcement that is not part of the discussion");
    else if (/^(?:reply|share|flag|bookmark|like|copy link|quote|edit|\d+ likes?|\d+ repl(?:y|ies)|\d+ views?|created|last reply|views|users|links|likes)$/i.test(l)) add("buttons and post statistics");
  }
  const url = findTopicUrl(text);
  return { looksLikePage: signs.length >= 2 || (signs.length >= 1 && !!url), signs, url };
}

/**
 * Every post of a topic: the topic page, then the posts it lists but did not include, 20 at a time.
 * `get` fetches one JSON address; injected so this stays testable without the network.
 */
export async function readWholeTopic(a: TopicAddress, get: (url: string) => Promise<unknown>, maxPosts = 3000): Promise<Any> {
  const topic = (await get(`${a.origin}/t/${a.topicId}.json`)) as Any;
  if (!isTopic(topic)) throw new Error("This address is not a Discourse discussion.");
  const stream: number[] = (topic.post_stream.stream ?? []).filter((x: unknown) => typeof x === "number").slice(0, maxPosts);
  const posts: Any[] = [...topic.post_stream.posts];
  const have = new Set(posts.map((p) => p.id));
  const todo = stream.filter((id) => !have.has(id));
  for (let i = 0; i < todo.length; i += 20) {
    const ids = todo.slice(i, i + 20);
    const page = (await get(`${a.origin}/t/${a.topicId}/posts.json?${ids.map((id) => `post_ids[]=${id}`).join("&")}`)) as Any;
    for (const p of page?.post_stream?.posts ?? []) if (!have.has(p.id) && ids.includes(p.id)) { have.add(p.id); posts.push(p); }
  }
  return slimTopic({ ...topic, post_stream: { ...topic.post_stream, stream } }, posts, `${a.origin}/t/${topic.slug ?? "-"}/${a.topicId}`);
}
