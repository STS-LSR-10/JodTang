import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EraseScope } from "@/lib/data-reset";

const erased: EraseScope[] = [];
let limited = false;

vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () =>
    limited ? Response.json({ error: "ช้าลงหน่อย" }, { status: 429 }) : null,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/data-reset", async (original) => ({
  ...(await original<typeof import("@/lib/data-reset")>()),
  previewErase: async (_db: unknown, _u: string, scope: EraseScope) => ({
    entries: scope.kind === "all" ? 10 : 3,
    transfers: 0,
    debts: 0,
    goalDeposits: 0,
    files: 0,
    keptShared: 0,
  }),
  monthsWithData: async () => [{ month: "2026-10", entries: 3, transfers: 0 }],
  eraseData: async (_db: unknown, _u: string, scope: EraseScope) => {
    erased.push(scope);
    return { entries: 3, transfers: 0, debts: 0, goalDeposits: 0, filesRemoved: 0 };
  },
}));

import { GET, POST } from "./route";

const get = (qs = "") => GET(new Request(`https://app.example.com/api/account/erase${qs}`));
const post = (body: unknown) =>
  POST(
    new Request("https://app.example.com/api/account/erase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  erased.length = 0;
  limited = false;
});

describe("GET /api/account/erase", () => {
  it("without a scope: the months that have something to delete", async () => {
    expect(await (await get()).json()).toEqual({
      months: [{ month: "2026-10", entries: 3, transfers: 0 }],
    });
  });

  it("previews everything or one month, deleting nothing", async () => {
    expect((await (await get("?scope=all")).json()).entries).toBe(10);
    expect((await (await get("?scope=month&month=2026-10")).json()).entries).toBe(3);
    expect(erased).toHaveLength(0);
  });

  it("a bad scope or month is a 400", async () => {
    expect((await get("?scope=everything")).status).toBe(400);
    expect((await get("?scope=month")).status).toBe(400);
    expect((await get("?scope=month&month=2026-13")).status).toBe(400);
  });
});

describe("POST /api/account/erase", () => {
  it("everything: needs the exact phrase, and keeps balances unless told not to", async () => {
    expect((await post({ scope: "all", keepBalance: true, confirm: "ล้าง" })).status).toBe(400);
    expect((await post({ scope: "all", keepBalance: true, confirm: "" })).status).toBe(400);
    expect(erased).toHaveLength(0);

    expect((await post({ scope: "all", keepBalance: true, confirm: "ล้างประวัติ" })).status).toBe(
      200,
    );
    expect(
      (await post({ scope: "all", keepBalance: false, confirm: " ล้าง ประวัติ " })).status,
    ).toBe(200);
    expect((await post({ scope: "all", confirm: "ล้างประวัติ" })).status).toBe(200); // default: keep
    expect(erased).toEqual([
      { kind: "all", keepBalance: true },
      { kind: "all", keepBalance: false },
      { kind: "all", keepBalance: true },
    ]);
  });

  it("a month: the phrase must name that month", async () => {
    expect(
      (await post({ scope: "month", month: "2026-10", confirm: "ลบเดือน ก.ย. 2569" })).status,
    ).toBe(400);
    expect((await post({ scope: "month", month: "2026-10", confirm: "ล้างประวัติ" })).status).toBe(
      400,
    );
    expect(erased).toHaveLength(0);
    const ok = await post({ scope: "month", month: "2026-10", confirm: "ลบเดือน ต.ค. 2569" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, entries: 3 });
    expect(erased).toEqual([{ kind: "month", month: "2026-10" }]);
  });

  it("a bad month, a missing phrase or an unknown scope erase nothing", async () => {
    expect((await post({ scope: "month", month: "2026-13", confirm: "ลบเดือน" })).status).toBe(400);
    expect((await post({ scope: "all" })).status).toBe(400);
    expect((await post({ scope: "users", confirm: "ล้างประวัติ" })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect(erased).toHaveLength(0);
  });

  it("is limited per person", async () => {
    limited = true;
    expect((await post({ scope: "all", confirm: "ล้างประวัติ" })).status).toBe(429);
    expect(erased).toHaveLength(0);
  });
});
