import { describe, expect, it } from "vitest";
import { pageText, type PdfItem } from "./pdf";

/** pdf.js gives lines with their height on the page; a larger gap is a new paragraph (or a new message). */
const at = (str: string, y: number): PdfItem => ({ str, hasEOL: true, transform: [1, 0, 0, 1, 72, y], height: 10 });

describe("PDF text", () => {
  it("keeps one line per line, and marks paragraph gaps with a blank line", () => {
    const items = [at("这是我的三个简历。", 700), at("看了三份简历，我对选题的", 670), at("判断要调整一下。", 656), at("你的实际技能比", 642), at("IT 支持更宽。", 628), at("### 调整后的排序", 598)];
    expect(pageText(items)).toBe("这是我的三个简历。\n\n看了三份简历，我对选题的\n判断要调整一下。\n你的实际技能比\nIT 支持更宽。\n\n### 调整后的排序");
  });

  it("without positions it is one line per line, as before", () => {
    expect(pageText([{ str: "a", hasEOL: true }, { str: "b", hasEOL: true }])).toBe("a\nb");
  });

  it("joins items of one line and keeps blank lines single", () => {
    const items: PdfItem[] = [{ str: "Multi-criteria ", transform: [1, 0, 0, 1, 72, 700] }, { str: "decision modelling", hasEOL: true, transform: [1, 0, 0, 1, 150, 700] }, { str: "", hasEOL: true }, { str: "", hasEOL: true }, at("next", 680)];
    expect(pageText(items)).toBe("Multi-criteria decision modelling\n\nnext");
  });
});
