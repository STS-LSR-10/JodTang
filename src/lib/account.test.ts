import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { DELETE_CONFIRM_PHRASE, deleteAccountData, isDeleteConfirmed } from "./account";

describe("isDeleteConfirmed", () => {
  it("accepts the exact phrase, tolerating spaces", () => {
    expect(isDeleteConfirmed(DELETE_CONFIRM_PHRASE)).toBe(true);
    expect(isDeleteConfirmed("  ลบ ข้อมูล ทั้งหมด ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDeleteConfirmed("")).toBe(false);
    expect(isDeleteConfirmed("ลบข้อมูล")).toBe(false);
    expect(isDeleteConfirmed("ลบข้อมูลทั้งหมด!")).toBe(false);
    expect(isDeleteConfirmed("delete")).toBe(false);
  });
});

function fakeDb(pages: string[][], opts: { listError?: boolean; deleteError?: boolean } = {}) {
  const events: string[] = [];
  const queue = [...pages];
  const db = {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => {
          events.push(`list:${bucket}/${prefix}`);
          if (opts.listError) return { data: null, error: { message: "boom" } };
          return { data: (queue.shift() ?? []).map((name) => ({ name })), error: null };
        },
        remove: async (paths: string[]) => {
          events.push(`remove:${paths.join(",")}`);
          return { data: null, error: null };
        },
      }),
    },
    from: (table: string) => ({
      delete: () => ({
        eq: async (column: string, value: string) => {
          events.push(`delete:${table}.${column}=${value}`);
          return { error: opts.deleteError ? { message: "nope" } : null };
        },
      }),
    }),
  };
  return { db: db as unknown as SupabaseClient, events };
}

describe("deleteAccountData", () => {
  it("removes slip files first, then the user row", async () => {
    const { db, events } = fakeDb([["a.jpg", "b.png"]]);
    const res = await deleteAccountData(db, "user-1");
    expect(res).toEqual({ filesRemoved: 2 });
    expect(events).toEqual([
      "list:slips/user-1",
      "remove:user-1/a.jpg,user-1/b.png",
      "delete:users.id=user-1",
    ]);
  });

  it("works for a user with no files", async () => {
    const { db, events } = fakeDb([[]]);
    expect(await deleteAccountData(db, "u")).toEqual({ filesRemoved: 0 });
    expect(events).toEqual(["list:slips/u", "delete:users.id=u"]);
  });

  it("keeps listing until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => `f${i}.jpg`);
    const { db } = fakeDb([full, ["last.jpg"]]);
    expect(await deleteAccountData(db, "u")).toEqual({ filesRemoved: 101 });
  });

  it("does NOT delete the user row when storage fails (so the user can retry)", async () => {
    const { db, events } = fakeDb([[]], { listError: true });
    await expect(deleteAccountData(db, "u")).rejects.toThrow(/list slip files/);
    expect(events.some((e) => e.startsWith("delete:"))).toBe(false);
  });

  it("surfaces a database failure", async () => {
    const { db } = fakeDb([[]], { deleteError: true });
    await expect(deleteAccountData(db, "u")).rejects.toThrow(/delete user/);
  });
});
