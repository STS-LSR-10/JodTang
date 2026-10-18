import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { loadSummaryData } from "./summary-load";

const range = {
  from: new Date("2026-10-01T00:00:00+07:00"),
  to: new Date("2026-10-16T00:00:00+07:00"),
};
const previous = { from: new Date("2026-09-16T00:00:00+07:00"), to: range.from };

function fakeDb(categories: { name: string; total: string }[], fail = false) {
  const rpc = vi.fn(async (name: string, args: { p_from: string }) => {
    if (name === "summary_by_period") {
      const isCurrent = args.p_from === range.from.toISOString();
      return {
        data: [
          isCurrent
            ? { income: "1000.00", expense: "400.00", tx_count: 5 }
            : { income: "0", expense: "200.00", tx_count: 2 },
        ],
        error: null,
      };
    }
    if (fail) return { data: null, error: { message: "boom" } };
    return { data: categories, error: null };
  });
  return { db: { rpc } as unknown as SupabaseClient, rpc };
}

describe("loadSummaryData", () => {
  it("adds up both periods in the database and keeps the three biggest expense categories", async () => {
    const { db, rpc } = fakeDb([
      { name: "ไม่ระบุหมวด", total: "20.00" },
      { name: "อาหาร", total: "200.00" },
      { name: "เดินทาง", total: "120.00" },
      { name: "ช้อปปิ้ง", total: "60.00" },
    ]);
    const data = await loadSummaryData(db, "u1", range, previous);
    expect(data.current).toEqual({ income: 100_000, expense: 40_000, count: 5 });
    expect(data.previous).toEqual({ income: 0, expense: 20_000, count: 2 });
    expect(data.topExpenses).toEqual([
      { name: "อาหาร", amountSatang: 20_000, percent: 50 },
      { name: "เดินทาง", amountSatang: 12_000, percent: 30 },
      { name: "ช้อปปิ้ง", amountSatang: 6_000, percent: 15 },
    ]);
    // totals for the current period, totals for the previous one, and the category split
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual([
      "spend_by_category",
      "summary_by_period",
      "summary_by_period",
    ]);
  });

  it("has no categories when nothing was spent", async () => {
    const data = await loadSummaryData(fakeDb([]).db, "u1", range, previous);
    expect(data.topExpenses).toEqual([]);
  });

  it("fails loudly when the category query fails", async () => {
    await expect(loadSummaryData(fakeDb([], true).db, "u1", range, previous)).rejects.toThrow(
      "load category totals: boom",
    );
  });
});
