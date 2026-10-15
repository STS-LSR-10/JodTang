import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the x-line-signature header: base64(HMAC-SHA256(channelSecret, rawBody)). */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  channelSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(signatureHeader, "base64");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(expected, given);
}
