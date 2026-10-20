import { describe, expect, it } from "vitest";
import { crc16, kindOf, maskPromptPayId, parsePromptPayId, promptPayPayload } from "./promptpay";

describe("crc16", () => {
  it("is CRC-16/CCITT-FALSE (the standard check value)", () => {
    expect(crc16("123456789")).toBe(0x29b1);
    expect(crc16("")).toBe(0xffff);
  });
});

describe("parsePromptPayId", () => {
  it("takes a phone number with dashes or spaces, a national id and an e-wallet id", () => {
    expect(parsePromptPayId("081-234-5678")).toEqual({ id: "0812345678", kind: "phone" });
    expect(parsePromptPayId("081 234 5678")).toEqual({ id: "0812345678", kind: "phone" });
    expect(parsePromptPayId("1-2345-67890-12-3")).toEqual({
      id: "1234567890123",
      kind: "national_id",
    });
    expect(parsePromptPayId("123456789012345")).toEqual({ id: "123456789012345", kind: "ewallet" });
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "abc",
      "12345",
      "1812345678",
      "081234567",
      "08123456789",
      "0812345678a",
    ]) {
      expect(parsePromptPayId(bad), bad).toBeNull();
    }
  });

  it("knows which kind an id is, and masks it", () => {
    expect(kindOf("0812345678")).toBe("phone");
    expect(kindOf("1234567890123")).toBe("national_id");
    expect(kindOf("123456789012345")).toBe("ewallet");
    expect(maskPromptPayId("0812345678")).toBe("081-xxx-5678");
    expect(maskPromptPayId("1234567890123")).toBe("1xxxxxxxxxx23");
    expect(maskPromptPayId("1234567890123")).not.toContain("4567");
  });
});

describe("promptPayPayload", () => {
  const tail = (p: string) => p.slice(-4);
  const body = (p: string) => p.slice(0, -4);

  it("a phone number becomes 0066 + the nine digits, with the amount inside (dynamic QR)", () => {
    const p = promptPayPayload({ id: "0812345678", amountSatang: 30_000 });
    expect(p.startsWith("000201010212")).toBe(true); // version, then "12" = one-time with an amount
    expect(p).toContain("0016A000000677010111"); // the PromptPay application id
    expect(p).toContain("011300668123456785802TH"); // 0066 8123 45678, country TH
    expect(p).toContain("5303764"); // baht
    expect(p).toContain("5406300.00"); // 300.00
    expect(p).not.toContain("0812345678"); // the leading zero is gone
  });

  it("without an amount it is the open (static) kind", () => {
    const p = promptPayPayload({ id: "0812345678" });
    expect(p.startsWith("000201010211")).toBe(true);
    expect(p).not.toContain("5406");
  });

  it("a national id and an e-wallet use their own tags", () => {
    expect(promptPayPayload({ id: "1234567890123" })).toContain("02131234567890123");
    expect(promptPayPayload({ id: "123456789012345" })).toContain("0315123456789012345");
  });

  it("ends with a CRC that matches everything before it", () => {
    for (const input of [
      { id: "0812345678", amountSatang: 12_345 },
      { id: "0812345678" },
      { id: "1234567890123", amountSatang: 1 },
    ]) {
      const p = promptPayPayload(input);
      expect(p.slice(-8, -4)).toBe("6304");
      expect(tail(p)).toBe(crc16(body(p)).toString(16).toUpperCase().padStart(4, "0"));
    }
  });

  it("writes the amount with two decimals, whole baht included", () => {
    expect(promptPayPayload({ id: "0812345678", amountSatang: 100 })).toContain("54041.00");
    expect(promptPayPayload({ id: "0812345678", amountSatang: 33_334 })).toContain("5406333.34");
  });
});
