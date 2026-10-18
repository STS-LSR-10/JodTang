import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signSession } from "./session";
import { signUnlock, verifyUnlock } from "./unlock-token";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-18T05:00:00Z");

describe("unlock tokens", () => {
  it("a fresh token verifies for its person for 15 minutes", async () => {
    const { token, expiresAt } = await signUnlock("u1", SECRET, NOW);
    expect(expiresAt.toISOString()).toBe("2026-10-18T05:15:00.000Z");
    expect(await verifyUnlock(token, SECRET, "u1", NOW)).toBe(true);
    expect(await verifyUnlock(token, SECRET, "u1", new Date("2026-10-18T05:14:59Z"))).toBe(true);
    expect(await verifyUnlock(token, SECRET, "u1", new Date("2026-10-18T05:15:01Z"))).toBe(false);
  });

  it("never opens somebody else's lock", async () => {
    const { token } = await signUnlock("u1", SECRET, NOW);
    expect(await verifyUnlock(token, SECRET, "u2", NOW)).toBe(false);
  });

  it("a wrong secret, a forged or empty token do not verify", async () => {
    const { token } = await signUnlock("u1", SECRET, NOW);
    expect(await verifyUnlock(token, "x".repeat(40), "u1", NOW)).toBe(false);
    expect(await verifyUnlock("abc.def.ghi", SECRET, "u1", NOW)).toBe(false);
    expect(await verifyUnlock("", SECRET, "u1", NOW)).toBe(false);
  });

  it("a login session cannot stand in for an unlock token, and the other way round", async () => {
    const session = await signSession({ userId: "u1", lineUserId: "U1" }, SECRET, NOW);
    expect(await verifyUnlock(session, SECRET, "u1", NOW)).toBe(false);
    // an unlock-like token with the wrong audience
    const wrong = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u1")
      .setIssuer("jodtang")
      .setAudience("jodtang-liff")
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 600)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifyUnlock(wrong, SECRET, "u1", NOW)).toBe(false);
  });
});
