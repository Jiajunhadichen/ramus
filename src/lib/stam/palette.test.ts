import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextColor, PERSON_COLORS } from "./palette";

const css = readFileSync("src/styles.css", "utf8");
const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));

describe("person palette", () => {
  it("gives eight people eight different inks, and the ninth the first again", () => {
    const eight = Array.from({ length: 8 }, (_, i) => nextColor(i));
    expect(new Set(eight).size).toBe(8);
    expect(nextColor(8)).toBe(nextColor(0));
  });

  it("keeps the order people liked: green, ochre, blue first", () => {
    expect(PERSON_COLORS.slice(0, 3)).toEqual(["var(--person-1)", "var(--person-2)", "var(--person-3)"]);
  });

  it("defines every ink by day and by night", () => {
    for (const v of PERSON_COLORS.map((c) => c.slice(4, -1))) {
      expect(block(":root"), `${v} by day`).toMatch(new RegExp(`${v}:\\s*#[0-9A-F]{6}`, "i"));
      expect(block(":root.dark"), `${v} by night`).toMatch(new RegExp(`${v}:\\s*#[0-9A-F]{6}`, "i"));
    }
  });
});
