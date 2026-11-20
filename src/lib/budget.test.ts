import { describe, expect, it } from "vitest";
import { allowance, CHEAP_MODEL, costOf, dayStart, guessUsage, LIMITS, mayRebuild, mayStartGrowth, modelsToday, partsToRead, STRONG_MODEL, usageOf } from "./budget";

const member = { guest: false, treesToday: 0, treesEver: 0, rebuildsToday: 0 };
const guest = { ...member, guest: true };
const fresh = { spentTodayUsd: 0 };

describe("budget", () => {
  it("prices a call by its tokens; unknown models cost as much as the strong one", () => {
    expect(costOf(STRONG_MODEL, { input: 1_000_000, output: 0 })).toBe(5);
    expect(costOf(STRONG_MODEL, { input: 40_000, output: 8_000 })).toBeCloseTo(0.44, 5);
    expect(costOf(CHEAP_MODEL, { input: 40_000, output: 8_000 })).toBeCloseTo(0.12, 5);
    expect(costOf("someone/new-model", { input: 1000, output: 1000 })).toBe(costOf(STRONG_MODEL, { input: 1000, output: 1000 }));
  });

  it("reads reported tokens, and guesses generously when there are none", () => {
    expect(usageOf({ usage: { prompt_tokens: 12, completion_tokens: 34 } })).toEqual({ input: 12, output: 34 });
    expect(usageOf({ choices: [] })).toBeNull();
    expect(usageOf(null)).toBeNull();
    expect(guessUsage(25_000)).toEqual({ input: 10_000, output: 8000 });
  });

  it("reads with the strong model first, then the cheaper one, then not at all", () => {
    expect(modelsToday(fresh)).toEqual({ ok: true, models: [STRONG_MODEL, CHEAP_MODEL] });
    expect(modelsToday({ spentTodayUsd: LIMITS.strongUsd })).toEqual({ ok: true, models: [CHEAP_MODEL] });
    expect(modelsToday({ spentTodayUsd: LIMITS.dailyUsd }).ok).toBe(false);
  });

  it("gives a member three growths a day and a guest one", () => {
    expect(mayStartGrowth({ ...member, treesToday: LIMITS.treesPerDay - 1 }, fresh).ok).toBe(true);
    const tired = mayStartGrowth({ ...member, treesToday: LIMITS.treesPerDay }, fresh);
    expect(tired.ok).toBe(false);
    expect(!tired.ok && tired.reason).toMatch(/tomorrow/);
    expect(mayStartGrowth(guest, fresh).ok).toBe(true);
    const done = mayStartGrowth({ ...guest, treesEver: 1, treesToday: 1 }, fresh);
    expect(!done.ok && done.reason).toMatch(/Sign up/);
  });

  it("a full site day stops everyone, however many growths they have left", () => {
    expect(mayStartGrowth(member, { spentTodayUsd: 99 }).ok).toBe(false);
    expect(mayRebuild(member, { spentTodayUsd: 99 }, 100).ok).toBe(false);
  });

  it("reconstructs only up to the length and the daily count, and says the words are still kept", () => {
    expect(mayRebuild(member, fresh, LIMITS.maxRebuildChars.member).ok).toBe(true);
    const long = mayRebuild(member, fresh, LIMITS.maxRebuildChars.member + 1);
    expect(!long.ok && long.reason).toMatch(/unattributed/);
    expect(mayRebuild(guest, fresh, LIMITS.maxRebuildChars.guest + 1).ok).toBe(false);
    expect(mayRebuild({ ...member, rebuildsToday: LIMITS.rebuildsPerDay.member }, fresh, 10).ok).toBe(false);
  });

  it("reads the leading readings that fit the length and the count, and always the first", () => {
    expect(partsToRead(false, [40_000, 40_000, 40_000, 40_000])).toBe(3);
    expect(partsToRead(false, [5_000, 5_000])).toBe(2);
    expect(partsToRead(false, Array(20).fill(3_000))).toBe(LIMITS.maxParts.member);
    expect(partsToRead(true, [40_000, 40_000])).toBe(1);
    expect(partsToRead(true, [10_000, 10_000, 10_000, 10_000])).toBe(3);
    expect(partsToRead(true, [90_000])).toBe(1);
    expect(partsToRead(false, [])).toBe(0);
  });

  it("tells the person what is left before they start", () => {
    expect(allowance({ ...member, treesToday: 1 }, fresh)).toEqual({ guest: false, left: 2, siteOpen: true });
    expect(allowance({ ...guest, treesEver: 1 }, { spentTodayUsd: 5 })).toEqual({ guest: true, left: 0, siteOpen: false });
  });

  it("counts days in UTC", () => {
    expect(dayStart(new Date("2026-11-20T23:30:00+01:00"))).toBe("2026-11-20T00:00:00.000Z");
    expect(dayStart(new Date("2026-11-21T00:30:00+01:00"))).toBe("2026-11-20T00:00:00.000Z");
  });
});
