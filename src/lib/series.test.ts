import { describe, expect, it } from "vitest";
import { toSatang } from "./money";
import { bucketStarts, fillSeries } from "./series";

// Thu 2026-10-15 15:00 Bangkok
const NOW = new Date("2026-10-15T08:00:00Z");

describe("bucketStarts", () => {
  it("6 months ending with the current month", () => {
    const { starts, to } = bucketStarts(NOW, "month");
    expect(starts).toHaveLength(6);
    expect(starts[0]!.toISOString()).toBe("2026-04-30T17:00:00.000Z"); // 1 พ.ค.
    expect(starts[5]!.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 1 ต.ค.
    expect(to.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("crosses a year boundary", () => {
    const { starts } = bucketStarts(new Date("2027-02-10T05:00:00Z"), "month");
    expect(starts[0]!.toISOString()).toBe("2026-08-31T17:00:00.000Z"); // 1 ก.ย. 2026
  });

  it("8 weeks starting on Mondays", () => {
    const { starts, to } = bucketStarts(NOW, "week");
    expect(starts).toHaveLength(8);
    expect(starts[7]!.toISOString()).toBe("2026-10-11T17:00:00.000Z"); // Mon 12 ต.ค.
    expect(starts[6]!.toISOString()).toBe("2026-10-04T17:00:00.000Z"); // Mon 5 ต.ค.
    expect(to.toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("14 days ending today", () => {
    const { starts, to } = bucketStarts(NOW, "day");
    expect(starts).toHaveLength(14);
    expect(starts[13]!.toISOString()).toBe("2026-10-14T17:00:00.000Z");
    expect(starts[0]!.toISOString()).toBe("2026-10-01T17:00:00.000Z"); // 2 ต.ค.
    expect(to.toISOString()).toBe("2026-10-15T17:00:00.000Z");
  });
});

describe("bucketStarts: stepping back whole windows", () => {
  it("months: -1 is the six months before the latest six, and it ends where that one starts", () => {
    const now = bucketStarts(NOW, "month");
    const back = bucketStarts(NOW, "month", -1);
    expect(back.starts).toHaveLength(6);
    expect(back.starts[0]!.toISOString()).toBe("2025-10-31T17:00:00.000Z"); // 1 พ.ย. 2025
    expect(back.starts[5]!.toISOString()).toBe("2026-03-31T17:00:00.000Z"); // 1 เม.ย. 2026
    expect(back.to.toISOString()).toBe(now.starts[0]!.toISOString());
  });

  it("weeks and days: -1 ends where the latest window starts", () => {
    for (const bucket of ["week", "day"] as const) {
      const now = bucketStarts(NOW, bucket);
      const back = bucketStarts(NOW, bucket, -1);
      expect(back.starts).toHaveLength(now.starts.length);
      expect(back.to.toISOString()).toBe(now.starts[0]!.toISOString());
    }
  });

  it("0, a positive number and a fraction never move forward", () => {
    const base = bucketStarts(NOW, "month").to.toISOString();
    expect(bucketStarts(NOW, "month", 0).to.toISOString()).toBe(base);
    expect(bucketStarts(NOW, "month", 2).to.toISOString()).toBe(base);
    expect(bucketStarts(NOW, "month", -0.5).to.toISOString()).toBe(base);
  });
});

describe("fillSeries", () => {
  it("fills empty buckets with zeros and keeps order", () => {
    const { starts } = bucketStarts(NOW, "month");
    const rows = [
      { bucket_start: "2026-09-30T17:00:00+00:00", income: "20000.00", expense: 5000.5 },
      { bucket_start: "2026-07-31T17:00:00+00:00", income: 0, expense: 120 },
    ];
    const series = fillSeries(starts, rows, "month", toSatang);
    expect(series).toHaveLength(6);
    expect(series.map((p) => p.label)).toEqual(["พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค."]);
    expect(series[5]).toMatchObject({ incomeSatang: 2_000_000, expenseSatang: 500_050 });
    expect(series[3]).toMatchObject({ incomeSatang: 0, expenseSatang: 12_000 }); // 1 ส.ค. BKK
    expect(series[2]).toMatchObject({ incomeSatang: 0, expenseSatang: 0 });
    expect(series[0]).toMatchObject({ incomeSatang: 0, expenseSatang: 0 });
  });

  it("ignores rows outside the requested buckets", () => {
    const { starts } = bucketStarts(NOW, "day");
    const rows = [{ bucket_start: "2020-01-01T00:00:00Z", income: 1, expense: 1 }];
    const series = fillSeries(starts, rows, "day", toSatang);
    expect(series.every((p) => p.incomeSatang === 0 && p.expenseSatang === 0)).toBe(true);
  });

  it("day labels are the day of month", () => {
    const { starts } = bucketStarts(NOW, "day");
    const series = fillSeries(starts, [], "day", toSatang);
    expect(series.at(-1)!.label).toBe("15");
    expect(series[0]!.label).toBe("2");
  });
});
