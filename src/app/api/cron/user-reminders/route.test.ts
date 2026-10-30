import { beforeEach, describe, expect, it, vi } from "vitest";

const ran: string[] = [];
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ CRON_SECRET: "s3cret-s3cret-s3cret", LINE_CHANNEL_ACCESS_TOKEN: "t" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/line/client", () => ({ createLineClient: () => ({ push: async () => undefined }) }));
vi.mock("@/lib/user-reminder-run", () => ({
  runUserReminders: async () => {
    ran.push("run");
    return { claimed: 1, sent: 1, errors: 0 };
  },
}));

import { GET } from "./route";

const call = (auth?: string) =>
  GET(
    new Request("https://app.example.com/api/cron/user-reminders", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

beforeEach(() => {
  ran.length = 0;
});

describe("GET /api/cron/user-reminders", () => {
  it("refuses a call without the secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(ran).toHaveLength(0);
  });

  it("runs the reminders with the secret and reports the counts", async () => {
    const res = await call("Bearer s3cret-s3cret-s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, claimed: 1, sent: 1, errors: 0 });
    expect(ran).toEqual(["run"]);
  });
});
