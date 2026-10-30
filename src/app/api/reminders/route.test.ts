import { beforeEach, describe, expect, it, vi } from "vitest";

let plan = "plus";
let active = 0;
const created: Record<string, unknown>[] = [];
const cancelled: string[] = [];
let found = true;
const R = "11111111-1111-4111-8111-111111111111";

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
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/user-reminder-repo", () => ({
  listReminders: async () => Array.from({ length: active }, (_, i) => ({ id: `r${i}` })),
  countActiveReminders: async () => active,
  createReminder: async (_db: unknown, _u: string, input: Record<string, unknown>) => {
    created.push(input);
    return { id: R, body: input.body, remindAt: String(input.remindAt), repeat: input.repeat };
  },
  cancelReminder: async (_db: unknown, _u: string, id: string) => {
    cancelled.push(id);
    return found;
  },
}));

import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

const soon = () => new Date(Date.now() + 3 * 3_600_000).toISOString();
const req = (method: string, body?: unknown) =>
  new Request("https://app.example.com/api/reminders", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  plan = "plus";
  active = 0;
  found = true;
  created.length = 0;
  cancelled.length = 0;
});

describe("GET /api/reminders", () => {
  it("says what the plan allows", async () => {
    active = 3;
    plan = "free";
    expect(await (await GET(req("GET"))).json()).toMatchObject({ limit: 3, canAdd: false });
    plan = "plus";
    expect(await (await GET(req("GET"))).json()).toMatchObject({ limit: 30, canAdd: true });
  });
});

describe("POST /api/reminders", () => {
  it("saves a one-off or a repeating reminder", async () => {
    expect((await POST(req("POST", { body: " จ่ายค่าไฟ ", remindAt: soon() }))).status).toBe(201);
    expect(created[0]).toMatchObject({ body: "จ่ายค่าไฟ", repeat: null });
    expect(
      (await POST(req("POST", { body: "กินยา", remindAt: soon(), repeat: "daily" }))).status,
    ).toBe(201);
    expect(created[1]).toMatchObject({ repeat: "daily" });
  });

  it.each([
    [{ body: "", remindAt: "x" }],
    [{ body: "ก", remindAt: "not a date" }],
    [{ body: "ก", remindAt: "2026-10-29T02:00:00Z", repeat: "yearly" }],
    [{ body: "ก".repeat(201), remindAt: "2026-10-29T02:00:00Z" }],
    [{}],
  ])("%j is refused", async (body) => {
    expect((await POST(req("POST", body))).status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("refuses a time that has gone by and one more than a year ahead", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const far = new Date(Date.now() + 400 * 86_400_000).toISOString();
    expect((await POST(req("POST", { body: "ก", remindAt: past }))).status).toBe(400);
    expect((await POST(req("POST", { body: "ก", remindAt: far }))).status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("Free stops at 3 waiting reminders, Pro at 30, Elite at 100", async () => {
    plan = "free";
    active = 3;
    const free = await POST(req("POST", { body: "ก", remindAt: soon() }));
    expect(free.status).toBe(409);
    expect(await free.json()).toMatchObject({ upgrade: true });
    plan = "plus";
    active = 29;
    expect((await POST(req("POST", { body: "ก", remindAt: soon() }))).status).toBe(201);
    active = 30;
    expect((await POST(req("POST", { body: "ก", remindAt: soon() }))).status).toBe(409);
    plan = "ultimate";
    active = 100;
    expect(await (await POST(req("POST", { body: "ก", remindAt: soon() }))).json()).toMatchObject({
      upgrade: false,
    });
  });
});

describe("DELETE /api/reminders/:id", () => {
  it("cancels the person's own reminder, 404 otherwise", async () => {
    const ok = await DELETE(req("DELETE"), { params: Promise.resolve({ id: R }) });
    expect(ok.status).toBe(200);
    expect(cancelled).toEqual([R]);
    found = false;
    expect((await DELETE(req("DELETE"), { params: Promise.resolve({ id: R }) })).status).toBe(404);
    expect((await DELETE(req("DELETE"), { params: Promise.resolve({ id: "../x" }) })).status).toBe(
      404,
    );
  });
});
