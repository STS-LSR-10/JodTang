import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "free";
let existing: Record<string, unknown>[] = [];
const inserted: Record<string, unknown>[] = [];
let insertError: { code?: string; message: string } | null = null;

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () => null,
}));
vi.mock("@/lib/repo", async (original) => ({
  ...(await original<typeof import("@/lib/repo")>()),
  loadCategories: async () => existing,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              insertError
                ? { data: null, error: insertError }
                : { data: { id: "new" }, error: null },
          }),
        };
      },
    }),
  }),
}));

import { GET, POST } from "./route";

const cat = (over: Record<string, unknown>) => ({
  id: "c1",
  user_id: null,
  type: "expense",
  name: "อาหาร",
  icon: "utensils",
  color: "#0F766E",
  keywords: [],
  sort_order: 1,
  is_hidden: false,
  ...over,
});
const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  plan = "free";
  existing = [cat({})];
  inserted.length = 0;
  insertError = null;
});

describe("POST /api/categories", () => {
  it("is for Pro and above: Free gets a 403 and nothing is saved", async () => {
    const res = await post({ type: "expense", name: "ค่าอาหารแมว" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(inserted).toHaveLength(0);
  });

  it.each(["plus", "ultimate"])("%s creates a category with the chosen emoji", async (p) => {
    plan = p;
    const res = await post({ type: "expense", name: "ค่าอาหารแมว", emoji: "🐱" });
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ user_id: "u1", name: "ค่าอาหารแมว", icon: "🐱" });
  });

  it("without an emoji (or with an empty one) the icon stays the plain tag", async () => {
    plan = "plus";
    await post({ type: "expense", name: "เติมเกม" });
    await post({ type: "expense", name: "เติมเกม2", emoji: "" });
    await post({ type: "expense", name: "เติมเกม3", emoji: null });
    expect(inserted.map((r) => r.icon)).toEqual(["tag", "tag", "tag"]);
  });

  it("refuses an emoji that is not exactly one emoji", async () => {
    plan = "plus";
    for (const emoji of ["ab", "🐱🐶", "ข้าว"]) {
      const res = await post({ type: "expense", name: "x", emoji });
      expect(res.status).toBe(400);
    }
    expect(inserted).toHaveLength(0);
  });

  it("stops at the cap of own categories", async () => {
    plan = "plus";
    existing = Array.from({ length: 50 }, (_, i) =>
      cat({ id: `m${i}`, user_id: "u1", name: `ของฉัน${i}` }),
    );
    const res = await post({ type: "expense", name: "หมวดที่ 51" });
    expect(res.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it("a name already used by that type is a 409", async () => {
    plan = "plus";
    expect((await post({ type: "expense", name: "อาหาร" })).status).toBe(409);
    insertError = { code: "23505", message: "dup" };
    expect((await post({ type: "income", name: "ใหม่" })).status).toBe(409);
  });
});

describe("GET /api/categories", () => {
  it("returns the emoji of a category that has one, and null for icon names", async () => {
    plan = "plus";
    existing = [
      cat({}),
      cat({ id: "c2", user_id: "u1", name: "แมว", icon: "🐱" }),
      cat({ id: "c3", user_id: "u1", name: "ทั่วไป", icon: "tag" }),
    ];
    const res = await GET(new Request("https://app.example.com/api/categories?all=1"));
    const body = (await res.json()) as { items: { name: string; emoji: string | null }[] };
    expect(Object.fromEntries(body.items.map((i) => [i.name, i.emoji]))).toEqual({
      อาหาร: null,
      แมว: "🐱",
      ทั่วไป: null,
    });
  });

  it("is open to Free", async () => {
    const res = await GET(new Request("https://app.example.com/api/categories"));
    expect(res.status).toBe(200);
  });
});
