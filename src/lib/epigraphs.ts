/** The eight epigraph pairs, verbatim from docs/epigraphs.md (a test keeps them in sync). Original language first; gloss only when not English. */
export type Quote = { text: string; cite: string; gloss?: string };
export type Pair = { n: number; theme: string; quotes: [Quote, Quote] };

export const PAIRS: Pair[] = [
  { n: 1, theme: "difference", quotes: [
    { text: "君子和而不同。", cite: "——《论语·子路》", gloss: "The noble person seeks harmony, not sameness." },
    { text: "\"He who knows only his own side of the case, knows little of that.\"", cite: "— John Stuart Mill, On Liberty (1859)" },
  ] },
  { n: 2, theme: "sharpening", quotes: [
    { text: "如切如磋，如琢如磨。", cite: "——《诗经·卫风·淇奥》", gloss: "Like bone cut and filed, like jade carved and polished." },
    { text: "« … frotter et limer notre cervelle contre celle d'autrui. »", cite: "— Michel de Montaigne, Essais, I, 26 (1580).", gloss: "to rub and file our minds against the minds of others." },
  ] },
  { n: 3, theme: "together", quotes: [
    { text: "独学而无友，则孤陋而寡闻。", cite: "——《礼记·学记》", gloss: "Learning alone, without friends, one stays narrow and hears little." },
    { text: "\"No man is an island, entire of itself.\"", cite: "— John Donne, Devotions upon Emergent Occasions (1624)" },
  ] },
  { n: 4, theme: "method", quotes: [
    { text: "博学之，审问之，慎思之，明辨之，笃行之。", cite: "——《礼记·中庸》", gloss: "Study broadly, question closely, think it through, discern clearly, practise earnestly." },
    { text: "\"Reading maketh a full man; conference a ready man; and writing an exact man.\"", cite: "— Francis Bacon, \"Of Studies\", Essays (1625)" },
  ] },
  { n: 5, theme: "change", quotes: [
    { text: "穷则变，变则通，通则久。", cite: "——《周易·系辞下》", gloss: "When a way is exhausted it changes; changing, it flows; flowing, it endures." },
    { text: "\"…endless forms most beautiful and most wonderful have been, and are being, evolved.\"", cite: "— Charles Darwin, On the Origin of Species (1859)" },
  ] },
  { n: 6, theme: "lineage", quotes: [
    { text: "他山之石，可以攻玉。", cite: "——《诗经·小雅·鹤鸣》", gloss: "Stones from other hills can polish jade." },
    { text: "\"If I have seen further it is by standing on the shoulders of Giants.\"", cite: "— Isaac Newton, letter to Robert Hooke (1675/76)" },
  ] },
  { n: 7, theme: "names", quotes: [
    { text: "名不正，则言不顺。", cite: "——《论语·子路》", gloss: "If names are not right, speech does not flow." },
    { text: "Nomina si nescis, perit et cognitio rerum.", cite: "— Carl Linnaeus, Philosophia Botanica (1751).", gloss: "If you do not know the names, the knowledge of things is lost too." },
  ] },
  { n: 8, theme: "experience", quotes: [
    { text: "Sapienza è figliola della sperienza.", cite: "— Leonardo da Vinci, notebooks.", gloss: "Wisdom is the daughter of experience." },
    { text: "纸上得来终觉浅，绝知此事要躬行。", cite: "——陆游《冬夜读书示子聿》", gloss: "What comes from paper stays shallow; to truly know a thing, do it yourself." },
  ] },
];
export const pair = (n: number) => PAIRS.find((p) => p.n === n)!;

/** Split text into CJK and Latin runs so Chinese is always set upright in Noto Serif SC. */
export const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uFF00-\uFFEF《》——]+/g;
export function runs(s: string): { t: string; cjk: boolean }[] {
  const out: { t: string; cjk: boolean }[] = [];
  let i = 0;
  for (const m of s.matchAll(CJK)) {
    if (m.index! > i) out.push({ t: s.slice(i, m.index), cjk: false });
    out.push({ t: m[0], cjk: true });
    i = m.index! + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i), cjk: false });
  return out;
}
