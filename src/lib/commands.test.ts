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

describe("parseCommand: latest entries and spend by category", () => {
  it.each([
    ["ล่าสุด", { kind: "recent" }],
    ["รายการล่าสุด", { kind: "recent" }],
    ["5 รายการล่าสุด", { kind: "recent" }],
    ["๕ รายการล่าสุด", { kind: "recent" }],
    ["สรุปหมวด", { kind: "category-spend" }],
    ["สรุปตามหมวด", { kind: "category-spend" }],
    ["สรุปหมวดหมู่", { kind: "category-spend" }],
    ["  สรุป  หมวด ", null],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("does not take over the neighbouring commands or entries", () => {
    expect(parseCommand("ลบล่าสุด")).toEqual({ kind: "delete-latest" });
    expect(parseCommand("แก้ล่าสุด 45")).toEqual({ kind: "edit-latest", amountSatang: 4500 });
    expect(parseCommand("ล่าสุด 50")).toBeNull();
    expect(parseCommand("สรุปเดือนนี้")).toEqual({ kind: "summary", scope: "month" });
  });
});

describe("parseCommand: yearly summary and month comparison", () => {
  it.each([
    ["สรุปปี", { kind: "year-summary", year: null }],
    ["สรุปรายปี", { kind: "year-summary", year: null }],
    ["สรุปปีนี้", { kind: "year-summary", year: null }],
    ["สรุปปีที่แล้ว", { kind: "year-summary", year: "last" }],
    ["สรุปปีก่อน", { kind: "year-summary", year: "last" }],
    ["สรุปปี 2568", { kind: "year-summary", year: 2568 }],
    ["สรุปปี 2025", { kind: "year-summary", year: 2025 }],
    ["สรุปรายปี ๒๕๖๙", { kind: "year-summary", year: 2569 }],
    ["เทียบเดือน", { kind: "compare-months" }],
    ["เทียบเดือนก่อน", { kind: "compare-months" }],
    ["เปรียบเทียบเดือน", { kind: "compare-months" }],
  ])("%s", (input, expected) => {
    expect(parseCommand(input)).toEqual(expected);
  });

  it("is not confused with the other summaries or with entries", () => {
    expect(parseCommand("สรุปปี 25")).toBeNull();
    expect(parseCommand("สรุปปีใหม่ 500")).toBeNull();
    expect(parseCommand("เทียบเดือน 500")).toBeNull();
    expect(parseCommand("สรุปเดือนนี้")).toEqual({ kind: "summary", scope: "month" });
  });
});

describe("parseCommand: forecast", () => {
  it.each(["พยากรณ์", "พยากรณ์เงิน", "พยากรณ์ปลายเดือน", "พยากรณ์ปลายรอบ", "  พยากรณ์  "])(
    "%s",
    (input) => {
      expect(parseCommand(input)).toEqual({ kind: "forecast" });
    },
  );

  it("an entry that merely mentions the word is not the command", () => {
    expect(parseCommand("พยากรณ์อากาศ 50")).toBeNull();
  });
});

describe("parseCommand: insight", () => {
  it.each(["วิเคราะห์", "วิเคราะห์การใช้จ่าย", "AI Insight", "insight", "  วิเคราะห์  "])(
    "%s",
    (input) => {
      expect(parseCommand(input)).toEqual({ kind: "insight" });
    },
  );

  it("is not taken for an entry that merely starts with the word", () => {
    expect(parseCommand("วิเคราะห์ตลาด 500")).toBeNull();
  });
});
