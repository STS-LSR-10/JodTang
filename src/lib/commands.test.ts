import { describe, expect, it } from "vitest";
import { parseCommand } from "./commands";

describe("parseCommand", () => {
  it.each([
    ["ช่วยเหลือ", { kind: "help" }],
    ["Help", { kind: "help" }],
    ["สรุปวันนี้", { kind: "summary", scope: "today" }],
    ["สรุปเดือนนี้", { kind: "summary", scope: "month" }],
    ["ลบล่าสุด", { kind: "delete-latest" }],
    ["แก้ล่าสุด 45", { kind: "edit-latest", amountSatang: 4500 }],
    ["แก้ล่าสุด ๔๕.๕๐ บาท", { kind: "edit-latest", amountSatang: 4550 }],
    ["แก้ล่าสุด 1,200", { kind: "edit-latest", amountSatang: 120_000 }],
    ["แก้ล่าสุด 2k", { kind: "edit-latest", amountSatang: 200_000 }],
    ["แก้ล่าสุด", { kind: "edit-latest-usage" }],
    ["แก้ล่าสุด abc", { kind: "edit-latest-usage" }],
    ["แก้ล่าสุด 0", { kind: "edit-latest-usage" }],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("returns null for transactions", () => {
    expect(parseCommand("กาแฟ 30")).toBeNull();
    expect(parseCommand("สรุปวันนี้ 30")).toBeNull();
  });
});
