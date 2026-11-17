import { describe, expect, it } from "vitest";
import { inTimeOrder, parts } from "./order";

const m = (conversation: number, sequence: number, sentAt: string | null, id: string) => ({ conversation, sequence, sentAt, precision: sentAt ? "minute" : "unknown", id, content: id });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("one stream in the order things were said", () => {
  it("interleaves conversations by time", () => {
    const chat = [m(0, 0, "2026-11-01T10:00:00Z", "chat-1"), m(0, 1, "2026-11-01T10:20:00Z", "chat-2")];
    const meeting = [m(1, 0, "2026-11-01T10:10:00Z", "meet-1"), m(1, 1, "2026-11-01T10:30:00Z", "meet-2")];
    expect(ids(inTimeOrder([...meeting, ...chat]))).toEqual(["chat-1", "meet-1", "chat-2", "meet-2"]);
  });
  it("a message without a time stays right after the one before it", () => {
    const chat = [m(0, 0, "2026-11-01T10:00:00Z", "a"), m(0, 1, null, "a-cont"), m(0, 2, "2026-11-01T10:20:00Z", "b")];
    const other = [m(1, 0, "2026-11-01T10:05:00Z", "x")];
    expect(ids(inTimeOrder([...chat, ...other]))).toEqual(["a", "a-cont", "x", "b"]);
  });
  it("never rearranges a conversation, even when its clock goes backwards", () => {
    const chat = [m(0, 0, "2026-11-01T10:00:00Z", "a"), m(0, 1, "2026-11-01T09:00:00Z", "b"), m(0, 2, "2026-11-01T10:05:00Z", "c")];
    expect(ids(inTimeOrder(chat))).toEqual(["a", "b", "c"]);
  });
  it("a conversation with no times follows the others, in the order it was brought in", () => {
    const notes = [m(0, 0, null, "n1"), m(0, 1, null, "n2")];
    const chat = [m(1, 0, "2026-11-01T10:00:00Z", "c1")];
    const more = [m(2, 0, null, "z1")];
    expect(ids(inTimeOrder([...more, ...chat, ...notes]))).toEqual(["c1", "n1", "n2", "z1"]);
  });
  it("splits a long stream into parts that each fit one reading, every message once", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ content: "x".repeat(60), i }));
    const p = parts(many, 300);
    expect(p).toEqual([{ from: 0, to: 3 }, { from: 3, to: 6 }, { from: 6, to: 9 }, { from: 9, to: 10 }]);
    expect(parts([], 300)).toEqual([]);
  });
});
