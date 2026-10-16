import { bangkokParts } from "@/lib/thai-date";
import type { TxType } from "@/lib/types";
import type { ExportRow } from "./rows";

export interface CategorySummary {
  type: TxType;
  categoryName: string;
  totalSatang: number;
  count: number;
}

export interface MonthSummary {
  /** "2026-10" */
  month: string;
  incomeSatang: number;
  expenseSatang: number;
  netSatang: number;
}

/** Totals per (type, category), biggest first within each type. Integer satang only. */
export function summarizeByCategory(rows: ExportRow[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();
  for (const r of rows) {
    const categoryName = r.categoryName ?? "ไม่ระบุหมวด";
    const key = `${r.type}|${categoryName}`;
    const entry = map.get(key) ?? { type: r.type, categoryName, totalSatang: 0, count: 0 };
    entry.totalSatang += r.amountSatang;
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort(
    (a, b) => a.type.localeCompare(b.type) || b.totalSatang - a.totalSatang,
  );
}

/** Income, expense and net per Bangkok month, oldest first. */
export function summarizeByMonth(rows: ExportRow[]): MonthSummary[] {
  const map = new Map<string, MonthSummary>();
  for (const r of rows) {
    const p = bangkokParts(r.date);
    const month = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const entry = map.get(month) ?? { month, incomeSatang: 0, expenseSatang: 0, netSatang: 0 };
    if (r.type === "income") entry.incomeSatang += r.amountSatang;
    else entry.expenseSatang += r.amountSatang;
    entry.netSatang = entry.incomeSatang - entry.expenseSatang;
    map.set(month, entry);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
