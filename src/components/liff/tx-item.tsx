import type { ReactNode } from "react";
import type { TxDto } from "@/lib/dto";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";

export function TxItem({ tx, action }: { tx: TxDto; action?: ReactNode }) {
  const income = tx.type === "income";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="h-10 w-1.5 shrink-0 rounded-full"
        style={{ background: tx.categoryColor ?? (income ? "#059669" : "#E11D48") }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tx.title}</p>
        <p className="truncate text-xs text-muted">
          {tx.categoryName ?? "ไม่ระบุหมวด"} · {formatThaiDate(new Date(tx.occurredAt))}
        </p>
      </div>
      <p className={cn("num shrink-0 text-sm font-bold", income ? "text-income" : "text-expense")}>
        {income ? "+" : "-"}฿{formatBaht(tx.amountSatang)}
      </p>
      {action}
    </li>
  );
}
