import { describe, expect, it } from "vitest";
import { fromBangkokInputValue, toBangkokInputValue } from "./thai-date";

describe("datetime-local helpers (Bangkok time)", () => {
  it("formats a UTC instant as Bangkok wall time", () => {
    expect(toBangkokInputValue(new Date("2026-10-15T07:30:00Z"))).toBe("2026-10-15T14:30");
    // 17:30 UTC is already the next day in Bangkok
    expect(toBangkokInputValue(new Date("2026-10-15T17:30:00Z"))).toBe("2026-10-16T00:30");
  });

  it("parses back to the same instant", () => {
    const d = new Date("2026-10-15T07:30:00Z");
    expect(fromBangkokInputValue(toBangkokInputValue(d))?.toISOString()).toBe(d.toISOString());
  });

  it("treats the input as Bangkok time", () => {
    expect(fromBangkokInputValue("2026-10-15T00:00")?.toISOString()).toBe(
      "2026-10-14T17:00:00.000Z",
    );
  });

  it.each([
    "",
    "2026-10-15",
    "2026-10-15 14:30",
    "2026-02-30T10:00",
    "2026-10-15T25:00",
    "2026-10-15T10:61",
  ])("rejects %j", (value) => {
    expect(fromBangkokInputValue(value)).toBeNull();
  });
});
