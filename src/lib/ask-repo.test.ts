import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { ASK_WAIT_MINUTES, clearAskWait, isAskWaitLive, startAskWait } from "./ask-repo";

function fakeDb(row: unknown, error: { message: string } | null = null) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "delete"]) {
    chain[op] = (...args: unknown[]) => (calls.push({ op, args }), chain);
  }
  chain.maybeSingle = async () => ({ data: row, error });
  chain.upsert = async (...args: unknown[]) => (calls.push({ op: "upsert", args }), { error });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ error });
  return { db: { from: () => chain } as unknown as SupabaseClient, calls };
}
const NOW = new Date("2026-10-30T05:00:00Z");

describe("ask wait", () => {
  it("opens for a few minutes, one row per person", async () => {
    const { db, calls } = fakeDb(null);
    await startAskWait(db, "u1", NOW);
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.args[0]).toEqual({
      user_id: "u1",
      expires_at: new Date(NOW.getTime() + ASK_WAIT_MINUTES * 60_000).toISOString(),
    });
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id" });
  });

  it("is live until it expires, and not live without a row", async () => {
    const live = { expires_at: new Date(NOW.getTime() + 60_000).toISOString() };
    const old = { expires_at: new Date(NOW.getTime() - 60_000).toISOString() };
    expect(await isAskWaitLive(fakeDb(live).db, "u1", NOW)).toBe(true);
    expect(await isAskWaitLive(fakeDb(old).db, "u1", NOW)).toBe(false);
    expect(await isAskWaitLive(fakeDb(null).db, "u1", NOW)).toBe(false);
  });

  it("is quietly not live when the table cannot be read (migration not run)", async () => {
    expect(await isAskWaitLive(fakeDb(null, { message: "no such table" }).db, "u1", NOW)).toBe(
      false,
    );
  });

  it("a failed start is reported, a failed clear is not", async () => {
    await expect(startAskWait(fakeDb(null, { message: "boom" }).db, "u1", NOW)).rejects.toThrow(
      "start ask wait: boom",
    );
    await expect(clearAskWait(fakeDb(null, { message: "boom" }).db, "u1")).resolves.toBeUndefined();
  });
});
