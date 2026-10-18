import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let gate: Response | null = null;
const gateCalls: string[] = [];
vi.mock("@/lib/pin-gate", () => ({
  enforcePin: async (_req: Request, userId: string) => {
    gateCalls.push(userId);
    return gate;
  },
}));

import { requireUser } from "./require-user";
import { signSession } from "./session";

const SECRET = "s".repeat(40);
const ENV_KEYS = [
  "LINE_CHANNEL_ID",
  "LINE_CHANNEL_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_JWT_SECRET",
  "CRON_SECRET",
  "GEMINI_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  gate = null;
  gateCalls.length = 0;
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) process.env[k] = "x";
  process.env.SESSION_JWT_SECRET = SECRET;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const req = (authorization?: string) =>
  new Request("https://example.test/api/x", {
    headers: authorization ? { authorization } : {},
  });

describe("requireUser", () => {
  it("401 without a token", async () => {
    const res = await requireUser(req());
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it("401 with a forged token", async () => {
    const res = await requireUser(req("Bearer abc.def.ghi"));
    expect((res as Response).status).toBe(401);
  });

  it("returns the claims for a valid token", async () => {
    const token = await signSession({ userId: "u-1", lineUserId: "U1" }, SECRET);
    const res = await requireUser(req(`Bearer ${token}`));
    expect(res).toEqual({ userId: "u-1", lineUserId: "U1" });
  });
});

describe("requireUser and the PIN lock", () => {
  it("asks the gate about the signed-in person after the token checks out", async () => {
    const token = await signSession({ userId: "u-1", lineUserId: "U1" }, SECRET);
    await requireUser(req(`Bearer ${token}`));
    expect(gateCalls).toEqual(["u-1"]);
  });

  it("a locked person gets the gate's 423 instead of their claims", async () => {
    gate = Response.json({ locked: true }, { status: 423 });
    const token = await signSession({ userId: "u-1", lineUserId: "U1" }, SECRET);
    const res = await requireUser(req(`Bearer ${token}`));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(423);
  });

  it("the PIN endpoints opt out and still get their claims", async () => {
    gate = Response.json({ locked: true }, { status: 423 });
    const token = await signSession({ userId: "u-1", lineUserId: "U1" }, SECRET);
    const res = await requireUser(req(`Bearer ${token}`), { allowLocked: true });
    expect(res).toEqual({ userId: "u-1", lineUserId: "U1" });
    expect(gateCalls).toEqual([]);
  });

  it("a bad token never reaches the gate", async () => {
    await requireUser(req("Bearer abc.def.ghi"));
    await requireUser(req());
    expect(gateCalls).toEqual([]);
  });
});
