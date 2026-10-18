"use client";

import { Check, Crown, Sparkles } from "lucide-react";
import { useState } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/liff/states";
import { planAction, prepaidUpgradeFor } from "@/lib/payments/policy";
import { PLAN_LABEL, type Plan } from "@/lib/plan";
import {
  featuresForPlan,
  PLAN_HIGHLIGHTS,
  PRICES,
  yearlyPerDay,
  yearlySavingPercent,
  type PaidPlan,
  type Period,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface MeLite {
  plan: Plan;
  planExpiresAt: string | null;
  trial?: { days: number; available: { plus: boolean; ultimate: boolean } };
  payments?: {
    available: boolean;
    canManage?: boolean;
    autoRenew?: boolean;
    prepaidRunning?: boolean;
    period?: Period | null;
    prepaidMonths?: number | null;
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

// Only the badge differs per tier. The card itself is neutral until it is the chosen one, then it
// gets the green frame and the green fill (so the choice is never ambiguous).
const TIER_STYLE: Record<Plan, { chip: string }> = {
  free: { chip: "bg-border text-foreground" },
  plus: { chip: "bg-primary text-surface" },
  ultimate: { chip: "bg-accent text-foreground" },
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
  const autoRenew = me.data?.payments?.autoRenew === true;
  const prepaidRunning = me.data?.payments?.prepaidRunning === true;
  // Someone with a running plan can only continue the way they pay, so the method is not a choice.
  const payWith: Method = autoRenew ? "card" : prepaidRunning ? "promptpay" : method;
  const billing = {
    plan: current,
    customerId: null,
    subscriptionRunning: autoRenew,
    subscriptionId: autoRenew ? "running" : null,
    period: autoRenew ? (me.data?.payments?.period ?? "monthly") : null,
    prepaidRunning,
    prepaidMonths: prepaidRunning ? (me.data?.payments?.prepaidMonths ?? 1) : null,
    expiresAt: me.data?.planExpiresAt ? new Date(me.data.planExpiresAt) : null,
    trialsUsed: [],
  };
  const action = planAction(billing, { plan: picked, period, method: payWith });
  const blockMessage = action.kind === "blocked" ? action.message : null;
  const topUp = action.kind === "checkout" && current === picked;
  // prepaid time can also be raised to a higher tier by paying only the difference
  const quote = action.kind === "checkout" ? prepaidUpgradeFor(billing, picked) : null;
  const trialDays = me.data?.trial?.days ?? 7;
  const canTry = me.data?.trial?.available[picked] === true;

  async function startTrial() {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/plan/trial", { method: "POST", body: JSON.stringify({ plan: picked }) });
      setNotice(`เริ่มทดลองใช้ ${PLAN_LABEL[picked]} ฟรี ${trialDays} วันแล้ว`);
      me.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "เริ่มทดลองใช้ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function changePlan() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ available: boolean; message?: string }>("/api/plan/change", {
        method: "POST",
        body: JSON.stringify({ plan: picked, period }),
      });
      if (res.available) {
        setNotice("เปลี่ยนแผนเรียบร้อย ตัดเฉพาะส่วนต่างจากบัตรที่ใช้สมัครไว้แล้ว");
        me.reload();
      } else {
        setNotice(res.message ?? "เปลี่ยนแผนไม่สำเร็จ");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function checkout(upgrade = false) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ available: boolean; message?: string; url?: string }>(
        "/api/plan/checkout",
        {
          method: "POST",
          body: JSON.stringify({ plan: picked, period, method: payWith, upgrade }),
        },
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

        {autoRenew || prepaidRunning ? null : (
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
                  method === m.value
                    ? "border-primary bg-primary-soft"
                    : "border-border bg-surface",
                )}
              >
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-xs text-foreground/80">{m.hint}</span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={action.kind === "change" ? changePlan : () => checkout(false)}
          disabled={busy || action.kind === "blocked"}
          className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
        >
          {busy
            ? "กำลังดำเนินการ..."
            : action.kind === "change"
              ? `อัปเกรดแผน · ${PLAN_LABEL[picked]} (${period === "yearly" ? "รายปี" : "รายเดือน"})`
              : `${topUp ? "ต่ออายุ" : "ชำระเงิน"} · ${PLAN_LABEL[picked]}`}
        </button>
        {quote ? (
          <button
            type="button"
            onClick={() => checkout(true)}
            disabled={busy}
            className="h-12 w-full rounded-2xl border border-primary text-base font-semibold text-primary disabled:opacity-60"
          >
            อัปเกรดส่วนที่เหลือ · จ่ายส่วนต่าง ฿{quote.amountBaht}
          </button>
        ) : null}
        {quote ? (
          <p className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-foreground">
            ใช้ {PLAN_LABEL[picked]} ต่อจนถึงวันหมดอายุเดิม (อีก {quote.days} วัน)
            โดยจ่ายเฉพาะส่วนต่างของราคา ถ้าอยากต่อเวลาเพิ่ม ให้กดปุ่มด้านบน (ซื้อรอบใหม่เต็มราคา
            ต่อท้ายเวลาที่เหลือ)
          </p>
        ) : null}
        {canTry ? (
          <button
            type="button"
            onClick={startTrial}
            disabled={busy}
            className="h-12 w-full rounded-2xl border-2 border-accent bg-accent/15 text-base font-semibold text-foreground disabled:opacity-60"
          >
            ทดลองใช้ {PLAN_LABEL[picked]} ฟรี {trialDays} วัน
          </button>
        ) : null}
        {canTry ? (
          <p className="text-xs text-foreground/80">
            ไม่ต้องใช้บัตร ครบ {trialDays} วันแผนจะกลับเป็น Free เอง (ทดลองได้ครั้งเดียวต่อแผน)
          </p>
        ) : null}
        {action.kind === "change" ? (
          <p className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-foreground">
            จ่ายเฉพาะส่วนต่าง: Stripe หักเวลาที่ยังไม่ได้ใช้ของแผนเดิม แล้วคิดแผนใหม่
            ตัดจากบัตรที่ใช้สมัครไว้ทันที
          </p>
        ) : null}
        {blockMessage ? (
          <p className="rounded-2xl bg-accent/15 px-4 py-2 text-sm text-foreground">
            {blockMessage}
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

        <PlanFeatures />
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

  const base = "block w-full space-y-2 rounded-3xl border-2 p-4 text-left";
  if (!onSelect) return <div className={cn(base, "border-border bg-background")}>{body}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        base,
        selected ? "border-primary bg-primary-soft shadow-card" : "border-border bg-surface",
      )}
    >
      {body}
    </button>
  );
}

const FEATURE_TABS: { plan: Plan; label: string }[] = [
  { plan: "free", label: "Free" },
  { plan: "plus", label: "Professional" },
  { plan: "ultimate", label: "Ultimate" },
];

/** What each plan can do: pick a plan to see its whole list (what it does not include is not shown). */
function PlanFeatures() {
  const [plan, setPlan] = useState<Plan>("plus");
  const groups = featuresForPlan(plan);
  return (
    <section
      aria-label="ทำอะไรได้บ้าง"
      className="space-y-3 rounded-3xl border border-border bg-surface p-4"
    >
      <h2 className="text-base font-bold">ทำอะไรได้บ้าง?</h2>
      <div role="tablist" aria-label="เลือกแผนเพื่อดูฟังก์ชัน" className="grid grid-cols-3 gap-1">
        {FEATURE_TABS.map((t) => (
          <button
            key={t.plan}
            type="button"
            role="tab"
            id={`features-tab-${t.plan}`}
            aria-selected={plan === t.plan}
            aria-controls="features-panel"
            onClick={() => setPlan(t.plan)}
            className={cn(
              "min-h-11 rounded-2xl px-1 text-sm font-semibold",
              plan === t.plan ? "bg-primary text-white" : "bg-background text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id="features-panel"
        role="tabpanel"
        aria-labelledby={`features-tab-${plan}`}
        className="space-y-4"
      >
        {plan !== "free" ? (
          <p className="text-xs text-muted">
            {plan === "plus"
              ? "ทุกอย่างของ Free และเพิ่มเติมด้านล่าง"
              : "ทุกอย่างของ Professional และเพิ่มเติมด้านล่าง"}
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-1 text-xs font-bold text-muted">{group.title}</h3>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.detail ? (
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {item.detail}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
