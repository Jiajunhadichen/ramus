import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const setStatus = vi.fn(async () => ({}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => (fn === "setStatus" ? setStatus : vi.fn(async () => ({}))), createServerFn: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({ Link: (p: { children: unknown }) => p.children }));
vi.mock("@/lib/garden.functions", () => ({ addEvidence: "", editIdea: "", graftMerge: "", growBranch: "", reopenKnot: "", reviewSuggestion: "", reviewThought: "", setIdeaContributor: "", setKnot: "", setStatus: "setStatus", setOutcome: "" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { FieldNotes } = await import("./FieldNotes");
const node = (o: Record<string, unknown>) => ({ dbId: String(o["id"]), note: "", settled: null, contributorId: "c1", natures: {}, suggestion: null, by: "Ana", color: "var(--person-1)", step: 1, status: "growing", knot: false, confirmed: true, parents: [], ...o });
const root = node({ id: "root", label: "What shall we make?" });
const idea = node({ id: "a", label: "Linen blend", parents: ["root"] });
const data = { garden: { id: "g", title: "Coat", is_demo: false }, steps: [], contributors: [], convMessages: [], evidence: [], thoughts: [], thoughtEvidence: [], ideas: [], links: [], conversations: [] } as never;
const show = (i: typeof idea) => render(<FieldNotes data={data} ideas={[root, idea] as never} idea={i as never} currentStep={1} onSelect={() => {}} onChanged={async () => {}} onGrowAgain={() => {}} />);

describe("field notes: an idea's state reads and works without being taught", () => {
  it("shows whether the group is still working on it, and switches with one click", () => {
    show(idea);
    const group = screen.getByRole("radiogroup", { name: "Is the group still working on it?" });
    expect(screen.getByRole("radio", { name: "Growing" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Set aside" }));
    expect(setStatus).toHaveBeenCalledWith({ data: { gardenId: "g", key: "a", status: "dormant" } });
    expect(group).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Let it rest" })).toBeNull();
  });
  it("says what set aside means, only when it is", () => {
    show({ ...idea, status: "dormant" });
    expect(screen.getByText(/stays on the tree, drawn hollow, and can grow again/)).toBeTruthy();
  });
  it("the question is neither set aside nor an outcome", () => {
    show(root);
    expect(screen.getByText("The question")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as outcome" })).toBeNull();
    expect(screen.getByRole("button", { name: "Grow again from here" })).toBeTruthy();
  });
});
