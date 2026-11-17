import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gardenTitle, prepareAuto, timeLine } from "./auto";
import { checkDraft } from "./prepare";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");
const env = { timeZone: "Europe/Stockholm", dateOrder: "DMY" as const };
const ctx = { contributors: [], aliases: [], importerContributorId: null, importerName: "Jiajun" };
const auto = (n: string, extra = {}) => prepareAuto({ kind: n.endsWith(".json") ? "json" : "text", text: fx(n), fileName: n }, env, ctx, extra);

describe("bringing words in without questions", () => {
  it("hides phone numbers and email addresses on its own, and says so", () => {
    const a = auto("whatsapp-ios.txt");
    expect(a.options.mask).toBe("all");
    expect(a.notes.join()).toMatch(/hidden/);
    expect(a.draft.questions.some((q) => q.kind === "privacy")).toBe(false);
    expect(checkDraft(a.draft)).toEqual([]);
  });
  it("brings in every conversation of a small AI-assistant export", () => {
    const a = auto("chatgpt.json");
    expect(a.draft.questions.some((q) => q.kind === "pick-conversations")).toBe(false);
    expect(a.draft.kept.length).toBeGreaterThan(0);
  });
  it("says what it knows about time: a span, clock times without a day, offsets, or nothing", () => {
    expect(timeLine(auto("whatsapp-ios.txt").draft).kind).toBe("span");
    expect(timeLine(auto("lines-clock.txt").draft).kind).toBe("clock");
    expect(timeLine(auto("lines-clock.txt", { conversationDate: "2026-11-17" }).draft).kind).toBe("span");
    expect(timeLine(auto("otter.txt").draft).kind).toBe("offsets");
    expect(timeLine(auto("notes.txt").draft).kind).toBe("none");
  });
  it("is deterministic, so the server prepares exactly what the window showed", () => {
    const a = auto("copy-teams.txt"), b = auto("copy-teams.txt");
    expect(a.options).toEqual(b.options);
    expect(a.draft.kept.map((m) => m.externalId)).toEqual(b.draft.kept.map((m) => m.externalId));
  });
  it("names a garden after the chat's own name, or leaves a placeholder for the gardener", () => {
    const d = auto("whatsapp-ios.txt").draft;
    expect(gardenTitle("WhatsApp Chat with Dorm 3B.txt", d)).toEqual({ title: "Dorm 3B", placeholder: false });
    expect(gardenTitle("WhatsApp Chat - 宿舍群.zip", d)).toEqual({ title: "宿舍群", placeholder: false });
    expect(gardenTitle("_chat.txt", d).placeholder).toBe(true);
    expect(gardenTitle(null, d).placeholder).toBe(true);
  });
});
