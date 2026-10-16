import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, signSession, verifySession } from "./session";

const SECRET = "x".repeat(32);
const claims = { userId: "11111111-1111-1111-1111-111111111111", lineUserId: "U123" };
const NOW = new Date("2026-10-15T08:00:00Z");

describe("session", () => {
  it("round-trips the claims", async () => {
    const token = await signSession(claims, SECRET, NOW);
    expect(await verifySession(token, SECRET, NOW)).toEqual(claims);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSession(claims, "y".repeat(32), NOW);
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signSession(claims, SECRET, NOW);
    const later = new Date(NOW.getTime() + (SESSION_TTL_SECONDS + 5) * 1000);
    expect(await verifySession(token, SECRET, later)).toBeNull();
  });

  it("accepts a token just before expiry", async () => {
    const token = await signSession(claims, SECRET, NOW);
    const almost = new Date(NOW.getTime() + (SESSION_TTL_SECONDS - 5) * 1000);
    expect(await verifySession(token, SECRET, almost)).toEqual(claims);
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(claims, SECRET, NOW);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "someone-else", lu: "U999", iss: "jodtang", aud: "jodtang-liff" }),
    ).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, SECRET, NOW)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifySession("not-a-jwt", SECRET, NOW)).toBeNull();
    expect(await verifySession("", SECRET, NOW)).toBeNull();
  });

  it("rejects an unsigned (alg=none) token", async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${enc({ alg: "none", typ: "JWT" })}.${enc({
      sub: claims.userId,
      lu: claims.lineUserId,
      iss: "jodtang",
      aud: "jodtang-liff",
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
    })}.`;
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });
});
