/**
 * Is a label someone's name, or words that merely sit before a colon?
 *
 * Speaker evidence is conservative: a heading, an argument ("理由：…"), a Markdown title or a sentence
 * never becomes a person. Pure and deterministic, shared by every text reader.
 */

/** Words that head a line in notes and answers ("Reason: …", "风险：…"); never people unless someone says so. */
export const HEADING_WORDS = new Set([
  // English
  "note", "notes", "nb", "ps", "todo", "q", "a", "question", "answer", "summary", "conclusion", "conclusions", "reason", "reasons",
  "result", "results", "example", "examples", "option", "options", "pros", "cons", "risk", "risks", "goal", "goals", "step",
  "source", "sources", "quote", "update", "edit", "warning", "tip", "tips", "important", "tl;dr", "tldr", "takeaway", "takeaways",
  "background", "context", "problem", "solution", "idea", "ideas", "plan", "next steps", "action items", "decision", "decisions",
  "recommendation", "first", "second", "third", "pro", "con", "why", "how", "what", "definition", "method", "methods", "approach",
  "limitation", "limitations", "future work", "evidence", "claim", "assumption", "assumptions", "constraint", "constraints",
  "input", "output", "status", "owner", "deadline", "date", "time", "location", "title", "topic", "subject", "re", "fyi", "update",
  "agenda", "minutes", "attendees", "notice", "announcement", "forum-wide notice",
  // 中文
  "注意", "备注", "问", "答", "问题", "答案", "总结", "结论", "理由", "原因", "结果", "例如", "比如", "例子", "选项", "优点", "缺点",
  "风险", "目标", "步骤", "来源", "引用", "前提", "背景", "方法", "建议", "推荐", "第一", "第二", "第三", "第一推荐", "第二推荐",
  "第三推荐", "定义", "限制", "局限", "未来工作", "证据", "假设", "约束", "输入", "输出", "状态", "负责人", "截止", "时间", "地点",
  "标题", "主题", "说明", "提示", "重点", "要点", "核心", "补充", "更新", "公告", "通知", "模型评价", "评价", "判断", "排序", "新的排序",
  // Svenska
  "anteckning", "fråga", "svar", "sammanfattning", "slutsats", "anledning", "resultat", "exempel", "risk", "mål", "steg", "källa",
  "citat", "bakgrund", "förslag", "beslut",
]);

const EN_STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "to", "of", "and", "or", "for", "with", "in", "on", "at", "by", "not",
  "it", "its", "this", "that", "these", "those", "we", "you", "they", "i", "my", "our", "your", "their", "what", "why", "how", "which",
  "if", "then", "but", "so", "as", "from", "into", "about", "can", "should", "would", "will", "do", "does", "did", "must", "may",
  "has", "have", "had", "there", "here", "all", "any", "some", "more", "most", "no", "yes", "than", "too", "very", "just",
]);
/** Characters that make a run of Chinese a phrase rather than a name. */
const ZH_FUNCTION = /[的了是在不和也都就要会很把给能这那们吗呢吧啊而与或及但如果因为所以自己没有什么怎么可以已经还是]/u;
const HAN = /\p{Script=Han}/gu;
const SENTENCE_PUNCT = /[，。、；！？“”‘’（）《》【】…,;!?()"«»]/u;
const MARKUP_START = /^(?:#{1,6}\s|[*_>•·‣▪◦\-–—+]|\d{1,3}[.)、]\s?|[（(]\d+[)）])/u;

export type NameShape = "name" | "maybe" | "no";

/**
 * "name": looks like a person's name (Pradyun Gedam, C.A.M. Gerlach, Me, Claude).
 * "maybe": could be a name, but only repeated use in an exchange or the person's word makes it one (张三, ana_l).
 * "no": a heading, a phrase or a sentence (理由, LLM 自己给的区间, 三份方向分得很开, Forum-wide notice).
 */
export function nameShape(label: string): NameShape {
  const s = label.replace(/^~\s*/, "").trim();
  if (!s || s.length > 40) return "no";
  if (MARKUP_START.test(s) || /\*\*|__|`/.test(s)) return "no";
  if (SENTENCE_PUNCT.test(s) || /https?:|www\.|@\S+\./.test(s)) return "no";
  if (/^[\d\s.:/-]+$/.test(s)) return "no";
  const key = s.toLowerCase();
  if (HEADING_WORDS.has(key) || HEADING_WORDS.has(key.replace(/\s*\d+$/, "")) || /^(?:step|option|part|phase|point|第)\s*[\d一二三四五六七八九十a-z]{1,3}\s*(?:步|点|部分)?$/iu.test(s)) return "no";
  const han = s.match(HAN)?.length ?? 0;
  if (han) {
    if (han > 6 || (ZH_FUNCTION.test(s) && han > 2)) return "no";
    const latin = s.replace(HAN, " ").trim();
    if (latin && latin.split(/\s+/).some((w) => EN_STOP.has(w.toLowerCase()))) return "no";
    return "maybe";
  }
  const words = s.split(/\s+/);
  if (words.length > 4) return "no";
  if (words.some((w) => EN_STOP.has(w.toLowerCase())) && words.length > 1) return "no";
  if (!/^[\p{L}]/u.test(s)) return "no";
  const capital = (w: string) => /^(?:\p{Lu}[\p{L}'’.-]*|(?:\p{L}\.)+\p{L}?\.?)$/u.test(w);
  if (words.every(capital)) return "name";
  if (words.length === 1 && /^[\p{L}][\p{L}\d_.-]{1,30}$/u.test(s) && !EN_STOP.has(key)) return "maybe";
  return "no";
}

/** Names spoken about in the words (Aron, Mats): they are mentioned, never speakers by that fact. */
export function mentionedNames(texts: string[], speakers: Set<string>, candidates: string[]): string[] {
  const lower = new Set([...speakers].map((s) => s.toLowerCase()));
  const body = texts.join("\n");
  return [...new Set(candidates.filter((c) => c.trim() && !lower.has(c.toLowerCase()) && body.includes(c)))];
}
