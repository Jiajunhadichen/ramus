import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { completeness, findTopicUrl, ownWords, pageCopySigns, parseTopicUrl, postText, readWholeTopic, topicMessages } from "./discourse";
import { prepare } from "./prepare";

const ctx = { contributors: [], aliases: [], importerContributorId: null };
// a real public topic as Discourse sent it (topic page + the posts fetched separately)
const real = JSON.parse(readFileSync(join(__dirname, "fixtures/discourse-topic.json"), "utf8"));
const allPosts: any[] = real.post_stream.posts;

/** A fake forum that, like Discourse, sends only the first 20 posts with the topic page. */
const forum = (topic: any) => async (url: string) => {
  if (url.endsWith(`/t/${topic.id}.json`)) return { ...topic, post_stream: { stream: topic.post_stream.posts.map((p: any) => p.id), posts: topic.post_stream.posts.slice(0, 20) } };
  const ids = [...url.matchAll(/post_ids\[\]=(\d+)/g)].map((m) => Number(m[1]));
  if (ids.length > 20) throw new Error("asked for too many at once");
  return { post_stream: { posts: topic.post_stream.posts.filter((p: any) => ids.includes(p.id)) } };
};

describe("Discourse addresses", () => {
  it.each(["https://discuss.python.org/t/14111", "https://discuss.python.org/t/some-slug/14111", "https://discuss.python.org/t/some-slug/14111/7", "https://discuss.python.org/t/14111.json"])("%s is a topic", (u) => {
    expect(parseTopicUrl(u)).toEqual({ origin: "https://discuss.python.org", topicId: 14111, url: "https://discuss.python.org/t/14111" });
  });
  it.each(["http://discuss.python.org/t/14111", "https://localhost/t/1", "https://127.0.0.1/t/1", "https://example.com/c/news/5", "https://user:pw@forum.example/t/1", "https://forum.example:8443/t/1", "not a url"])("%s is refused", (u) => {
    expect(parseTopicUrl(u)).toBeNull();
  });
  it("finds a topic address inside copied text", () => expect(findTopicUrl("see https://discuss.python.org/t/a-b/42/3.")?.topicId).toBe(42));
});

describe("reading a whole topic", () => {
  it("fetches every page of posts, never more than 20 at a time, without gaps or repeats", async () => {
    const topic = await readWholeTopic({ origin: "https://discuss.python.org", topicId: real.id, url: "" }, forum(real));
    const c = completeness(topic);
    expect(c.received).toBe(allPosts.length);
    expect(c.missing).toEqual([]);
    const nos = topic.post_stream.posts.map((p: any) => p.post_number);
    expect(nos).toEqual([...nos].sort((a: number, b: number) => a - b));
    expect(new Set(nos).size).toBe(nos.length);
  });
  it("reports posts the forum did not send instead of hiding them", async () => {
    const lossy = async (url: string) => (url.includes("posts.json") ? { post_stream: { posts: [] } } : forum(real)(url));
    const topic = await readWholeTopic({ origin: "https://discuss.python.org", topicId: real.id, url: "" }, lossy);
    const c = completeness(topic);
    expect(c.received).toBe(20);
    expect(c.missing.length).toBe(allPosts.length - 20);
    const d = prepare({ kind: "json", text: JSON.stringify(topic) }, {}, ctx);
    expect(d.warnings[0]).toMatch(/Only 20 of \d+ posts/);
  });
});

describe("the real topic becomes its messages", () => {
  const d = prepare({ kind: "json", text: JSON.stringify(real) }, {}, ctx);
  const words = d.kept.filter((m) => !m.hidden);
  it("keeps every post, in post order, with the topic's own participant count", () => {
    expect(d.format).toBe("discourse");
    expect(d.warnings).toEqual([]);
    expect(d.kept).toHaveLength(allPosts.length);
    expect(d.kept.length).toBe(real.posts_count);
    expect(new Set(words.map((m) => m.speakerLabel)).size).toBe(real.participant_count);
    const times = d.kept.map((m) => m.sentAt!);
    expect(times).toEqual([...times].sort());
  });
  it("attributes each post to its author with the forum's own time", () => {
    const byNo = [...allPosts].sort((a, b) => a.post_number - b.post_number);
    d.kept.forEach((m, i) => {
      expect(m.speakerLabel).toBe(byNo[i].name || byNo[i].username);
      expect(m.sentAt).toBe(new Date(byNo[i].created_at).toISOString());
      expect(m.timeSource).toBe("source_export");
      expect(m.externalId).toBe(`discourse:${real.id}:${byNo[i].post_number}`);
    });
  });
  it("links replies to the post they answer", () => {
    const withReply = allPosts.filter((p) => p.reply_to_post_number);
    for (const p of withReply) {
      const m = d.kept.find((x) => x.externalId === `discourse:${real.id}:${p.post_number}`)!;
      expect(m.parentExternalId).toBe(`discourse:${real.id}:${p.reply_to_post_number}`);
    }
  });
  it("no message is page furniture: no HTML, no navigation", () => {
    for (const m of d.kept) { expect(m.content).not.toMatch(/<\/?[a-z][^>]*>/i); expect(m.content).not.toMatch(/^(Suggested Topics|Reply|Share)$/m); }
  });
  it("the stored original is the topic itself", () => expect(JSON.parse(d.raw)[0].id).toBe(real.id));
  it("is the same every time", () => expect(prepare({ kind: "json", text: JSON.stringify(real) }, {}, ctx).kept).toEqual(d.kept));
});

describe("quotes stay someone else's words", () => {
  const cooked = `<aside class="quote no-group" data-username="ana" data-post="1" data-topic="9"><div class="title"><div class="quote-controls"></div><img class="avatar" src="x"> ana:</div><blockquote><p>We should use a Category field.</p></blockquote></aside>
<p>I think a <code>Type</code> field fits better &amp; is simpler.</p>`;
  it("marks the quote and names who said it", () => {
    const t = postText(cooked, (u) => (u === "ana" ? "Ana Lind" : u));
    expect(t).toBe("> [quoting Ana Lind]\n> We should use a Category field.\n\nI think a Type field fits better & is simpler.");
    expect(ownWords(t)).toBe("I think a Type field fits better & is simpler.");
  });
  it("a post that only quotes has no words of its own", () => {
    const t = postText(`<aside class="quote" data-username="ana"><div class="title">ana:</div><blockquote><p>Yes.</p></blockquote></aside>`);
    expect(ownWords(t)).toBe("");
  });
  it("in a topic, quotes use the quoted person's name and the reply points back", () => {
    const topic = { id: 9, title: "T", post_stream: { stream: [1, 2], posts: [
      { id: 1, post_number: 1, username: "ana", name: "Ana Lind", created_at: "2022-03-07T10:00:00Z", cooked: "<p>We should use a Category field.</p>", post_type: 1 },
      { id: 2, post_number: 2, username: "bo", name: "", created_at: "2022-03-07T11:00:00Z", cooked, post_type: 1, reply_to_post_number: 1 },
      { id: 3, post_number: 3, username: "system", name: "", created_at: "2022-03-08T11:00:00Z", cooked: "<p>closed</p>", post_type: 3 },
    ] } };
    const ms = topicMessages(topic);
    expect(ms.map((m) => m.label)).toEqual(["Ana Lind", "bo", "system"]);
    expect(ms[1]!.parent).toBe("discourse:9:1");
    expect(ms[2]!.hidden).toBe("system");
  });
});

describe("a copied page is noticed", () => {
  const page = [
    "Skip to main content", "Log In", "Search",
    "Important notice: the eMudhra certificate authority has been compromised; check your trust store.",
    "Splitting out the packaging PEPs, on the PEP site",
    "Packaging", "pradyunsg", "Mar 2022", "Would it be possible to split out packaging PEPs?",
    "Reply", "1 / 39", "Read 25 more replies",
    "Suggested Topics", "Topic Replies Views Activity",
    "https://discuss.python.org/t/splitting-out-the-packaging-peps-on-the-pep-site/14111",
  ].join("\n");
  it("names what gave it away and offers the discussion's address", () => {
    const s = pageCopySigns(page);
    expect(s.looksLikePage).toBe(true);
    expect(s.signs.some((x) => /announcement/.test(x))).toBe(true);
    expect(s.signs.some((x) => /did not show every post/.test(x))).toBe(true);
    expect(s.url?.topicId).toBe(14111);
  });
  it("an ordinary chat is not a page", () => {
    expect(pageCopySigns("Ana: we should fix the dryers\nBo: yes, and report the fault\nAna: I'll call them").looksLikePage).toBe(false);
  });
});
