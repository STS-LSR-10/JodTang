import { afterEach, describe, expect, it, vi } from "vitest";
import { log, redact, safeFields, safeMessage } from "./log";

describe("redact", () => {
  it.each([
    ["user Uabcdef0123456789abcdef0123456789 failed", "user [line-id] failed"],
    ["row 11111111-2222-3333-4444-555555555555 missing", "row [uuid] missing"],
    ["call a@b.co now", "call [email] now"],
    ["acct 123-4-56789-0 and 081 234 5678", "acct [digits] and [digits]"],
    ["Bearer abc.def-ghi_123 sent", "Bearer [token] sent"],
    ["token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl end", "token [token] end"],
    ["hash 0123456789abcdef0123456789abcdef01234567 ok", "hash [hex] ok"],
  ])("%s", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it("keeps harmless text and short numbers", () => {
    expect(redact("insert transaction: status 409, 3 retries")).toBe(
      "insert transaction: status 409, 3 retries",
    );
  });

  it("collapses whitespace and truncates", () => {
    expect(redact("a \n\n  b")).toBe("a b");
    expect(redact("x".repeat(500)).length).toBeLessThanOrEqual(301);
  });

  it("scrubs a realistic Postgres error that quotes row values", () => {
    const msg =
      'duplicate key value violates unique constraint "slips_user_id_slip_ref_key" Key (user_id, slip_ref)=(11111111-2222-3333-4444-555555555555, 20261014093000123) already exists.';
    const out = redact(msg);
    expect(out).not.toMatch(/11111111/);
    expect(out).not.toMatch(/20261014093000123/);
    expect(out).toContain("duplicate key value");
  });
});

describe("safeFields", () => {
  it("drops sensitive-looking keys and undefined values, redacts strings", () => {
    expect(
      safeFields({
        bucket: "chat",
        status: 429,
        ok: false,
        text: "กาแฟ 30",
        lineUserId: "U" + "a".repeat(32),
        authorization: "Bearer x",
        note: undefined,
        detail: "id 11111111-2222-3333-4444-555555555555",
      }),
    ).toEqual({ bucket: "chat", status: 429, ok: false, detail: "id [uuid]" });
  });
});

describe("safeMessage", () => {
  it("redacts error text and survives non-errors", () => {
    expect(safeMessage(new Error("bad U" + "a".repeat(32)))).toBe("bad [line-id]");
    expect(safeMessage("weird")).toBe("unknown error");
  });
});

describe("log", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one JSON line per event without leaking the raw error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.error("insert_failed", new Error("key (user_id)=(11111111-2222-3333-4444-555555555555)"), {
      table: "transactions",
      title: "secret title",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: "error", event: "insert_failed", table: "transactions" });
    expect(line).not.toContain("11111111");
    expect(line).not.toContain("secret title");
  });
});
