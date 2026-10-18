import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { loadSearchItems, loadSearchTotals, MAX_SEARCH_CHARS, parseSearchTerm } from "./search";

describe("parseSearchTerm", () => {
  it("words become a title search, #word a tag search", () => {
    expect(parseSearchTerm("กาแฟ")).toEqual({ q: "กาแฟ", tag: null });
    expect(parseSearchTerm("  ชานม   ไข่มุก ")).toEqual({ q: "ชานม ไข่มุก", tag: null });
    expect(parseSearchTerm("#ปาร์ตี้")).toEqual({ q: null, tag: "ปาร์ตี้" });
    expect(parseSearchTerm("# Trip")).toEqual({ q: null, tag: "trip" });
  });

  it("nothing to look for gives null", () => {
    expect(parseSearchTerm("")).toBeNull();
    expect(parseSearchTerm("   ")).toBeNull();
    expect(parseSearchTerm("#")).toBeNull();
  });

  it("is capped", () => {
    expect(parseSearchTerm("ก".repeat(200))?.q).toHaveLength(MAX_SEARCH_CHARS);
  });
});

describe("loadSearchTotals", () => {
  const rpcDb = (data: unknown, error: { message: string } | null = null) => {
    const rpc = vi.fn(async () => ({ data, error }));
    return { db: { rpc } as unknown as SupabaseClient, rpc };
  };

  it("asks the database and reads the satang exactly", async () => {
    const { db, rpc } = rpcDb([{ income: "100.00", expense: "105.50", tx_count: 3 }]);
    expect(await loadSearchTotals(db, "u1", { q: "กาแฟ", tag: null })).toEqual({
      incomeSatang: 10_000,
      expenseSatang: 10_550,
      count: 3,
    });
    expect(rpc).toHaveBeenCalledWith("search_totals", { p_user: "u1", p_q: "กาแฟ", p_tag: null });
  });

  it("is all zero without a row, and throws on a database error", async () => {
    expect(await loadSearchTotals(rpcDb([]).db, "u1", { q: "x", tag: null })).toEqual({
      incomeSatang: 0,
      expenseSatang: 0,
      count: 0,
    });
    await expect(
      loadSearchTotals(rpcDb(null, { message: "boom" }).db, "u1", { q: "x", tag: null }),
    ).rejects.toThrow("search totals: boom");
  });
});

describe("loadSearchItems", () => {
  function chainDb(rows: unknown[]) {
    const calls: [string, ...unknown[]][] = [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "contains", "gte", "lt", "order", "limit"]) {
      q[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return m === "limit" ? Promise.resolve({ data: rows, error: null }) : q;
      };
    }
    return { db: { from: () => q } as unknown as SupabaseClient, calls };
  }

  it("filters by the user, confirmed entries, and the words or the tag", async () => {
    const a = chainDb([]);
    await loadSearchItems(a.db, "u1", { q: "กาแฟ", tag: null }, 5);
    expect(a.calls).toContainEqual(["eq", "user_id", "u1"]);
    expect(a.calls).toContainEqual(["eq", "status", "confirmed"]);
    expect(a.calls).toContainEqual(["ilike", "title", "%กาแฟ%"]);
    expect(a.calls).toContainEqual(["limit", 5]);

    const b = chainDb([]);
    await loadSearchItems(b.db, "u1", { q: null, tag: "ปาร์ตี้" }, 5);
    expect(b.calls).toContainEqual(["contains", "tags", ["ปาร์ตี้"]]);
    expect(b.calls.some((c) => c[0] === "ilike")).toBe(false);
  });

  it("turns the rows into entries for the card", async () => {
    const { db } = chainDb([
      {
        id: "t1",
        type: "expense",
        title: "กาแฟเย็น",
        amount: "60.00",
        occurred_at: "2026-10-10T05:00:00Z",
        source: "text",
        category_id: null,
        categories: null,
        tags: ["ปาร์ตี้"],
      },
    ]);
    const items = await loadSearchItems(db, "u1", { q: "กาแฟ", tag: null }, 5);
    expect(items[0]).toMatchObject({ title: "กาแฟเย็น", amountSatang: 6000, tags: ["ปาร์ตี้"] });
  });
});
