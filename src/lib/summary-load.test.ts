import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  loadCategoryCompare,
  loadCategorySpend,
  loadSummaryData,
  loadYearData,
} from "./summary-load";
import { resolveYear } from "./year-summary";

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

describe("loadCategorySpend", () => {
  it("returns every category with its exact satang, biggest first", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { name: "เดินทาง", total: "120.50" },
        { name: "อาหาร", total: "300.00" },
      ],
      error: null,
    }));
    const out = await loadCategorySpend({ rpc } as unknown as SupabaseClient, "u1", range);
    expect(out).toEqual([
      { name: "อาหาร", amountSatang: 30_000 },
      { name: "เดินทาง", amountSatang: 12_050 },
    ]);
    expect(rpc).toHaveBeenCalledWith("spend_by_category", {
      p_user: "u1",
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_type: "expense",
    });
  });

  it("throws on a database error", async () => {
    const rpc = async () => ({ data: null, error: { message: "boom" } });
    await expect(
      loadCategorySpend({ rpc } as unknown as SupabaseClient, "u1", range),
    ).rejects.toThrow("load category spend: boom");
  });
});

describe("loadYearData", () => {
  it("returns the year's totals and one entry per month so far, zero where nothing happened", async () => {
    const year = resolveYear(null, new Date("2026-03-10T05:00:00Z"));
    if (!year.ok) throw new Error("year");
    const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
      if (name === "analytics_series") {
        return {
          data: [
            { bucket_start: "2025-12-31T17:00:00Z", income: "1000.00", expense: "400.00" }, // Jan
            { bucket_start: "2026-02-28T17:00:00Z", income: "0", expense: "250.50" }, // Mar
          ],
          error: null,
        };
      }
      if (name === "summary_by_period") {
        return { data: [{ income: "1000.00", expense: "650.50", tx_count: 6 }], error: null };
      }
      void args;
      return { data: [{ name: "อาหาร", total: "300.00" }], error: null };
    });
    const data = await loadYearData({ rpc } as unknown as SupabaseClient, "u1", year);
    expect(data.summary.current).toEqual({ income: 100_000, expense: 65_050, count: 6 });
    expect(data.months.map((m) => [m.incomeSatang, m.expenseSatang])).toEqual([
      [100_000, 40_000],
      [0, 0], // February: no row
      [0, 25_050],
    ]);
    const series = rpc.mock.calls.find((c) => c[0] === "analytics_series")![1];
    expect(series).toMatchObject({ p_bucket: "month", p_user: "u1" });
  });

  it("throws when the monthly query fails", async () => {
    const year = resolveYear(null, new Date("2026-03-10T05:00:00Z"));
    if (!year.ok) throw new Error("year");
    const rpc = async (name: string) => {
      if (name === "analytics_series") return { data: null, error: { message: "boom" } };
      if (name === "spend_by_category") return { data: [], error: null };
      return { data: [{ income: "0", expense: "0", tx_count: 0 }], error: null };
    };
    await expect(loadYearData({ rpc } as unknown as SupabaseClient, "u1", year)).rejects.toThrow(
      "load monthly totals: boom",
    );
  });
});

describe("loadCategoryCompare", () => {
  it("compares the two spans category by category and adds up each side", async () => {
    const rpc = vi.fn(async (_name: string, args: { p_from: string }) => ({
      data:
        args.p_from === range.from.toISOString()
          ? [{ name: "อาหาร", total: "150.00" }]
          : [
              { name: "อาหาร", total: "100.00" },
              { name: "เดินทาง", total: "40.00" },
            ],
      error: null,
    }));
    const out = await loadCategoryCompare(
      { rpc } as unknown as SupabaseClient,
      "u1",
      range,
      previous,
    );
    expect(out.currentSatang).toBe(15_000);
    expect(out.previousSatang).toBe(14_000);
    expect(out.rows.map((r) => [r.name, r.kind])).toEqual([
      ["อาหาร", "up"],
      ["เดินทาง", "gone"],
    ]);
  });
});
