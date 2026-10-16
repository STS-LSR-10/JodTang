import { describe, expect, it } from "vitest";
import { applyTxFilters, txFilterSchema } from "./tx-query";

/** Records the calls so we can assert what would be sent to PostgREST. */
function recorder() {
  const calls: [string, string, string][] = [];
  const q = {
    eq: (c: string, v: string) => (calls.push(["eq", c, v]), q),
    gte: (c: string, v: string) => (calls.push(["gte", c, v]), q),
    lt: (c: string, v: string) => (calls.push(["lt", c, v]), q),
    ilike: (c: string, v: string) => (calls.push(["ilike", c, v]), q),
  };
  return { q, calls };
}

describe("applyTxFilters", () => {
  it("applies nothing for empty filters", () => {
    const { q, calls } = recorder();
    applyTxFilters(q, {});
    expect(calls).toEqual([]);
  });

  it("maps each filter to the right column", () => {
    const { q, calls } = recorder();
    applyTxFilters(q, {
      type: "expense",
      from: "2026-10-01T00:00:00+07:00",
      to: "2026-11-01T00:00:00+07:00",
      categoryId: "11111111-1111-1111-1111-111111111111",
      q: "กาแฟ",
    });
    expect(calls).toEqual([
      ["eq", "type", "expense"],
      ["gte", "occurred_at", "2026-10-01T00:00:00+07:00"],
      ["lt", "occurred_at", "2026-11-01T00:00:00+07:00"],
      ["eq", "category_id", "11111111-1111-1111-1111-111111111111"],
      ["ilike", "title", "%กาแฟ%"],
    ]);
  });

  it("matches search text literally (wildcards are stripped)", () => {
    const { q, calls } = recorder();
    applyTxFilters(q, { q: "50%_off\\" });
    expect(calls).toEqual([["ilike", "title", "%50  off%"]]);
  });

  it("skips a search that is only wildcards", () => {
    const { q, calls } = recorder();
    applyTxFilters(q, { q: "%%" });
    expect(calls).toEqual([]);
  });
});

describe("txFilterSchema", () => {
  it("rejects a bad type, date or category id", () => {
    expect(txFilterSchema.safeParse({ type: "other" }).success).toBe(false);
    expect(txFilterSchema.safeParse({ from: "yesterday" }).success).toBe(false);
    expect(txFilterSchema.safeParse({ categoryId: "abc" }).success).toBe(false);
  });

  it("accepts a normal filter", () => {
    expect(txFilterSchema.safeParse({ type: "income", from: "2026-10-01T00:00:00Z" }).success).toBe(
      true,
    );
  });
});
