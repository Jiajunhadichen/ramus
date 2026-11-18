import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkReconstructionPart, readingParts } from "@/lib/intake/reconstruct";
import { toLines } from "@/lib/intake/util";

/** The gardener's reconstruction, mocked: one block per paragraph group that starts a turn, asker S1, explainer S2. */
const plain = readFileSync(join(__dirname, "..", "..", "lib", "intake", "fixtures", "understanding", "wage-compression.plain.txt"), "utf8");
const turnStarts = ["我最近在读", "## 一、", "那这种政策", "## 二、", "这跟移民", "## 三、", "等一下", "## 四、", "好，帮我", "## 五、"];
const rebuild = vi.fn(async ({ data }: { data: { text: string; part: number; voices: never[] } }) => {
  const lines = toLines(data.text);
  const starts = turnStarts.map((t) => lines.findIndex((l) => l.text.startsWith(t)));
  const blocks = starts.map((s, k) => ({ from: `L${s}`, to: `L${(starts[k + 1] ?? lines.length) - 1}`, voice: k % 2 ? "S2" : "S1", confidence: "high", evidence: lines[s]!.text.slice(0, 6) }));
  const answer = { blocks, voices: [{ id: "S1", describe: "asks", suggested: "Me" }, { id: "S2", describe: "explains", suggested: "ChatGPT" }] };
  const parts = readingParts(data.text);
  return { parts: parts.length, ...checkReconstructionPart(answer, data.text, parts[data.part]!, [], data.voices), model: "mock", participants: [] };
});
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => (fn === "reconstructSource" ? rebuild : vi.fn(async () => ({ name: "Jiajun" }))), createServerFn: () => ({}) }));
vi.mock("@/lib/garden.functions", () => ({ checkOverlap: {}, createGarden: {}, getAccessionContext: {}, receiveBatch: {}, whoAmI: {}, growTree: {}, reviewAllSuggestions: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/sources.functions", () => ({ fetchDiscussion: {} }));
vi.mock("@/lib/reconstruct.functions", () => ({ reconstructSource: "reconstructSource" }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const { BringInWindow } = await import("./BringInWindow");
const open = () => render(<BringInWindow open onOpenChange={() => {}} target={{ kind: "new" }} onGrown={() => {}} />);

describe("the bring-in window", () => {
  it("collects several pastes, each read on its own, with nothing to choose", () => {
    open();
    const box = screen.getByLabelText("Paste anything");
    fireEvent.paste(box, { clipboardData: { files: [], getData: () => "[17/11/2026, 14:02:11] Ana: shall we fix the dryers?\n[17/11/2026, 14:03:40] Bo: report it" } });
    fireEvent.paste(box, { clipboardData: { files: [], getData: () => "Ana Lind\n2:02 PM\nHello\nBo Berg\n2:03 PM\nHi" } });
    const list = screen.getByRole("list", { name: "Brought in" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(list.textContent).toMatch(/WhatsApp chat · 2 messages · 2 voices/);
    expect(list.textContent).toMatch(/17 Nov 2026/);
  });
  it("one button grows the tree once something readable is in", () => {
    open();
    const go = screen.getByRole("button", { name: /That’s everything — grow the tree/ });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Paste anything"), { target: { value: "Ana: one idea\nBo: another" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(go).not.toBeDisabled();
  });
  it("asks for nothing, but offers the day when a chat has clock times only", () => {
    open();
    fireEvent.paste(screen.getByLabelText("Paste anything"), { clipboardData: { files: [], getData: () => "Ana Lind\n2:02 PM\nHello\nBo Berg\n2:03 PM\nHi there" } });
    expect(screen.getByText(/Which day was it\? \(optional\)/)).toBeTruthy();
  });

  it("a bare copy of an AI chat is reconstructed before anything is kept, and the person can name the voices it found", async () => {
    open();
    fireEvent.paste(screen.getByLabelText("Paste anything"), { clipboardData: { files: [], getData: () => plain } });
    await waitFor(() => expect(screen.getByRole("button", { name: /They are Me \(S1\) and ChatGPT \(S2\)/ })).toBeTruthy());
    expect(rebuild).toHaveBeenCalled();
    // until named, nobody is credited
    expect(screen.getByText(/10 messages · 10 unattributed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /They are Me/ }));
    await waitFor(() => expect(screen.getByText(/10 messages · 2 voices/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /That’s everything — grow the tree/ }).hasAttribute("disabled")).toBe(false);
  });
});
