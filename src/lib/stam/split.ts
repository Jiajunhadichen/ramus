export type SplitMessage = { speaker: string | null; content: string };

const SPEAKER = /^\s*([^:：\n]{1,40})[:：]\s?(.*)$/;

/** Split pasted text into messages by lines starting with "Name:". Fallback: one message. */
export function splitConversation(text: string): SplitMessage[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: SplitMessage[] = [];
  let found = false;
  for (const line of lines) {
    const m = line.match(SPEAKER);
    if (m && m[1] && !/^https?$/i.test(m[1].trim())) {
      found = true;
      out.push({ speaker: m[1].trim(), content: m[2] ?? "" });
    } else if (out.length) {
      out[out.length - 1]!.content += "\n" + line;
    } else if (line.trim()) {
      out.push({ speaker: null, content: line });
    }
  }
  if (!found) return text.trim() ? [{ speaker: null, content: text.trim() }] : [];
  return out.map((m) => ({ ...m, content: m.content.trim() })).filter((m) => m.content);
}
