import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe signs `${timestamp}.${rawBody}` with the endpoint secret (HMAC-SHA256, hex). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Verify a `Stripe-Signature` header (`t=…,v1=…[,v1=…]`). Rejects stale timestamps (replays) and
 * compares in constant time. The body must be the exact raw text Stripe sent.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  let timestamp = NaN;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = Number(value);
    else if (key?.trim() === "v1" && value) candidates.push(value.trim());
  }
  if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(signPayload(secret, timestamp, rawBody), "hex");
  return candidates.some((c) => {
    const given = Buffer.from(c, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
