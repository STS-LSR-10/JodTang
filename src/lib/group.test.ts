import { describe, expect, it } from "vitest";
import { canDeleteEntry, parseGroupCommand, summarizePayers } from "./group";

describe("parseGroupCommand", () => {
  it.each([
    ["เปิดสมุดกลุ่ม", { kind: "open" }],
    ["เปิดสมุด", { kind: "open" }],
    ["ปิดสมุดกลุ่ม", { kind: "close" }],
    ["สรุป", { kind: "summary", scope: "month" }],
    ["สรุปกลุ่ม", { kind: "summary", scope: "month" }],
    ["สรุปเดือนนี้", { kind: "summary", scope: "month" }],
    ["สรุปวันนี้", { kind: "summary", scope: "today" }],
    ["ล่าสุด", { kind: "recent" }],
    ["ลบล่าสุด", { kind: "delete-last" }],
    ["ช่วยเหลือ", { kind: "help" }],
    ["  Help  ", { kind: "help" }],
  ])("%s", (input, expected) => {
    expect(parseGroupCommand(input)).toEqual(expected);
  });

  it("an entry needs the word จด in front", () => {
    expect(parseGroupCommand("จด ข้าวเที่ยง 350")).toEqual({
      kind: "record",
      body: "ข้าวเที่ยง 350",
    });
    expect(parseGroupCommand("จด กาแฟ 90,\nขนม 40")).toEqual({
      kind: "record",
      body: "กาแฟ 90,\nขนม 40",
    });
  });

  it.each([
    "กินข้าว 100 ไหม", // ordinary chat with a number
    "ข้าวเที่ยง 350",
    "จด", // nothing to record
    "จดไว้นะ 55", // not "จด " + entry
    "สวัสดีทุกคน",
    "",
    "บิล ใหม่ ค่าไฟ 1250 ทุกวันที่ 15", // a personal command is not a group command
    "หนี้",
    "กระเป๋า",
  ])("%s is ignored", (input) => {
    expect(parseGroupCommand(input)).toBeNull();
  });
});

describe("summarizePayers", () => {
  it("totals, counts and shares, with the names we know", () => {
    const s = summarizePayers(
      [
        { lineUserId: "Ubob", totalSatang: 75_000, entries: 2 },
        { lineUserId: "Uanna", totalSatang: 25_000, entries: 1 },
        { lineUserId: "Ughost", totalSatang: 0, entries: 0 },
      ],
      new Map([
        ["Ubob", "บ๊อบ"],
        ["Uanna", "แอน"],
      ]),
    );
    expect(s.totalSatang).toBe(100_000);
    expect(s.count).toBe(3);
    expect(s.payers.map((p) => [p.name, p.percent])).toEqual([
      ["บ๊อบ", 75],
      ["แอน", 25],
      ["สมาชิกกลุ่ม", 0],
    ]);
  });

  it("an empty group has no shares", () => {
    expect(summarizePayers([], new Map())).toEqual({ totalSatang: 0, count: 0, payers: [] });
  });
});

describe("canDeleteEntry", () => {
  it("the writer or the owner", () => {
    expect(canDeleteEntry({ entryPayer: "Ua", requester: "Ua", requesterIsOwner: false })).toBe(
      true,
    );
    expect(canDeleteEntry({ entryPayer: "Ua", requester: "Ub", requesterIsOwner: true })).toBe(
      true,
    );
    expect(canDeleteEntry({ entryPayer: "Ua", requester: "Ub", requesterIsOwner: false })).toBe(
      false,
    );
  });
});
