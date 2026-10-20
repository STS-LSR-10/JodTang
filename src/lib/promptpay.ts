/**
 * PromptPay "Thai QR" payloads (EMVCo): a person's phone number, national id or e-wallet id, with the
 * amount inside so the banking app fills it in after scanning. Built here, so nobody's number is sent
 * to an outside service.
 */

export type PromptPayKind = "phone" | "national_id" | "ewallet";

/** CRC-16/CCITT-FALSE: polynomial 0x1021, start 0xFFFF (the check value for "123456789" is 0x29B1). */
export function crc16(input: string): number {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** A PromptPay target as typed: "081-234-5678", "0812345678", a 13-digit id or a 15-digit e-wallet id. */
export function parsePromptPayId(input: string): { id: string; kind: PromptPayKind } | null {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 10 && digits.startsWith("0")) return { id: digits, kind: "phone" };
  if (digits.length === 13) return { id: digits, kind: "national_id" };
  if (digits.length === 15) return { id: digits, kind: "ewallet" };
  return null;
}

export function kindOf(id: string): PromptPayKind {
  return id.length === 10 ? "phone" : id.length === 13 ? "national_id" : "ewallet";
}

/** "081-xxx-5678" / "1-xxxx-xxxxx-xx-2": enough to recognise it, not enough to copy. */
export function maskPromptPayId(id: string): string {
  if (id.length === 10) return `${id.slice(0, 3)}-xxx-${id.slice(6)}`;
  return `${id.slice(0, 1)}${"x".repeat(Math.max(0, id.length - 3))}${id.slice(-2)}`;
}

const tlv = (tag: string, value: string) =>
  `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** The text a QR code carries. `amountSatang` fixes the amount (the person cannot change it). */
export function promptPayPayload(input: { id: string; amountSatang?: number }): string {
  const kind = kindOf(input.id);
  const target =
    kind === "phone"
      ? tlv("01", `0066${input.id.slice(1)}`)
      : kind === "national_id"
        ? tlv("02", input.id)
        : tlv("03", input.id);
  const amount =
    input.amountSatang !== undefined && input.amountSatang > 0
      ? tlv("54", (input.amountSatang / 100).toFixed(2))
      : "";
  const body =
    tlv("00", "01") +
    tlv("01", amount ? "12" : "11") +
    tlv("29", tlv("00", "A000000677010111") + target) +
    tlv("58", "TH") +
    tlv("53", "764") +
    amount +
    "6304";
  return body + crc16(body).toString(16).toUpperCase().padStart(4, "0");
}
