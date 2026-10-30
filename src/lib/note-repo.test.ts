import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createNote, deleteNote, escapeLike, listNotes, updateNote } from "./note-repo";

function fakeDb(rows: unknown[] = [], single: unknown = null) {
  const calls: { op: string; args: unknown[] }[] = [];
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {};
  for (const op of [
    "select",
    "eq",
    "order",
    "limit",
    "ilike",
    "lt",
    "insert",
    "update",
    "delete",
  ]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  }
  chain.single = async () => ({ data: single, error: null });
  chain.maybeSingle = async () => ({ data: single, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return { db: { from: () => chain } as unknown as SupabaseClient, calls };
}

const row = (n: number) => ({
  id: `n${n}`,
  body: `โน้ต ${n}`,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

describe("escapeLike", () => {
  it("makes %, _ and \\ match themselves", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("listNotes", () => {
  it("asks for one more than the page to know whether there is more", async () => {
    const { db, calls } = fakeDb([row(1), row(2), row(3)]);
    const out = await listNotes(db, "u1", { limit: 2 });
    expect(out.items.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(out.hasMore).toBe(true);
    expect(calls).toContainEqual({ op: "limit", args: [3] });
    expect(calls).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
  });

  it("searches case-insensitively with the typed text escaped, and pages back from a moment", async () => {
    const { db, calls } = fakeDb([]);
    await listNotes(db, "u1", { q: " ไวไฟ_100% ", before: "2026-10-01T00:00:00Z" });
    expect(calls).toContainEqual({ op: "ilike", args: ["body", "%ไวไฟ\\_100\\%%"] });
    expect(calls).toContainEqual({ op: "lt", args: ["created_at", "2026-10-01T00:00:00Z"] });
  });
});

describe("writes", () => {
  it("create returns the note", async () => {
    const { db } = fakeDb([], row(1));
    expect((await createNote(db, "u1", "x")).body).toBe("โน้ต 1");
  });
  it("update and delete say whether the note was theirs", async () => {
    expect(await updateNote(fakeDb([], { id: "n1" }).db, "u1", "n1", "x")).toBe(true);
    expect(await updateNote(fakeDb([], null).db, "u1", "n1", "x")).toBe(false);
    expect(await deleteNote(fakeDb([], { id: "n1" }).db, "u1", "n1")).toBe(true);
    expect(await deleteNote(fakeDb([], null).db, "u1", "n1")).toBe(false);
  });
});
