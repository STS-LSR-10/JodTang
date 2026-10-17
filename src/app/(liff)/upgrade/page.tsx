"use client";

import { Check, Crown, Minus, Sparkles } from "lucide-react";
import { useState } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/liff/states";
import { checkoutBlock } from "@/lib/payments/policy";
import { PLAN_LABEL, type Plan } from "@/lib/plan";
import {
  FEATURE_GROUPS,
  PLAN_HIGHLIGHTS,
  PRICES,
  yearlyPerDay,
  yearlySavingPercent,
  type Cell,
  type PaidPlan,
  type Period,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface MeLite {
  plan: Plan;
  planExpiresAt: string | null;
  payments?: {
    available: boolean;
    canManage?: boolean;
    autoRenew?: boolean;
    prepaidRunning?: boolean;
  };
}

type Method = "card" | "promptpay";

const METHODS: { value: Method; label: string; hint: string }[] = [
  {
    value: "card",
    label: "บัตรเครดิต/เดบิต",
    hint: "บัตรในประเทศและต่างประเทศ ต่ออายุอัตโนมัติ ยกเลิกได้ทุกเมื่อ",
  },
  {
    value: "promptpay",
    label: "พร้อมเพย์ (QR)",
    hint: "จ่ายครั้งเดียวต่อรอบ สแกน QR ผ่านแอปธนาคาร ไม่ต่ออายุอัตโนมัติ",
  },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: "monthly", label: "รายเดือน" },
  { value: "yearly", label: "รายปี" },
];

// Pastel surface per tier. Text stays on the dark foreground colour for contrast.
const TIER_STYLE: Record<Plan, { card: string; chip: string }> = {
  free: { card: "bg-background", chip: "bg-border text-foreground" },
  plus: { card: "bg-primary-soft", chip: "bg-primary text-surface" },
  ultimate: { card: "bg-accent/15", chip: "bg-accent text-foreground" },
};

const PAID: PaidPlan[] = ["plus", "ultimate"];

export default function UpgradePage() {
  const { api, openExternal } = useLiff();
  const me = useApi<MeLite>("/api/me");
  const [method, setMethod] = useState<Method>("card");
  const [period, setPeriod] = useState<Period>("yearly");
  const [picked, setPicked] = useState<PaidPlan>("plus");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const current: Plan = me.data?.plan ?? "free";
  // The same rules the server enforces (src/lib/payments/policy.ts), so the button explains itself.
  const block = checkoutBlock(
    {
      plan: current,
      customerId: null,
      subscriptionRunning: me.data?.payments?.autoRenew === true,
      prepaidRunning: me.data?.payments?.prepaidRunning === true,
    },
    { plan: picked, method },
  );
  const topUp = !block && current === picked;

  async function checkout() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ available: boolean; message?: string; url?: string }>(
        "/api/plan/checkout",
        { method: "POST", body: JSON.stringify({ plan: picked, period, method }) },
      );
      // Stripe opens in the phone browser: PromptPay needs a banking app, and the LINE in-app
      // browser cannot always hand over to one.
      if (res.available && res.url) await openExternal(res.url);
      else setNotice(res.message ?? "ยังไม่เปิดให้ชำระเงิน");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function manage() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ available: boolean; message?: string; url?: string }>(
        "/api/plan/portal",
        { method: "POST", body: "{}" },
      );
      if (res.available && res.url) await openExternal(res.url);
      else setNotice(res.message ?? "เปิดหน้าจัดการไม่สำเร็จ");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <PageHeader title="อัปเกรด" />

      <div className="space-y-4 px-4 pb-24">
        <section
          aria-label="แนะนำแผน"
          className="flex items-center gap-3 rounded-3xl border border-border bg-gradient-to-br from-primary-soft via-surface to-accent/15 p-4"
        >
          <Logo size={64} />
          <div className="min-w-0">
            <p className="text-base font-bold">จดตังค์ได้เต็มที่ขึ้น</p>
            <p className="text-sm text-muted">
              แผนของคุณตอนนี้: <span className="font-semibold">{PLAN_LABEL[current]}</span>
            </p>
          </div>
        </section>

        <div role="radiogroup" aria-label="รอบชำระเงิน" className="grid grid-cols-2 gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "relative h-11 rounded-2xl border text-sm font-semibold",
                period === p.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-muted",
              )}
            >
              {p.label}
              {p.value === "yearly" ? (
                <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-foreground">
                  คุ้มสุด
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div role="radiogroup" aria-label="เลือกแผน" className="space-y-3">
          <PlanCard plan="free" current={current} />
          {PAID.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              current={current}
              period={period}
              selected={picked === plan}
              onSelect={() => setPicked(plan)}
            />
          ))}
        </div>

        <div role="radiogroup" aria-label="ช่องทางชำระเงิน" className="space-y-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={method === m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                "block w-full rounded-2xl border p-3 text-left",
                method === m.value ? "border-primary bg-primary-soft" : "border-border bg-surface",
              )}
            >
              <span className="block text-sm font-semibold">{m.label}</span>
              <span className="block text-xs text-foreground/80">{m.hint}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={checkout}
          disabled={busy || block !== null}
          className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
        >
          {busy ? "กำลังดำเนินการ..." : `${topUp ? "ต่ออายุ" : "ชำระเงิน"} · ${PLAN_LABEL[picked]}`}
        </button>
        {block ? (
          <p className="rounded-2xl bg-accent/15 px-4 py-2 text-sm text-foreground">
            {block.message}
          </p>
        ) : null}
        {me.data?.payments?.canManage ? (
          <button
            type="button"
            onClick={manage}
            disabled={busy}
            className="h-11 w-full rounded-2xl border border-primary text-sm font-semibold text-primary disabled:opacity-60"
          >
            จัดการการชำระเงิน (ยกเลิกต่ออายุ / เปลี่ยนบัตร)
          </button>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
            {notice}
          </p>
        ) : null}
        <p className="flex items-start gap-1 text-xs text-muted">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          ยังไม่มีเงินสด? สะสมตังจากการจดทุกวันแล้วแลกเป็นวันใช้ Professional ได้ที่หน้าตั้งค่า
        </p>

        <Comparison />
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  current,
  period,
  selected,
  onSelect,
}: {
  plan: Plan;
  current: Plan;
  period?: Period;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const style = TIER_STYLE[plan];
  const price = plan === "free" ? null : PRICES[plan];
  const isCurrent = current === plan;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-base font-bold">
          {plan === "ultimate" ? <Crown className="h-4 w-4" aria-hidden /> : null}
          {PLAN_LABEL[plan]}
        </p>
        {isCurrent ? (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", style.chip)}>
            แผนของคุณ
          </span>
        ) : null}
      </div>

      {price && period ? (
        <div>
          <p className="num text-2xl font-extrabold">
            ฿{price[period]}
            <span className="ml-1 text-sm font-medium text-foreground/80">
              /{period === "monthly" ? "เดือน" : "ปี"}
            </span>
          </p>
          {period === "yearly" ? (
            <p className="text-xs text-foreground/80">
              ≈ ฿{yearlyPerDay(price)} ต่อวัน · ประหยัด {yearlySavingPercent(price)}%
            </p>
          ) : (
            <p className="text-xs text-foreground/80">หรือรายปี ฿{price.yearly}</p>
          )}
        </div>
      ) : (
        <p className="num text-2xl font-extrabold">฿0</p>
      )}

      <ul className="space-y-1 text-sm">
        {PLAN_HIGHLIGHTS[plan].map((h) => (
          <li key={h} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {h}
          </li>
        ))}
      </ul>
    </>
  );

  const base = cn("block w-full space-y-2 rounded-3xl border-2 p-4 text-left", style.card);
  if (!onSelect) return <div className={cn(base, "border-border")}>{body}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(base, selected ? "border-primary shadow-card" : "border-border")}
    >
      {body}
    </button>
  );
}

function CellView({ cell, soon }: { cell: Cell; soon?: boolean }) {
  if (typeof cell === "string") return <span className="text-xs font-semibold">{cell}</span>;
  if (!cell) {
    return (
      <>
        <Minus className="mx-auto h-4 w-4 text-muted" aria-hidden />
        <span className="sr-only">ไม่มี</span>
      </>
    );
  }
  if (soon) return <span className="text-xs font-semibold text-muted">เร็วๆ นี้</span>;
  return (
    <>
      <Check className="mx-auto h-4 w-4 text-primary" aria-hidden />
      <span className="sr-only">มี</span>
    </>
  );
}

function Comparison() {
  return (
    <section
      aria-label="เปรียบเทียบแผน"
      className="overflow-hidden rounded-3xl border border-border bg-surface"
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="px-4 pb-1 pt-4 text-left text-base font-bold">ทำอะไรได้บ้าง?</caption>
        <colgroup>
          <col />
          <col className="w-[72px]" />
          <col className="w-[84px]" />
          <col className="w-[72px]" />
        </colgroup>
        <thead>
          <tr className="text-xs">
            <th scope="col" className="sr-only">
              ฟีเจอร์
            </th>
            <th scope="col" className="py-2 font-semibold">
              Free
            </th>
            <th scope="col" className="py-2 font-semibold text-primary">
              Pro
            </th>
            <th scope="col" className="py-2 font-semibold">
              Ultimate
            </th>
          </tr>
        </thead>
        {FEATURE_GROUPS.map((group) => (
          <tbody key={group.title}>
            <tr>
              <th
                colSpan={4}
                scope="colgroup"
                className="bg-background px-4 py-1.5 text-left text-xs font-bold text-muted"
              >
                {group.title}
              </th>
            </tr>
            {group.rows.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <th scope="row" className="px-4 py-2.5 text-left text-sm font-normal">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-1 py-2.5 text-center">
                    <CellView cell={cell} soon={row.soon && i === 2} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
