import { beforeEach, describe, expect, it, vi } from "vitest";
import { signUnlock } from "@/lib/auth/unlock-token";
import type { Security } from "@/lib/pin-repo";
import type { PinAttempt } from "@/lib/pin-service";

const SECRET = "s".repeat(40);
let plan = "plus";
let security: Security;
let attempt: PinAttempt = { ok: true };
let limited = false;
let pushFails = false;
const saved: { hash: string; salt: string }[] = [];
const cleared: string[] = [];
const resets: (Date | null)[] = [];
const pushed: unknown[][] = [];
const attemptsFor: string[] = [];

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ SESSION_JWT_SECRET: SECRET, LINE_CHANNEL_ACCESS_TOKEN: "t" }),
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ userId: "u1", lineUserId: "U1" }),
}));
vi.mock("@/lib/slip-repo", () => ({
  getUserPlanRow: async () => ({ plan, plan_expires_at: null }),
}));
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  limitOr429: async () =>
    limited ? Response.json({ error: "ช้าลงหน่อย" }, { status: 429 }) : null,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/pin-repo", () => ({
  getSecurity: async () => security,
  savePin: async (_db: unknown, _u: string, pin: { hash: string; salt: string }) => {
    saved.push(pin);
  },
  clearPin: async (_db: unknown, userId: string) => {
    cleared.push(userId);
  },
  setResetRequested: async (_db: unknown, _u: string, at: Date | null) => {
    resets.push(at);
  },
}));
vi.mock("@/lib/pin-service", () => ({
  attemptPin: async (_db: unknown, _u: string, pin: string) => {
    attemptsFor.push(pin);
    return attempt;
  },
}));
vi.mock("@/lib/line/client", () => ({
  createLineClient: () => ({
    push: async (...args: unknown[]) => {
      if (pushFails) throw new Error("blocked");
      pushed.push(args);
    },
  }),
}));

import { POST as DISABLE } from "./disable/route";
import { DELETE as RESET_CANCEL, POST as RESET } from "./reset/route";
import { POST as SET } from "./set/route";
import { GET as STATUS } from "./status/route";
import { POST as TOUCH } from "./touch/route";
import { POST as UNLOCK } from "./unlock/route";

const none: Security = {
  hasPin: false,
  hash: null,
  salt: null,
  lock: { failed: 0, level: 0, lockedUntil: null },
  resetRequestedAt: null,
};
const withPin: Security = { ...none, hasPin: true, hash: "h", salt: "s" };
const post = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/pin/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/pin/status", { headers });

beforeEach(() => {
  plan = "plus";
  security = none;
  attempt = { ok: true };
  limited = false;
  pushFails = false;
  saved.length = 0;
  cleared.length = 0;
  resets.length = 0;
  pushed.length = 0;
  attemptsFor.length = 0;
});

describe("GET /api/pin/status", () => {
  it("no PIN: not required, and a Professional can set one", async () => {
    expect(await (await STATUS(get())).json()).toMatchObject({
      hasPin: false,
      required: false,
      unlocked: true,
      canSet: true,
    });
  });

  it("a PIN set and no unlock token: required and not unlocked", async () => {
    security = withPin;
    expect(await (await STATUS(get())).json()).toMatchObject({
      hasPin: true,
      required: true,
      unlocked: false,
    });
  });

  it("with a valid unlock token it says unlocked", async () => {
    security = withPin;
    const { token } = await signUnlock("u1", SECRET);
    expect(await (await STATUS(get({ "x-unlock": token }))).json()).toMatchObject({
      required: true,
      unlocked: true,
    });
  });

  it("a lapsed plan keeps the PIN but does not require it, and cannot set a new one", async () => {
    security = withPin;
    plan = "free";
    expect(await (await STATUS(get())).json()).toMatchObject({
      hasPin: true,
      required: false,
      unlocked: true,
      canSet: false,
    });
  });

  it("shows a running lock-out and a pending reset", async () => {
    const until = new Date(Date.now() + 600_000);
    security = {
      ...withPin,
      lock: { failed: 0, level: 1, lockedUntil: until },
      resetRequestedAt: new Date(Date.now() - 3_600_000),
    };
    const body = await (await STATUS(get())).json();
    expect(body.lockedUntil).toBe(until.toISOString());
    expect(body.resetAt).toBeTruthy();
  });
});

describe("POST /api/pin/unlock", () => {
  it("the right PIN gives a token that really opens things", async () => {
    security = withPin;
    const res = await UNLOCK(post({ pin: "4827" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
    // and it is accepted by the status endpoint as unlocked
    expect(await (await STATUS(get({ "x-unlock": body.token }))).json()).toMatchObject({
      unlocked: true,
    });
  });

  it("a wrong PIN is a 400 with the tries left; no token", async () => {
    attempt = { ok: false, reason: "wrong", attemptsLeft: 3, lockedUntil: null };
    const res = await UNLOCK(post({ pin: "1111" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ triesLeft: 3 });
  });

  it("the wrong try that triggers a lock, and tries while locked, are a 429 with when it ends", async () => {
    const until = new Date("2026-10-18T05:15:00Z");
    attempt = { ok: false, reason: "wrong", attemptsLeft: 0, lockedUntil: until };
    let res = await UNLOCK(post({ pin: "1111" }));
    expect(res.status).toBe(429);
    expect((await res.json()).lockedUntil).toBe(until.toISOString());
    attempt = { ok: false, reason: "locked", lockedUntil: until };
    res = await UNLOCK(post({ pin: "4827" }));
    expect(res.status).toBe(429);
  });

  it("nothing to unlock when there is no PIN; a missing PIN field is a 400", async () => {
    attempt = { ok: false, reason: "no_pin" };
    expect(await (await UNLOCK(post({ pin: "1234" }))).json()).toEqual({ token: null });
    expect((await UNLOCK(post({}))).status).toBe(400);
  });
});

describe("POST /api/pin/touch", () => {
  it("swaps a valid token for a fresh one", async () => {
    const { token } = await signUnlock("u1", SECRET, new Date(Date.now() - 600_000));
    const res = await TOUCH(post(undefined, { "x-unlock": token }));
    expect(res.status).toBe(200);
    expect((await res.json()).token).not.toBe(token);
  });

  it("no token or an expired one cannot be refreshed", async () => {
    expect((await TOUCH(post())).status).toBe(423);
    const { token } = await signUnlock("u1", SECRET, new Date(Date.now() - 20 * 60_000));
    expect((await TOUCH(post(undefined, { "x-unlock": token }))).status).toBe(423);
  });
});

describe("POST /api/pin/set", () => {
  it("sets a first PIN: stored as a hash, never the PIN, and answers with an unlock token", async () => {
    const res = await SET(post({ pin: "4827", confirmPin: "4827" }));
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBeTruthy();
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain("4827");
    expect(saved[0]?.hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is for Professional and above", async () => {
    plan = "free";
    const res = await SET(post({ pin: "4827", confirmPin: "4827" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ upgrade: true });
    expect(saved).toHaveLength(0);
  });

  it.each([
    [{ pin: "12", confirmPin: "12" }, "4–6"],
    [{ pin: "1234", confirmPin: "1234" }, "เดาง่าย"],
    [{ pin: "0000", confirmPin: "0000" }, "เดาง่าย"],
    [{ pin: "4827", confirmPin: "4828" }, "ไม่ตรง"],
    [{ pin: "48a7", confirmPin: "48a7" }, "4–6"],
  ])("%j is refused", async (body, words) => {
    const res = await SET(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(words);
    expect(saved).toHaveLength(0);
  });

  it("changing needs the current PIN, which is checked like any other try", async () => {
    security = withPin;
    expect((await SET(post({ pin: "4827", confirmPin: "4827" }))).status).toBe(400); // no current
    expect(saved).toHaveLength(0);

    attempt = { ok: false, reason: "wrong", attemptsLeft: 4, lockedUntil: null };
    expect((await SET(post({ pin: "4827", confirmPin: "4827", current: "9999" }))).status).toBe(
      400,
    );
    expect(saved).toHaveLength(0);

    attempt = { ok: true };
    expect((await SET(post({ pin: "4827", confirmPin: "4827", current: "9051" }))).status).toBe(
      200,
    );
    expect(saved).toHaveLength(1);
    expect(attemptsFor).toEqual(["9999", "9051"]);
  });

  it("a locked-out current PIN is a 429", async () => {
    security = withPin;
    attempt = { ok: false, reason: "locked", lockedUntil: new Date() };
    expect((await SET(post({ pin: "4827", confirmPin: "4827", current: "9051" }))).status).toBe(
      429,
    );
  });

  it("is limited per person", async () => {
    limited = true;
    expect((await SET(post({ pin: "4827", confirmPin: "4827" }))).status).toBe(429);
  });
});

describe("POST /api/pin/disable", () => {
  it("needs the right PIN (any plan), then clears it", async () => {
    security = withPin;
    plan = "free";
    expect((await DISABLE(post({ pin: "4827" }))).status).toBe(200);
    expect(cleared).toEqual(["u1"]);
  });

  it("a wrong PIN keeps the lock; a lock-out is a 429", async () => {
    security = withPin;
    attempt = { ok: false, reason: "wrong", attemptsLeft: 2, lockedUntil: null };
    expect((await DISABLE(post({ pin: "1111" }))).status).toBe(400);
    attempt = { ok: false, reason: "locked", lockedUntil: new Date() };
    expect((await DISABLE(post({ pin: "4827" }))).status).toBe(429);
    expect(cleared).toHaveLength(0);
  });
});

describe("forgot my PIN: /api/pin/reset", () => {
  it("starts a 24 hour wait and tells the owner in the chat, with a cancel button", async () => {
    security = withPin;
    const res = await RESET(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(new Date(body.resetAt).getTime() - Date.now()).toBeGreaterThan(23.9 * 3_600_000);
    expect(resets[0]).toBeInstanceOf(Date);
    expect(pushed).toHaveLength(1);
    const [to, messages] = pushed[0] as [string, { text: string; quickReply: unknown }[]];
    expect(to).toBe("U1");
    expect(messages[0]?.text).toContain("24 ชั่วโมง");
    expect(JSON.stringify(messages[0]?.quickReply)).toContain("a=pinx");
  });

  it("does not remove anything now", async () => {
    security = withPin;
    await RESET(post());
    expect(cleared).toHaveLength(0);
  });

  it("asking again just reports the same time; no second message", async () => {
    security = { ...withPin, resetRequestedAt: new Date(Date.now() - 3_600_000) };
    const res = await RESET(post());
    expect((await res.json()).resetAt).toBeTruthy();
    expect(pushed).toHaveLength(0);
    expect(resets).toHaveLength(0);
  });

  it("if the owner cannot be told, the request is not started (the wait would protect nobody)", async () => {
    security = withPin;
    pushFails = true;
    const res = await RESET(post());
    expect(res.status).toBe(502);
    expect(resets.at(-1)).toBeNull();
  });

  it("no PIN: nothing to do; cancelling clears the request; limited per person", async () => {
    expect(await (await RESET(post())).json()).toEqual({ ok: true, resetAt: null });
    await RESET_CANCEL(post());
    expect(resets.at(-1)).toBeNull();
    limited = true;
    security = withPin;
    expect((await RESET(post())).status).toBe(429);
  });
});
