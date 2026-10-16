import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { exportDate, exportTime, type ExportRow } from "./rows";
import { summarizeByCategory, summarizeByMonth } from "./summary";
import { buildXlsx } from "./xlsx";

const row = (p: Partial<ExportRow> = {}): ExportRow => ({
  date: new Date("2026-10-15T07:30:00Z"), // 14:30 Bangkok
  type: "expense",
  title: "กาแฟ",
  categoryName: "อาหาร",
  amountSatang: 3050,
  source: "text",
  ...p,
});

describe("rows", () => {
  it("formats date and time in Bangkok time", () => {
    const d = new Date("2026-10-15T17:30:00Z"); // already 16 Oct 00:30 in Bangkok
    expect(exportDate(d)).toBe("2026-10-16");
    expect(exportTime(d)).toBe("00:30");
  });
});

describe("csvCell", () => {
  it.each([
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
  ])("quotes %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each(["=SUM(A1:A9)", "+1", "-1", "@cmd", "\tx"])(
    "neutralises a formula start: %j",
    (input) => {
      expect(csvCell(input).startsWith("'") || csvCell(input).startsWith(`"'`)).toBe(true);
    },
  );
});

describe("toCsv", () => {
  it("starts with a BOM, uses CRLF and a Thai header", () => {
    const csv = toCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("วันที่,เวลา,ประเภท,ชื่อรายการ,หมวด,จำนวนเงิน (บาท),ที่มา");
    expect(lines[1]).toBe("2026-10-15,14:30,รายจ่าย,กาแฟ,อาหาร,30.50,ข้อความ");
    expect(lines[2]).toBe("");
  });

  it("keeps amounts exact and handles empty input", () => {
    expect(toCsv([row({ amountSatang: 7 })])).toContain(",0.07,");
    expect(toCsv([]).split("\r\n").filter(Boolean)).toHaveLength(1);
  });

  it("does not let a hostile title run as a formula", () => {
    const csv = toCsv([row({ title: '=HYPERLINK("http://evil","x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });
});

describe("summaries", () => {
  const rows = [
    row({ amountSatang: 10_000, categoryName: "อาหาร" }),
    row({ amountSatang: 5050, categoryName: "อาหาร" }),
    row({ amountSatang: 90_000, categoryName: "เดินทาง" }),
    row({ type: "income", amountSatang: 2_000_000, categoryName: "เงินเดือน" }),
    row({ amountSatang: 1000, categoryName: null, date: new Date("2026-09-30T08:00:00Z") }),
  ];

  it("by category: exact totals, biggest first within a type", () => {
    const s = summarizeByCategory(rows);
    const expenses = s.filter((c) => c.type === "expense");
    expect(expenses.map((c) => [c.categoryName, c.totalSatang, c.count])).toEqual([
      ["เดินทาง", 90_000, 1],
      ["อาหาร", 15_050, 2],
      ["ไม่ระบุหมวด", 1000, 1],
    ]);
    expect(s.find((c) => c.type === "income")?.totalSatang).toBe(2_000_000);
  });

  it("by month: oldest first with net", () => {
    const m = summarizeByMonth(rows);
    expect(m.map((x) => x.month)).toEqual(["2026-09", "2026-10"]);
    expect(m[1]).toMatchObject({
      incomeSatang: 2_000_000,
      expenseSatang: 105_050,
      netSatang: 1_894_950,
    });
  });
});

describe("buildXlsx", () => {
  async function read(buf: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
  }

  it("free: one sheet with typed amounts", async () => {
    const wb = await read(await buildXlsx([row()], { advanced: false }));
    expect(wb.worksheets.map((s) => s.name)).toEqual(["รายการ"]);
    const sheet = wb.getWorksheet("รายการ");
    expect(sheet?.getRow(1).getCell(4).value).toBe("ชื่อรายการ");
    expect(sheet?.getRow(2).getCell(6).value).toBe(30.5);
    expect(sheet?.getRow(2).getCell(4).value).toBe("กาแฟ");
  });

  it("plus: adds category and month sheets", async () => {
    const wb = await read(await buildXlsx([row()], { advanced: true }));
    expect(wb.worksheets.map((s) => s.name)).toEqual(["รายการ", "สรุปตามหมวด", "สรุปรายเดือน"]);
    expect(wb.getWorksheet("สรุปรายเดือน")?.getRow(2).getCell(3).value).toBe(30.5);
  });

  it("stores a formula-looking title as plain text", async () => {
    const wb = await read(await buildXlsx([row({ title: "=1+1" })], { advanced: false }));
    const cell = wb.getWorksheet("รายการ")?.getRow(2).getCell(4);
    expect(cell?.value).toBe("=1+1");
    expect(cell?.type).toBe(ExcelJS.ValueType.String);
  });
});
