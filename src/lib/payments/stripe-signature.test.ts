import { describe, expect, it } from "vitest";
import { signPayload, verifyStripeSignature } from "./stripe-signature";

const SECRET = "whsec_test_secret";
const BODY = '{"id":"evt_1","type":"invoice.paid"}';
const NOW = 1_800_000_000;

const header = (t: number, body = BODY, secret = SECRET) =>
  `t=${t},v1=${signPayload(secret, t, body)}`;

describe("verifyStripeSignature", () => {
  it("accepts a correct, fresh signature", () => {
    expect(verifyStripeSignature(BODY, header(NOW), SECRET, NOW)).toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", () => {
    const h = `t=${NOW},v1=${"0".repeat(64)},v1=${signPayload(SECRET, NOW, BODY)}`;
    expect(verifyStripeSignature(BODY, h, SECRET, NOW)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a missing header", () => {
    expect(verifyStripeSignature(BODY + " ", header(NOW), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW, BODY, "whsec_other"), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, "garbage", SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW), "", NOW)).toBe(false);
  });

  it("rejects replays outside the 5 minute window", () => {
    expect(verifyStripeSignature(BODY, header(NOW - 301), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW + 301), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(BODY, header(NOW - 299), SECRET, NOW)).toBe(true);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifyStripeSignature(BODY, `t=${NOW},v1=abcd`, SECRET, NOW)).toBe(false);
  });
});
