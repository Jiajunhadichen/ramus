import { describe, expect, it } from "vitest";
import { facesFor, familiesOf, parseFontFaces, parseRanges } from "./fonts";

const css = `
/* [12] */
@font-face {
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/notoserifsc/v1/a.woff2) format('woff2');
  unicode-range: U+4e00-4e0f, U+4e8c;
}
@font-face {
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/notoserifsc/v1/b.woff2) format('woff2');
  unicode-range: U+9f??;
}
@font-face {
  font-family: 'IM Fell English';
  font-style: italic;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/imfell/v1/i.woff2) format('woff2');
}
@font-face { font-family: "Ramus Digits"; font-style: normal; font-weight: 400; src: url("/fonts/digits.woff2") format("woff2"); unicode-range: U+0030-0039; }
`;

describe("fonts for an exported tree", () => {
  const faces = parseFontFaces(css, "https://ramus.example/");
  it("reads every face, its slice and its file", () => {
    expect(faces.map((f) => [f.family, f.style, f.url])).toEqual([
      ["Noto Serif SC", "normal", "https://fonts.gstatic.com/s/notoserifsc/v1/a.woff2"],
      ["Noto Serif SC", "normal", "https://fonts.gstatic.com/s/notoserifsc/v1/b.woff2"],
      ["IM Fell English", "italic", "https://fonts.gstatic.com/s/imfell/v1/i.woff2"],
      ["Ramus Digits", "normal", "https://ramus.example/fonts/digits.woff2"],
    ]);
    expect(parseRanges("U+4e00-4e0f, U+4e8c, U+9f??")).toEqual([[0x4e00, 0x4e0f], [0x4e8c, 0x4e8c], [0x9f00, 0x9fff]]);
  });
  it("embeds only the slices that cover characters drawn in that family", () => {
    const used = new Map([["Noto Serif SC", new Set([..."二"].map((c) => c.codePointAt(0)!))], ["Ramus Digits", new Set([0x41])]]);
    expect(facesFor(faces, used).map((f) => f.url)).toEqual(["https://fonts.gstatic.com/s/notoserifsc/v1/a.woff2"]);
  });
  it("reads a computed font-family list", () => {
    expect(familiesOf(`"Ramus Digits", "IM Fell English", "Noto Serif SC", serif`)).toEqual(["Ramus Digits", "IM Fell English", "Noto Serif SC"]);
  });
});
