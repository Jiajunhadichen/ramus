import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PAIRS, runs } from "./epigraphs";

const md = readFileSync("docs/epigraphs.md", "utf8");
describe("epigraphs", () => {
  it("has eight pairs", () => expect(PAIRS.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]));
  for (const p of PAIRS) for (const q of p.quotes) it(`pair ${p.n} matches docs/epigraphs.md exactly`, () => {
    expect(md).toContain(q.text + (q.cite.startsWith("——") ? "" : " ") + q.cite);
    if (q.gloss) expect(md).toContain(`Gloss: ${q.gloss}`);
  });
  it("only non-English quotes carry a gloss", () => {
    expect(PAIRS.flatMap((p) => p.quotes).filter((q) => q.text.startsWith("\"")).every((q) => !q.gloss)).toBe(true);
  });
  it("splits Chinese into upright runs", () => {
    expect(runs("Ramus 还是 Stam")).toEqual([{ t: "Ramus ", cjk: false }, { t: "还是", cjk: true }, { t: " Stam", cjk: false }]);
  });
});
