import { beforeEach, describe, expect, it, vi } from "vitest";
import { signUnlock } from "@/lib/auth/unlock-token";
import type { Security } from "@/lib/pin-repo";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-18T05:00:00Z");
let security: Security;
let plan = "plus";

vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ SESSION_JWT_SECRET: SECRET }) }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({}) }));
vi.mock("@/lib/pin-repo", () => ({ getSecurity: async () => security }));
vi.mock("@/lib/plan-server", () => ({ getPlanInfo: async () => ({ plan }) }));

import { enforcePin, pinRequired } from "./pin-gate";

const none: Security = {
  hasPin: false,
  hash: null,
  salt: null,
  lock: { failed: 0, level: 0, lockedUntil: null },
  resetRequestedAt: null,
};
const withPin: Security = { ...none, hasPin: true, hash: "h", salt: "s" };
const req = (unlock?: string) =>
  new Request("https://example.test/api/x", { headers: unlock ? { "x-unlock": unlock } : {} });

beforeEach(() => {
  security = withPin;
  plan = "plus";
});

describe("pinRequired", () => {
  it("only with a PIN set on a plan that has the lock", async () => {
    expect(await pinRequired({} as never, "u1", NOW)).toBe(true);
    plan = "ultimate";
    expect(await pinRequired({} as never, "u1", NOW)).toBe(true);
    plan = "free";
    expect(await pinRequired({} as never, "u1", NOW)).toBe(false); // lapsed: saved, not enforced
    security = none;
    plan = "plus";
    expect(await pinRequired({} as never, "u1", NOW)).toBe(false);
  });
});

describe("enforcePin", () => {
  it("no PIN: the request goes on", async () => {
    security = none;
    expect(await enforcePin(req(), "u1", NOW)).toBeNull();
  });

  it("a PIN and no unlock token: 423, with a body the page can recognise", async () => {
    const res = await enforcePin(req(), "u1", NOW);
    expect(res?.status).toBe(423);
    expect(await res?.json()).toMatchObject({ locked: true });
    expect(res?.headers.get("cache-control")).toBe("no-store");
  });

  it("a valid unlock token of this person lets it through", async () => {
    const { token } = await signUnlock("u1", SECRET, NOW);
    expect(await enforcePin(req(token), "u1", NOW)).toBeNull();
  });

  it("an expired token, somebody else's token, or junk does not", async () => {
    const { token } = await signUnlock("u1", SECRET, new Date(NOW.getTime() - 16 * 60_000));
    expect((await enforcePin(req(token), "u1", NOW))?.status).toBe(423);
    const other = await signUnlock("u2", SECRET, NOW);
    expect((await enforcePin(req(other.token), "u1", NOW))?.status).toBe(423);
    expect((await enforcePin(req("junk"), "u1", NOW))?.status).toBe(423);
  });

  it("a lapsed plan is not locked out of their own data", async () => {
    plan = "free";
    expect(await enforcePin(req(), "u1", NOW)).toBeNull();
  });
});
