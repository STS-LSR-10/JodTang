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

  it.each([
    ["ตังสะสม", { kind: "points" }],
    ["แต้ม", { kind: "points" }],
    ["รหัสชวน", { kind: "my-code" }],
    ["ใช้รหัส ABCD1234", { kind: "use-code", code: "ABCD1234" }],
    ["ใช้รหัส   abcd1234", { kind: "use-code", code: "ABCD1234" }],
    ["ใช้รหัส", { kind: "use-code-usage" }],
    ["ใช้รหัส ก", { kind: "use-code-usage" }],
    ["ใช้รหัส AB", { kind: "use-code-usage" }],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("returns null for transactions", () => {
    expect(parseCommand("กาแฟ 30")).toBeNull();
    expect(parseCommand("สรุปวันนี้ 30")).toBeNull();
  });
});

describe("parseCommand: summary of a custom range", () => {
  const range = (
    start: [number, number, number | null],
    end: [number, number, number | null] | "today",
  ) => ({
    kind: "summary-range",
    start: { day: start[0], month: start[1], year: start[2] },
    end: end === "today" ? "today" : { day: end[0], month: end[1], year: end[2] },
  });

  it.each([
    ["สรุป 1/10 ถึง 15/10", range([1, 10, null], [15, 10, null])],
    ["สรุป 25/9 - 24/10", range([25, 9, null], [24, 10, null])],
    ["สรุป 25/9-24/10", range([25, 9, null], [24, 10, null])],
    ["สรุป 25/9 – 24/10", range([25, 9, null], [24, 10, null])],
    ["สรุป 1/10 ไป 15/10", range([1, 10, null], [15, 10, null])],
    ["สรุปวันที่ 1/10 ถึงวันที่ 15/10", range([1, 10, null], [15, 10, null])],
    ["สรุป 1/1/2569 ถึง 31/1/2569", range([1, 1, 2569], [31, 1, 2569])],
    ["สรุป 1/10 ถึง วันนี้", range([1, 10, null], "today")],
    ["สรุป ๑/๑๐ ถึง ๑๕/๑๐", range([1, 10, null], [15, 10, null])],
    ["  สรุป   1/10   ถึง   15/10  ", range([1, 10, null], [15, 10, null])],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("a date without the other end shows how to write a range", () => {
    expect(parseCommand("สรุป 1/10")).toEqual({ kind: "summary-range-usage" });
    expect(parseCommand("สรุป 1/10 ถึง")).toEqual({ kind: "summary-range-usage" });
  });

  it("leaves the plain summaries and ordinary entries alone", () => {
    expect(parseCommand("สรุปวันนี้")).toEqual({ kind: "summary", scope: "today" });
    expect(parseCommand("สรุปเดือนนี้")).toEqual({ kind: "summary", scope: "month" });
    expect(parseCommand("สรุปค่าไฟ 500")).toBeNull();
    expect(parseCommand("12/10 ค่าไฟ 1200")).toBeNull();
  });
});

describe("parseCommand: search", () => {
  it.each([
    ["ค้นหา กาแฟ", { kind: "search", term: "กาแฟ" }],
    ["ค้นหา #ปาร์ตี้", { kind: "search", term: "#ปาร์ตี้" }],
    ["ค้นหา   ชานม   ไข่มุก ", { kind: "search", term: "ชานม ไข่มุก" }],
    ["ค้นหา Grab", { kind: "search", term: "Grab" }], // keeps the case it was typed in
    ["ค้นหา", { kind: "search-usage" }],
    ["ค้นหา   ", { kind: "search-usage" }],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("an entry that merely starts with the word is not a search", () => {
    expect(parseCommand("ค้นหาของ 50")).toBeNull();
  });
});
