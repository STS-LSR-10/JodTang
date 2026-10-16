import { describe, expect, it } from "vitest";
import { EXPORT_LINK_TTL_SECONDS } from "@/lib/config";
import { signExportToken, verifyExportToken } from "./export-token";
import { signSession } from "./session";

const SECRET = "x".repeat(32);
const NOW = new Date("2026-10-16T08:00:00Z");
const claims = {
  userId: "11111111-1111-1111-1111-111111111111",
  format: "xlsx" as const,
  filters: { type: "expense" as const, q: "กาแฟ" },
};

describe("export token", () => {
  it("round-trips user, format and filters", async () => {
    const token = await signExportToken(claims, SECRET, NOW);
    expect(await verifyExportToken(token, SECRET, NOW)).toEqual(claims);
  });

  it("expires after the link TTL", async () => {
    const token = await signExportToken(claims, SECRET, NOW);
    const late = new Date(NOW.getTime() + (EXPORT_LINK_TTL_SECONDS + 5) * 1000);
    expect(await verifyExportToken(token, SECRET, late)).toBeNull();
  });

  it("rejects another secret and garbage", async () => {
    const token = await signExportToken(claims, SECRET, NOW);
    expect(await verifyExportToken(token, "y".repeat(32), NOW)).toBeNull();
    expect(await verifyExportToken("nope", SECRET, NOW)).toBeNull();
  });

  it("a normal session token cannot be used as an export link", async () => {
    const session = await signSession({ userId: claims.userId, lineUserId: "U1" }, SECRET, NOW);
    expect(await verifyExportToken(session, SECRET, NOW)).toBeNull();
  });

  it("is a different audience from sessions (an export token is no session)", async () => {
    const { verifySession } = await import("./session");
    const token = await signExportToken(claims, SECRET, NOW);
    expect(await verifySession(token, SECRET, NOW)).toBeNull();
  });
});
