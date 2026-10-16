"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

const INCOME = "#059669";
const EXPENSE = "#E11D48";
const FALLBACK_COLORS = ["#0F766E", "#0369A1", "#7C3AED", "#D97706", "#475569", "#DB2777"];

const VIEWS: { value: View; label: string }[] = [
  { value: "month", label: "6 เดือน" },
  { value: "week", label: "รายสัปดาห์" },
  { value: "day", label: "รายวัน" },
];

const compact = (baht: number) =>
  baht >= 1_000_000
    ? `${(baht / 1_000_000).toFixed(1)}M`
    : baht >= 1000
      ? `${(baht / 1000).toFixed(baht % 1000 === 0 ? 0 : 1)}k`
      : String(baht);

export default function AnalyticsPage() {
  const [tab, setTab] = useState<"flow" | "saving">("flow");
  const [view, setView] = useState<View>("month");
  const [scope, setScope] = useState<Scope>("cycle");
  const me = useApi<{ features: Record<string, boolean> }>("/api/me");
  const savingsUnlocked = me.data?.features.savingsChart === true;
  const data = useApi<AnalyticsResponse>(
    tab === "flow" ? `/api/analytics?view=${view}&scope=${scope}` : null,
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
  const catTotal = data.data?.categoriesTotalSatang ?? 0;

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
            { value: "saving", label: "เก็บออม · Plus" },
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
                title="กราฟเก็บออมสำหรับแผน Plus"
                hint="ดูเงินเก็บสะสมและอัตราการออม · แลกวัน Plus ด้วยตังสะสมได้ที่หน้าตั้งค่า"
                action={
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                    <Lock className="h-3 w-3" aria-hidden /> Plus
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
                    <span className="num font-semibold" style={{ color: INCOME }}>
                      รายรับ ฿{formatBaht(totalIncome)}
                    </span>
                    <span className="num font-semibold" style={{ color: EXPENSE }}>
                      รายจ่าย ฿{formatBaht(totalExpense)}
                    </span>
                  </div>
                  {hasSeries ? (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
                        >
                          <CartesianGrid vertical={false} strokeOpacity={0.25} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            fontSize={11}
                            tickFormatter={compact}
                          />
                          <Tooltip
                            formatter={(v, name) => [
                              `฿${formatBaht(Math.round(Number(v) * 100))}`,
                              name === "income" ? "รายรับ" : "รายจ่าย",
                            ]}
                          />
                          <Bar dataKey="income" fill={INCOME} radius={[6, 6, 0, 0]} />
                          <Bar dataKey="expense" fill={EXPENSE} radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
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
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={cats.map((c) => ({ name: c.name, value: c.totalSatang / 100 }))}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={56}
                              outerRadius={86}
                              paddingAngle={2}
                              stroke="none"
                            >
                              {cats.map((c, i) => (
                                <Cell
                                  key={c.categoryId ?? c.name}
                                  fill={
                                    c.color ??
                                    FALLBACK_COLORS[i % FALLBACK_COLORS.length] ??
                                    "#64748B"
                                  }
                                />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
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
                                background:
                                  c.color ??
                                  FALLBACK_COLORS[i % FALLBACK_COLORS.length] ??
                                  "#64748B",
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
