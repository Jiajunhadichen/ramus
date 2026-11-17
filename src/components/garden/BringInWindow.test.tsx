import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => ({ name: "Jiajun" })), createServerFn: () => ({}) }));
vi.mock("@/lib/garden.functions", () => ({ checkOverlap: {}, createGarden: {}, getAccessionContext: {}, receiveBatch: {}, whoAmI: {}, growTree: {}, reviewAllSuggestions: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
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
});
