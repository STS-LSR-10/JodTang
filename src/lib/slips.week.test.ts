import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { countSlipsThisWeek } from "./slip-repo";

function fakeDb() {
  const range: { gte?: string; lt?: string } = {};
  const q = {
    select: () => q,
    eq: () => q,
    gte: (_: string, v: string) => ((range.gte = v), q),
    lt: (_: string, v: string) => ((range.lt = v), Promise.resolve({ count: 2, error: null })),
  };
  return { db: { from: () => q } as unknown as SupabaseClient, range };
}

describe("countSlipsThisWeek", () => {
  it("counts from Monday 00:00 to next Monday (Bangkok)", async () => {
    const { db, range } = fakeDb();
    // Sunday 25 Oct 2026, 23:30 Bangkok -> the week of Monday 19 Oct
    expect(await countSlipsThisWeek(db, "u", new Date("2026-10-25T16:30:00Z"))).toBe(2);
    expect(range.gte).toBe("2026-10-18T17:00:00.000Z");
    expect(range.lt).toBe("2026-10-25T17:00:00.000Z");
  });

  it("starts a new week on Monday", async () => {
    const { db, range } = fakeDb();
    // Monday 26 Oct 2026, 00:10 Bangkok
    await countSlipsThisWeek(db, "u", new Date("2026-10-25T17:10:00Z"));
    expect(range.gte).toBe("2026-10-25T17:00:00.000Z");
  });
});
