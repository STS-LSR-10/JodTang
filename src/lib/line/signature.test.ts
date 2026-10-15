import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature";

const SECRET = "channel-secret";
const BODY = JSON.stringify({ events: [{ type: "follow" }] });
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("base64");

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifySignature(BODY + " ", sign(BODY), SECRET)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifySignature(BODY, sign(BODY, "other"), SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
    expect(verifySignature(BODY, "not-base64!!", SECRET)).toBe(false);
  });

  it("handles Thai characters in the body", () => {
    const body = JSON.stringify({ text: "กาแฟ 30" });
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
});
