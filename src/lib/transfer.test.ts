import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";
import { parseTransferText } from "./transfer";

describe("parseTransferText", () => {
  it.each([
    ["โอน 500 เงินสด>ktc", { amountSatang: 50000, from: "เงินสด", to: "ktc" }],
    ["โอน 500 เงินสด > ktc", { amountSatang: 50000, from: "เงินสด", to: "ktc" }],
    ["โอน 1,200.50 จาก เงินสด ไป กสิกร", { amountSatang: 120050, from: "เงินสด", to: "กสิกร" }],
    ["โอนเงิน 2 พัน เงินสด เข้า กสิกร", { amountSatang: 200000, from: "เงินสด", to: "กสิกร" }],
    ["โอน เงินสด → กสิกร 300 บาท", { amountSatang: 30000, from: "เงินสด", to: "กสิกร" }],
    ["โอน 500 จากเงินสด->ktc", { amountSatang: 50000, from: "จากเงินสด", to: "ktc" }],
  ])("%s", (input, expected) => {
    expect(parseTransferText(input)).toEqual(expected);
  });

  it.each([
    "โอนค่าเช่า 5000", // an ordinary expense
    "โอนเงินให้แม่ 500",
    "โอน 500", // no wallets named
    "โอน เงินสด>ktc", // no amount
    "โอน 0 เงินสด>ktc",
    "กาแฟ 50 เงินสด>ktc", // not a transfer word
  ])("%s is not a transfer", (input) => {
    expect(parseTransferText(input)).toBeNull();
  });

  it("is what parseCommand returns, with Thai digits understood", () => {
    expect(parseCommand("โอน ๕๐๐ เงินสด>KTC")).toEqual({
      kind: "transfer",
      amountSatang: 50000,
      from: "เงินสด",
      to: "ktc",
    });
  });
});
