"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CategoryDonutChart, FlowBarChart } from "@/components/liff/lazy-charts";
import { sliceColor } from "@/components/liff/slice-color";
import { SavingsPanel } from "@/components/liff/savings-panel";
import { Segmented } from "@/components/liff/segmented";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { useApi } from "@/components/liff/liff-provider";
import { formatBaht } from "@/lib/money";
import type { SeriesPoint } from "@/lib/series";

type View = "month" | "week" | "day";
type Scope = "cycle" | "all";

interface AnalyticsResponse {
  view: View;
  scope: Scope;
  series: SeriesPoint[];
  categories: {
    categoryId: string | null;
    name: string;
    color: string | null;
    totalSatang: number;
  }[];
  categoriesTotalSatang: number;
}

const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "6 เดือน" },
  { value: "week", label: "รายสัปดาห์" },
  { value: "day", label: "รายวัน" },
];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"flow" | "saving">("flow");
  const [view, setView] = useState<View>("month");
  const [scope, setScope] = useState<Scope>("cycle");
  const me = useApi<{ features: Record<string, boolean> }>("/api/me");
  const savingsUnlocked = me.data?.features.savingsChart === true;
  const dashboardUnlocked = me.data?.features.dashboard === true;
  // Free never calls the (Professional) analytics API: it sees the locked page below instead
  const data = useApi<AnalyticsResponse>(
    tab === "flow" && dashboardUnlocked ? `/api/analytics?view=${view}&scope=${scope}` : null,
  );

  const chartData = (data.data?.series ?? []).map((p) => ({
    label: p.label,
    income: p.incomeSatang / 100,
    expense: p.expenseSatang / 100,
  }));
  const hasSeries = chartData.some((p) => p.income > 0 || p.expense > 0);
  const totalIncome = (data.data?.series ?? []).reduce((s, p) => s + p.incomeSatang, 0);
  const totalExpense = (data.data?.series ?? []).reduce((s, p) => s + p.expenseSatang, 0);

  const cats = data.data?.categories ?? [];
  const slices = cats.map((c) => ({
    key: c.categoryId ?? c.name,
    name: c.name,
    value: c.totalSatang / 100,
    color: c.color,
  }));
  const catTotal = data.data?.categoriesTotalSatang ?? 0;

  if (me.loading) {
    return (
      <main>
        <PageHeader title="วิเคราะห์" />
        <div className="px-4 pb-4">
          <LoadingBlock rows={4} />
        </div>
      </main>
    );
  }
  if (me.error) {
    return (
      <main>
        <PageHeader title="วิเคราะห์" />
        <ErrorState message={me.error} onRetry={me.reload} />
      </main>
    );
  }
  if (!dashboardUnlocked) {
    return (
      <main>
        <PageHeader title="วิเคราะห์" />
        <div className="space-y-3 px-4 pb-4">
          <div className="rounded-2xl border border-border bg-surface shadow-card">
            <EmptyState
              title="กราฟและตารางวิเคราะห์สำหรับแผน Professional"
              hint="ดูกราฟรายรับรายจ่าย สัดส่วนตามหมวด และกราฟเก็บออม ลองใช้ฟรี 7 วันได้ที่หน้าอัปเกรด"
              action={
                <Link
                  href="/upgrade"
                  className="mt-3 inline-flex h-11 items-center gap-1 rounded-2xl bg-primary px-5 text-sm font-semibold text-surface"
                >
                  <Lock className="h-4 w-4" aria-hidden /> ดูแผน Professional
                </Link>
              }
            />
          </div>
          <p className="text-center text-xs text-muted">
            ตอนนี้ดูสรุปได้ในแชท: สรุปเดือนนี้ · สรุปหมวด · ล่าสุด
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title="วิเคราะห์" />
      <div className="space-y-4 px-4 pb-4">
        <Segmented
          label="หมวดวิเคราะห์"
          value={tab}
          onChange={setTab}
          options={[
            { value: "flow", label: "รายรับรายจ่าย" },
            { value: "saving", label: "เก็บออม · Pro" },
          ]}
        />

        {tab === "saving" ? (
          me.loading ? (
            <LoadingBlock rows={3} />
          ) : savingsUnlocked ? (
            <SavingsPanel />
          ) : (
            <div className="rounded-2xl border border-border bg-surface shadow-card">
              <EmptyState
                title="กราฟเก็บออมสำหรับแผน Professional"
                hint="ดูเงินเก็บสะสมและอัตราการออม · แลกวัน Professional ด้วยตังสะสมได้ที่หน้าตั้งค่า"
                action={
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                    <Lock className="h-3 w-3" aria-hidden /> Pro
                  </span>
                }
              />
            </div>
          )
        ) : (
          <>
            <Segmented label="ช่วงเวลา" value={view} onChange={setView} options={VIEWS} />

            {data.loading ? (
              <LoadingBlock rows={4} />
            ) : data.error ? (
              <ErrorState message={data.error} onRetry={data.reload} />
            ) : data.data ? (
              <>
                <section
                  aria-label="กราฟรายรับรายจ่าย"
                  className="rounded-2xl border border-border bg-surface p-4 shadow-card"
                >
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="num font-semibold text-income">
                      รายรับ ฿{formatBaht(totalIncome)}
                    </span>
                    <span className="num font-semibold text-expense">
                      รายจ่าย ฿{formatBaht(totalExpense)}
                    </span>
                  </div>
                  {hasSeries ? (
                    <FlowBarChart data={chartData} />
                  ) : (
                    <EmptyState
                      title="ยังไม่มีรายการในช่วงนี้"
                      hint={'ลองจดรายการสักอัน เช่น "กาแฟ 30" แล้วกราฟจะขึ้นมา'}
                    />
                  )}
                </section>

                <section
                  aria-label="สัดส่วนรายจ่ายตามหมวด"
                  className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">รายจ่ายตามหมวด</h2>
                  </div>
                  <Segmented
                    label="ขอบเขต"
                    value={scope}
                    onChange={setScope}
                    options={[
                      { value: "cycle", label: "รอบนี้" },
                      { value: "all", label: "สะสมทั้งหมด" },
                    ]}
                  />
                  {cats.length === 0 ? (
                    <EmptyState title="ยังไม่มีรายจ่าย" />
                  ) : (
                    <>
                      <div className="relative mx-auto h-48 w-48">
                        <CategoryDonutChart slices={slices} />
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[11px] text-muted">รวม</span>
                          <span className="num text-base font-bold">฿{formatBaht(catTotal)}</span>
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {cats.map((c, i) => (
                          <li
                            key={c.categoryId ?? c.name}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              aria-hidden
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{
                                background: sliceColor(c.color, i),
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <span className="num text-xs text-muted">
                              {catTotal > 0 ? Math.round((c.totalSatang * 100) / catTotal) : 0}%
                            </span>
                            <span className="num w-24 text-right font-semibold">
                              ฿{formatBaht(c.totalSatang)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
