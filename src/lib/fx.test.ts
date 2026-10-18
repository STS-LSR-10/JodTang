import { describe, expect, it, vi } from "vitest";
import { convertToSatang, fetchRate, formatForeign, formatRate } from "./fx";

describe("convertToSatang", () => {
  it("1,500 JPY at 0.2335 is ฿350.25", () => {
    expect(convertToSatang(150000, 0.2335)).toBe(35025);
  });

  it("rounds half up to the satang", () => {
    expect(convertToSatang(100, 0.005)).toBe(1); // 0.5 satang rounds up
    expect(convertToSatang(100, 0.0049)).toBe(0); // 0.49 satang rounds down
    expect(convertToSatang(1, 150.5)).toBe(151); // 0.01 unit at ฿150.50 = 150.5 satang
  });

  it("handles large amounts and rates exactly", () => {
    expect(convertToSatang(100_000_000, 35.12345678)).toBe(3_512_345_678);
  });

  it("accepts the rate as a string", () => {
    expect(convertToSatang(20000, "35.5")).toBe(710000);
  });
});

describe("formatting", () => {
  it("the amount and the rate for display", () => {
    expect(formatForeign(150000, "JPY")).toBe("1,500 JPY");
    expect(formatForeign(120050, "USD")).toBe("1,200.50 USD");
    expect(formatRate(0.23351234)).toBe("0.2335");
    expect(formatRate(35.12345)).toBe("35.123");
    expect(formatRate(152.1)).toBe("152.1");
  });
});

const respond = (body: unknown, ok = true) =>
  vi.fn(
    async () => ({ ok, json: async () => body }) as unknown as Response,
  ) as unknown as typeof fetch;

describe("fetchRate", () => {
  it("reads the baht rate and the day it is from", async () => {
    const f = respond({ amount: 1, base: "JPY", date: "2026-10-16", rates: { THB: 0.2335 } });
    expect(await fetchRate("JPY", "2026-10-17", f)).toEqual({
      rate: 0.2335,
      sourceDay: "2026-10-16",
    });
    expect(vi.mocked(f).mock.calls[0]?.[0]).toBe(
      "https://api.frankfurter.dev/v1/2026-10-17?base=JPY&symbols=THB",
    );
  });

  it("asks for the latest rate for today", async () => {
    const f = respond({ date: "2026-10-16", rates: { THB: 1 } });
    await fetchRate("USD", "latest", f);
    expect(vi.mocked(f).mock.calls[0]?.[0]).toContain("/v1/latest?");
  });

  it.each([
    ["an error status", respond({}, false)],
    ["no rate", respond({ date: "2026-10-16", rates: {} })],
    ["a zero rate", respond({ date: "2026-10-16", rates: { THB: 0 } })],
    ["a rate that is text", respond({ date: "2026-10-16", rates: { THB: "0.2" } })],
    ["no date", respond({ rates: { THB: 0.2 } })],
    [
      "a network failure",
      vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    ],
  ])("gives null on %s", async (_name, f) => {
    expect(await fetchRate("JPY", "2026-10-16", f)).toBeNull();
  });
});
