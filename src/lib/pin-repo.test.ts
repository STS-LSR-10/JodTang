import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getSecurity } from "./pin-repo";

function fakeDb(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(patch);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, updates };
}

const NOW = new Date("2026-10-18T05:00:00Z");
const base = {
  pin_hash: "h",
  pin_salt: "s",
  failed_count: 2,
  lock_level: 1,
  locked_until: null,
  reset_requested_at: null,
};

describe("getSecurity", () => {
  it("no row means no PIN", async () => {
    const { db } = fakeDb(null);
    expect(await getSecurity(db, "u1", NOW)).toMatchObject({ hasPin: false, hash: null });
  });

  it("reads the PIN, the counts and the lock", async () => {
    const { db } = fakeDb({ ...base, locked_until: "2026-10-18T05:10:00Z" });
    const s = await getSecurity(db, "u1", NOW);
    expect(s).toMatchObject({ hasPin: true, hash: "h", salt: "s" });
    expect(s.lock).toEqual({ failed: 2, level: 1, lockedUntil: new Date("2026-10-18T05:10:00Z") });
  });

  it("a forgotten-PIN request still inside its 24 hours changes nothing", async () => {
    const { db, updates } = fakeDb({ ...base, reset_requested_at: "2026-10-17T06:00:00Z" });
    const s = await getSecurity(db, "u1", NOW);
    expect(s.hasPin).toBe(true);
    expect(s.resetRequestedAt).toEqual(new Date("2026-10-17T06:00:00Z"));
    expect(updates).toHaveLength(0);
  });

  it("one that has waited its 24 hours removes the PIN, on the spot", async () => {
    const { db, updates } = fakeDb({ ...base, reset_requested_at: "2026-10-17T05:00:00Z" });
    const s = await getSecurity(db, "u1", NOW);
    expect(s.hasPin).toBe(false);
    expect(updates[0]).toMatchObject({
      pin_hash: null,
      pin_salt: null,
      reset_requested_at: null,
      failed_count: 0,
    });
  });
});
