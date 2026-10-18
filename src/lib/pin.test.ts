import { describe, expect, it } from "vitest";
import {
  PIN_MAX,
  PIN_MIN,
  RESET_DELAY_HOURS,
  checkPin,
  hashPin,
  isLocked,
  isWeakPin,
  resetDue,
  resetEffectiveAt,
  verifyPin,
} from "./pin";

describe("checkPin", () => {
  it.each(["4827", "90517", "729406", "1357", "2468"])("%s is fine", (pin) => {
    expect(checkPin(pin)).toBe("ok");
  });

  it.each(["", "123", "1234567", "12a4", "12 34", "๑๒๓๔", "-1234", "12.34"])(
    "%j is not 4-6 digits",
    (pin) => {
      expect(checkPin(pin)).toBe("format");
    },
  );

  it.each([1234, null, undefined, {}])("a non-string (%s) is a format error", (pin) => {
    expect(checkPin(pin)).toBe("format");
  });

  it("the length limits are 4 and 6", () => {
    expect([PIN_MIN, PIN_MAX]).toEqual([4, 6]);
  });
});

describe("isWeakPin", () => {
  it.each([
    "0000",
    "1111",
    "999999",
    "1234",
    "2345",
    "123456",
    "4321",
    "9876",
    "654321",
    "1212",
    "123123",
    "4545",
    "787878",
  ])("%s is easy to guess", (pin) => {
    expect(isWeakPin(pin)).toBe(true);
  });

  it.each(["1235", "2580", "1357", "8520", "159753"])("%s is not flagged", (pin) => {
    // 2580 is a straight line on the keypad but not a numeric run; 1235 almost-runs
    expect(isWeakPin(pin)).toBe(false);
  });
});

describe("hashing", () => {
  const pepper = "p".repeat(40);

  it("a PIN verifies against its own hash, and only that PIN", async () => {
    const stored = await hashPin("4827", pepper);
    expect(await verifyPin("4827", stored, pepper)).toBe(true);
    expect(await verifyPin("4828", stored, pepper)).toBe(false);
    expect(await verifyPin("48270", stored, pepper)).toBe(false);
  });

  it("the stored value is not the PIN, and the same PIN hashes differently each time (own salt)", async () => {
    const a = await hashPin("4827", pepper);
    const b = await hashPin("4827", pepper);
    expect(a.hash).not.toContain("4827");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifyPin("4827", b, pepper)).toBe(true);
  });

  it("a different server secret (pepper) does not verify: a copy of the database alone is not enough", async () => {
    const stored = await hashPin("4827", pepper);
    expect(await verifyPin("4827", stored, "q".repeat(40))).toBe(false);
  });

  it("never throws on odd input", async () => {
    const stored = await hashPin("4827", pepper);
    for (const typed of ["", "abc", "1".repeat(50), "4827 "]) {
      expect(await verifyPin(typed, stored, pepper)).toBe(false);
    }
  });
});

describe("locks and resets", () => {
  const now = new Date("2026-10-18T05:00:00Z");

  it("locked only while the lock time is still ahead", () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isLocked({ lockedUntil: new Date("2026-10-18T05:00:01Z") }, now)).toBe(true);
    expect(isLocked({ lockedUntil: new Date("2026-10-18T05:00:00Z") }, now)).toBe(false);
  });

  it("a forgotten-PIN request is due after exactly 24 hours", () => {
    const asked = new Date("2026-10-17T05:00:00Z");
    expect(RESET_DELAY_HOURS).toBe(24);
    expect(resetDue(asked, now)).toBe(true);
    expect(resetDue(new Date("2026-10-17T05:00:01Z"), now)).toBe(false);
    expect(resetDue(null, now)).toBe(false);
    expect(resetEffectiveAt(asked).toISOString()).toBe("2026-10-18T05:00:00.000Z");
  });
});
