import { describe, expect, it } from "vitest";
import { formatBaht, satangToString, toSatang } from "./money";

describe("money", () => {
  it.each([
    ["50", 5000],
    ["50.5", 5050],
    ["50.50", 5050],
    ["1,200", 120_000],
    ["0.07", 7],
    ["10.005", 1001], // rounds half up
    ["10.004", 1000],
  ])("toSatang(%j)", (input, expected) => {
    expect(toSatang(input)).toBe(expected);
  });

  it("toSatang accepts numbers without float drift", () => {
    expect(toSatang(0.1 + 0.2)).toBe(30);
    expect(toSatang(19.99)).toBe(1999);
  });

  it("toSatang rejects garbage", () => {
    expect(() => toSatang("abc")).toThrow();
  });

  it("satangToString", () => {
    expect(satangToString(5050)).toBe("50.50");
    expect(satangToString(7)).toBe("0.07");
    expect(satangToString(-1250)).toBe("-12.50");
  });

  it("formatBaht", () => {
    expect(formatBaht(120_000)).toBe("1,200");
    expect(formatBaht(5050)).toBe("50.50");
    expect(formatBaht(2_000_000)).toBe("20,000");
    expect(formatBaht(0)).toBe("0");
  });
});
