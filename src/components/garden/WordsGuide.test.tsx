import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SOURCES, WordsGuide } from "./WordsGuide";

describe("Where are your words?", () => {
  it("shows the export steps for one source at a time", () => {
    render(<WordsGuide />);
    expect(screen.queryByRole("tabpanel")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "WhatsApp" }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Export Chat → Without Media/);
    fireEvent.click(screen.getByRole("tab", { name: "Microsoft Teams" }));
    expect(screen.getByRole("tabpanel").textContent).toMatch(/Recap → Transcript → Download/);
    expect(screen.getByText(/Screenshots and recordings/)).toBeTruthy();
  });
  it("every source says what to do with what it gives", () => {
    for (const s of SOURCES) expect(s.then.length).toBeGreaterThan(10);
  });
});
