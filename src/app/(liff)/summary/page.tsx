"use client";

import Link from "next/link";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { TxItem } from "@/components/liff/tx-item";
import { useApi } from "@/components/liff/liff-provider";
import type { TxDto } from "@/lib/dto";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";

interface SummaryResponse {
  range: { from: string; to: string };
  cycle: "monthly" | "weekly";
  incomeSatang: number;
  expenseSatang: number;
  balanceSatang: number;
  count: number;
  recent: TxDto[];
}

interface MeResponse {
  displayName: string | null;
  pictureUrl: string | null;
  plan: "free" | "plus";
}

export default function SummaryPage() {
  const summary = useApi<SummaryResponse>("/api/summary");
  const me = useApi<MeResponse>("/api/me");

  const rangeLabel = summary.data
    ? `${formatThaiDate(new Date(summary.data.range.from))} – ${formatThaiDate(
        new Date(new Date(summary.data.range.to).getTime() - 1),
      )}`
    : null;

  return (
    <main>
      <PageHeader
        title="สรุป"
        right={
          me.data ? (
            <div className="flex items-center gap-2">
              <span className="max-w-[9rem] truncate text-sm text-muted">
                {me.data.displayName}
              </span>
              {me.data.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.data.pictureUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-border object-cover"
                />
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="space-y-4 px-4 pb-4">
        {summary.loading ? (
          <LoadingBlock rows={4} />
        ) : summary.error ? (
          <ErrorState message={summary.error} onRetry={summary.reload} />
        ) : summary.data ? (
          <>
            <p className="text-xs text-muted">
              {summary.data.cycle === "weekly" ? "รอบสัปดาห์" : "รอบงบ"} {rangeLabel}
            </p>

            <section
              aria-label="ภาพรวม"
              className="rounded-2xl border border-border bg-primary-soft p-4 shadow-card"
            >
              <p className="text-sm text-primary">เหลือเก็บ</p>
              <p
                className={cn(
                  "num text-3xl font-bold",
                  summary.data.balanceSatang < 0 ? "text-expense" : "text-foreground",
                )}
              >
                ฿{formatBaht(summary.data.balanceSatang)}
              </p>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <p className="text-xs text-muted">รายรับ</p>
                <p className="num text-lg font-bold text-income">
                  ฿{formatBaht(summary.data.incomeSatang)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
                <p className="text-xs text-muted">รายจ่าย</p>
                <p className="num text-lg font-bold text-expense">
                  ฿{formatBaht(summary.data.expenseSatang)}
                </p>
              </div>
            </div>

            <section aria-label="รายการล่าสุด">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">รายการล่าสุด</h2>
                <Link href="/transactions" className="text-sm font-medium text-primary">
                  ดูทั้งหมด
                </Link>
              </div>
              {summary.data.recent.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface shadow-card">
                  <EmptyState
                    mood="smile"
                    title="ยังไม่มีรายการเลย"
                    hint={'ลองพิมพ์ "กาแฟ 30" ในแชท หรือกดเพิ่มที่หน้ารายการได้เลย'}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
                  {summary.data.recent.map((tx) => (
                    <TxItem key={tx.id} tx={tx} />
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
