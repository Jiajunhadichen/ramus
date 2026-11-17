import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BringInWindow } from "./BringInWindow";

describe("the Bring in window", () => {
  it("a paste goes straight through, with no format to choose", () => {
    const got = vi.fn();
    render(<BringInWindow open onOpenChange={() => {}} onReceive={got} />);
    fireEvent.paste(screen.getByLabelText("Paste anything"), { clipboardData: { files: [], getData: () => "Ana Lind\n2:02 PM\nHello" } });
    expect(got).toHaveBeenCalledWith({ text: "Ana Lind\n2:02 PM\nHello" });
  });
  it("typed notes continue with one button", () => {
    const got = vi.fn();
    render(<BringInWindow open onOpenChange={() => {}} onReceive={got} />);
    fireEvent.change(screen.getByLabelText("Paste anything"), { target: { value: "My notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(got).toHaveBeenCalledWith({ text: "My notes" });
  });
});
