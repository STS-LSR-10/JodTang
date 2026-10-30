import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname);

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

const all = routes(ROOT).map((file) => ({
  path: relative(ROOT, file).replace(/\\/g, "/"),
  source: readFileSync(file, "utf8"),
}));

/**
 * Routes that do not sit behind the signed-in session, and why. A new route that is in neither list
 * fails this test, so nobody can add an endpoint that gives out data and forget the PIN lock.
 */
const NOT_SESSION_ROUTES: Record<string, string> = {
  "line/webhook/route.ts": "LINE calls it; checked by the LINE signature",
  "stripe/webhook/route.ts": "Stripe calls it; checked by the Stripe signature",
  "cron/reminders/route.ts": "the scheduler calls it; checked by CRON_SECRET",
  "cron/recurring/route.ts": "the scheduler calls it; checked by CRON_SECRET",
  "cron/user-reminders/route.ts": "the scheduler calls it; checked by CRON_SECRET",
  "auth/liff/route.ts": "signs in with a LINE ID token (issues the session)",
  "split-bill/qr/[token]/route.ts":
    "LINE fetches the picture for the chat; the only key is the random token of one share (a 404 otherwise)",
  "export/download/route.ts":
    "a signed, short-lived link token made by /api/export/link (which is locked)",
};

describe("the PIN lock covers every API route", () => {
  it("each route either uses requireUser or is a known non-session route", () => {
    const unknown = all
      .filter((r) => !r.source.includes("requireUser(") && !(r.path in NOT_SESSION_ROUTES))
      .map((r) => r.path);
    expect(unknown).toEqual([]);
  });

  it("the known non-session routes still exist (the list does not rot)", () => {
    const paths = new Set(all.map((r) => r.path));
    for (const p of Object.keys(NOT_SESSION_ROUTES)) expect(paths.has(p), p).toBe(true);
  });

  it("only the PIN endpoints may skip the lock", () => {
    const skipping = all.filter((r) => r.source.includes("allowLocked")).map((r) => r.path);
    expect(skipping.sort()).toEqual(
      [
        "pin/disable/route.ts",
        "pin/reset/route.ts",
        "pin/set/route.ts",
        "pin/status/route.ts",
        "pin/touch/route.ts",
        "pin/unlock/route.ts",
      ].sort(),
    );
  });

  it("every other route calls requireUser with the lock on", () => {
    const wrong = all
      .filter((r) => !r.path.startsWith("pin/") && r.source.includes("requireUser("))
      .filter((r) => /requireUser\(\s*request\s*,/.test(r.source))
      .map((r) => r.path);
    expect(wrong).toEqual([]);
  });

  it("the export link route (which makes the download token) is behind the lock", () => {
    const link = all.find((r) => r.path === "export/link/route.ts");
    expect(link?.source).toContain("requireUser(request)");
  });
});
