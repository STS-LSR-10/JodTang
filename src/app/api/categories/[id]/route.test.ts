import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "free";
let existing: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const overrides: Record<string, unknown>[] = [];
const moved: Record<string, unknown>[] = [];
const deleted: string[] = [];

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  loadCategories: async () => existing,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      update: (row: Record<string, unknown>) => {
        if (table === "categories") updates.push(row);
        else moved.push(row);
        const done = Promise.resolve({ error: null });
        const q: { eq: () => unknown; then: Promise<unknown>["then"] } = {
          eq: () => q,
          then: done.then.bind(done) as Promise<unknown>["then"],
        };
        return q;
      },
      upsert: async (row: Record<string, unknown>) => {
        overrides.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: () => ({
          eq: async () => {
            deleted.push(table);
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import { DELETE, PATCH } from "./route";

const ID = "11111111-1111-1111-1111-111111111111";
const SYS = "22222222-2222-2222-2222-222222222222";
const cat = (over: Record<string, unknown>) => ({
  id: ID,
  user_id: "u1",
  type: "expense",
  name: "แมว",
  icon: "tag",
  color: "#0F766E",
  keywords: [],
  sort_order: 1,
  is_hidden: false,
  ...over,
});
const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://app.example.com/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  plan = "free";
  existing = [
    cat({}),
    cat({ id: SYS, user_id: null, name: "อาหาร", icon: "utensils" }),
    cat({ id: "f1", user_id: null, name: "อื่นๆ" }),
  ];
  updates.length = 0;
  overrides.length = 0;
  moved.length = 0;
  deleted.length = 0;
});

describe("PATCH /api/categories/:id on a category of the person's own", () => {
  it.each([{ name: "แมวน้อย" }, { keywords: ["ทราย"] }, { color: "#112233" }, { emoji: "🐱" }])(
    "Free cannot change what it is: %j -> 403",
    async (body) => {
      const res = await patch(ID, body);
      expect(res.status).toBe(403);
      expect(updates).toHaveLength(0);
    },
  );

  it("Free can still hide and reorder it", async () => {
    expect((await patch(ID, { isHidden: true })).status).toBe(200);
    expect((await patch(ID, { sortOrder: 5 })).status).toBe(200);
    expect(updates).toEqual([{ is_hidden: true }, { sort_order: 5 }]);
  });

  it("Professional sets the emoji, clears it back to the tag, and can edit the rest", async () => {
    plan = "plus";
    await patch(ID, { emoji: "🐱" });
    await patch(ID, { emoji: "" });
    await patch(ID, { emoji: null });
    await patch(ID, { name: "แมวน้อย", color: "#112233" });
    expect(updates).toEqual([
      { icon: "🐱" },
      { icon: "tag" },
      { icon: "tag" },
      { name: "แมวน้อย", color: "#112233" },
    ]);
  });

  it("refuses an emoji that is not exactly one emoji", async () => {
    plan = "plus";
    expect((await patch(ID, { emoji: "ab" })).status).toBe(400);
    expect((await patch(ID, { emoji: "🐱🐶" })).status).toBe(400);
    expect(updates).toHaveLength(0);
  });
});

describe("PATCH /api/categories/:id on a system category", () => {
  it("everyone can still change its words, hiding and order", async () => {
    expect((await patch(SYS, { keywords: ["ก๋วยเตี๋ยว"] })).status).toBe(200);
    expect((await patch(SYS, { isHidden: true })).status).toBe(200);
    expect(overrides).toHaveLength(2);
  });

  it("its emoji, name and colour are shared and cannot be changed, whatever the plan", async () => {
    plan = "ultimate";
    expect((await patch(SYS, { emoji: "🍜" })).status).toBe(400);
    expect((await patch(SYS, { name: "x" })).status).toBe(400);
    expect(overrides).toHaveLength(0);
  });
});

describe("DELETE /api/categories/:id", () => {
  const del = (id: string) =>
    DELETE(new Request(`https://app.example.com/api/categories/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });

  it("Free can delete its own category; the entries move to อื่นๆ", async () => {
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(moved).toEqual([{ category_id: "f1" }]);
    expect(deleted).toEqual(["categories"]);
  });

  it("a system category cannot be deleted", async () => {
    expect((await del(SYS)).status).toBe(400);
    expect(deleted).toHaveLength(0);
  });
});
