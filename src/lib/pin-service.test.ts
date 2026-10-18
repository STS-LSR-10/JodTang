import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPin } from "./pin";
import type { Attempt, Security } from "./pin-repo";

const PEPPER = "p".repeat(40);
const NOW = new Date("2026-10-18T05:00:00Z");
let security: Security;
let attempt: Attempt;
const events: string[] = [];

vi.mock("@/lib/pin-repo", () => ({
  getSecurity: async () => security,
  takeAttempt: async () => {
    events.push("take");
    return attempt;
  },
  clearAttempts: async () => {
    events.push("clear");
  },
}));

import { attemptPin } from "./pin-service";

beforeEach(async () => {
  events.length = 0;
  const stored = await hashPin("4827", PEPPER);
  security = {
    hasPin: true,
    hash: stored.hash,
    salt: stored.salt,
    lock: { failed: 0, level: 0, lockedUntil: null },
    resetRequestedAt: null,
  };
  attempt = { allowed: true, attemptsLeft: 4, lockedUntil: null };
});

describe("attemptPin", () => {
  it("the right PIN counts the try first, then clears the count", async () => {
    expect(await attemptPin({} as never, "u1", "4827", PEPPER, NOW)).toEqual({ ok: true });
    expect(events).toEqual(["take", "clear"]);
  });

  it("a wrong PIN says how many tries are left and clears nothing", async () => {
    expect(await attemptPin({} as never, "u1", "1111", PEPPER, NOW)).toEqual({
      ok: false,
      reason: "wrong",
      attemptsLeft: 4,
      lockedUntil: null,
    });
    expect(events).toEqual(["take"]);
  });

  it("the wrong try that starts a lock reports it", async () => {
    attempt = { allowed: true, attemptsLeft: 0, lockedUntil: new Date("2026-10-18T05:15:00Z") };
    const r = await attemptPin({} as never, "u1", "1111", PEPPER, NOW);
    expect(r).toMatchObject({ ok: false, reason: "wrong", attemptsLeft: 0 });
    expect((r as { lockedUntil: Date }).lockedUntil.toISOString()).toBe("2026-10-18T05:15:00.000Z");
  });

  it("while locked even the right PIN is not accepted, and is not checked at all", async () => {
    attempt = { allowed: false, attemptsLeft: 0, lockedUntil: new Date("2026-10-18T05:10:00Z") };
    const r = await attemptPin({} as never, "u1", "4827", PEPPER, NOW);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
    expect(events).toEqual(["take"]);
  });

  it("no PIN set: nothing to check and no try is counted", async () => {
    security = { ...security, hasPin: false, hash: null, salt: null };
    expect(await attemptPin({} as never, "u1", "4827", PEPPER, NOW)).toEqual({
      ok: false,
      reason: "no_pin",
    });
    expect(events).toEqual([]);
  });
});
