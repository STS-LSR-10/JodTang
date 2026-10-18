import ExcelJS from "exceljs";
import { HEADERS, TYPE_LABEL, exportDate, exportTime, sourceLabel, type ExportRow } from "./rows";
import { summarizeByCategory, summarizeByMonth } from "./summary";

const HEADER_FILL = "FFCCFBF1"; // brand primary-soft
const MONEY_FORMAT = "#,##0.00";

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FF0F766E" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

const baht = (satang: number) => satang / 100; // display value only; sums are done in satang

/**
 * Build the .xlsx file. Everyone gets the "รายการ" sheet; Plus (`advanced`) also gets totals per
 * category and per month. Cell values are typed (numbers stay numbers, text stays text), so a
 * title that looks like a formula is stored as plain text.
 */
export async function buildXlsx(
  rows: ExportRow[],
  options: { advanced: boolean },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "JodTang";
  wb.created = new Date();

  const list = wb.addWorksheet("รายการ");
  list.columns = [
    { header: HEADERS[0], key: "date", width: 12 },
    { header: HEADERS[1], key: "time", width: 8 },
    { header: HEADERS[2], key: "type", width: 10 },
    { header: HEADERS[3], key: "title", width: 32 },
    { header: HEADERS[4], key: "category", width: 18 },
    { header: HEADERS[5], key: "amount", width: 16, style: { numFmt: MONEY_FORMAT } },
    { header: HEADERS[6], key: "source", width: 14 },
    { header: HEADERS[7], key: "wallet", width: 16 },
  ];
  for (const r of rows) {
    list.addRow({
      date: exportDate(r.date),
      time: exportTime(r.date),
      type: TYPE_LABEL[r.type],
      title: r.title,
      category: r.categoryName ?? "ไม่ระบุหมวด",
      amount: baht(r.amountSatang),
      source: sourceLabel(r.source),
      wallet: r.walletName ?? "",
    });
  }
  styleHeader(list);

  if (options.advanced) {
    const byCategory = wb.addWorksheet("สรุปตามหมวด");
    byCategory.columns = [
      { header: "ประเภท", key: "type", width: 10 },
      { header: "หมวด", key: "category", width: 24 },
      { header: "จำนวนรายการ", key: "count", width: 14 },
      { header: "รวม (บาท)", key: "total", width: 16, style: { numFmt: MONEY_FORMAT } },
    ];
    for (const c of summarizeByCategory(rows)) {
      byCategory.addRow({
        type: TYPE_LABEL[c.type],
        category: c.categoryName,
        count: c.count,
        total: baht(c.totalSatang),
      });
    }
    styleHeader(byCategory);

    const byMonth = wb.addWorksheet("สรุปรายเดือน");
    byMonth.columns = [
      { header: "เดือน", key: "month", width: 10 },
      { header: "รายรับ (บาท)", key: "income", width: 16, style: { numFmt: MONEY_FORMAT } },
      { header: "รายจ่าย (บาท)", key: "expense", width: 16, style: { numFmt: MONEY_FORMAT } },
      { header: "คงเหลือ (บาท)", key: "net", width: 16, style: { numFmt: MONEY_FORMAT } },
    ];
    for (const m of summarizeByMonth(rows)) {
      byMonth.addRow({
        month: m.month,
        income: baht(m.incomeSatang),
        expense: baht(m.expenseSatang),
        net: baht(m.netSatang),
      });
    }
    styleHeader(byMonth);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
