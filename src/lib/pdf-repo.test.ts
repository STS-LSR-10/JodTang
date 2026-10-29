import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { cancelImport, confirmImport, entryKey, importRawText } from "./pdf-repo";

function fakeDb(rows: number) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    };
  for (const op of ["update", "eq", "delete"]) chain[op] = rec(op);
  chain.select = (...args: unknown[]) => {
    calls.push({ op: "select", args });
    return Promise.resolve({
      data: Array.from({ length: rows }, (_, i) => ({ id: i })),
      error: null,
    });
  };
  const db = {
    from: (t: string) => (calls.push({ op: "from", args: [t] }), chain),
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("pdf import repo", () => {
  it("confirms only this user's waiting entries of that import", async () => {
    const { db, calls } = fakeDb(3);
    expect(await confirmImport(db, "u1", "i1")).toBe(3);
    expect(calls).toContainEqual({ op: "update", args: [{ status: "confirmed" }] });
    expect(calls).toContainEqual({ op: "eq", args: ["user_id", "u1"] });
    expect(calls).toContainEqual({ op: "eq", args: ["raw_text", importRawText("i1")] });
    expect(calls).toContainEqual({ op: "eq", args: ["status", "pending_confirm"] });
  });

  it("cancels the waiting entries and forgets the file", async () => {
    const { db, calls } = fakeDb(2);
    expect(await cancelImport(db, "u1", "i1")).toBe(2);
    expect(calls).toContainEqual({ op: "update", args: [{ status: "deleted" }] });
    expect(calls.some((c) => c.op === "delete")).toBe(true);
  });

  it("keys an entry by type, satang and Bangkok day", () => {
    // 17:30 UTC on the 27th is already the 28th in Bangkok
    expect(entryKey("expense", 6500, new Date("2026-10-27T17:30:00Z"))).toBe(
      "expense|6500|2026-10-28",
    );
  });
});
