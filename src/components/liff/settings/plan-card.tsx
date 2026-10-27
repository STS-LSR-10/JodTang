"use client";

import { Flame, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { PLAN_LABEL } from "@/lib/plan";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import { cardClass, type Me } from "./types";

export function PlanCard({
  me,
  onChanged,
  onOpenHistory,
}: {
  me: Me;
  onChanged: () => void;
  onOpenHistory: () => void;
}) {
  const { api } = useLiff();
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plus = me.plan !== "free"; // any paid tier
  const maxDays = Math.min(me.redeem.days, 365);
  const slipPct =
    me.slips.limit && me.slips.limit > 0
      ? Math.min(100, (me.slips.used * 100) / me.slips.limit)
      : 0;

  async function redeem() {
    setBusy(true);
    setNotice(null);
    try {
      await api("/api/points/redeem", { method: "POST", body: JSON.stringify({ days }) });
      setNotice(`แลกแล้ว +${days} วัน Pro`);
      setDays(1);
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "แลกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cardClass} aria-label="แผนและตังสะสม">
      <div className="flex items-center gap-3">
        {me.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.pictureUrl}
            alt=""
            width={48}
            height={48}
            className="h-[52px] w-[52px] rounded-full border-2 border-primary-soft object-cover"
          />
        ) : (
          <div className="h-[52px] w-[52px] rounded-full bg-primary-soft" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{me.displayName ?? "ผู้ใช้"}</p>
          <p className="text-xs text-muted">
            แผน{" "}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                plus ? "bg-primary-soft text-primary" : "bg-background text-muted",
              )}
            >
              {PLAN_LABEL[me.plan]}
            </span>
            {plus && me.planExpiresAt ? (
              <> · ใช้ได้ถึง {formatThaiDate(new Date(me.planExpiresAt))}</>
            ) : null}
          </p>
        </div>
      </div>

      {me.slips.limit === 0 ? (
        <p className="text-xs text-muted">การอ่านสลิปใช้ได้ตั้งแต่แผน Pro</p>
      ) : null}

      {me.slips.limit !== null && me.slips.limit > 0 ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>สลิปเดือนนี้</span>
            <span className="num">
              {me.slips.used} / {me.slips.limit}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="โควตาสลิปเดือนนี้"
            aria-valuemin={0}
            aria-valuemax={me.slips.limit}
            aria-valuenow={me.slips.used}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <div
              className={cn("h-full rounded-full", slipPct >= 100 ? "bg-expense" : "bg-primary")}
              style={{ width: `${slipPct}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-primary-soft px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> ตังสะสม
          </p>
          <p className="num text-xl font-bold text-primary">{me.points}</p>
        </div>
        <div className="rounded-xl bg-primary-soft px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Flame className="h-3.5 w-3.5 text-expense" aria-hidden /> จดต่อเนื่อง
          </p>
          <p className="num text-xl font-bold text-primary">
            {me.streak} <span className="text-xs font-normal text-muted">วัน</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">แลกเป็นวันใช้ Pro</p>
        {maxDays > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="จำนวนวันที่จะแลก"
              className="num h-11 w-28 rounded-2xl border border-border bg-background px-3"
            >
              {Array.from({ length: Math.min(maxDays, 30) }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d} วัน
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={redeem}
              disabled={busy}
              className="h-11 flex-1 rounded-2xl bg-primary text-sm font-semibold text-surface disabled:opacity-60"
            >
              แลก ({days * me.redeem.pointsPerDay} แต้ม)
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted">
            สะสมครบ {me.redeem.pointsPerDay} แต้มแลกได้ 1 วัน · ทุกวันที่จดรายการได้ 1 แต้ม
          </p>
        )}
      </div>

      {me.plan !== "ultimate" ? (
        <Link
          href="/upgrade"
          className="flex h-11 w-full items-center justify-center rounded-2xl border border-primary text-sm font-semibold text-primary"
        >
          {plus ? "ดูแผน Elite" : "ดูแผนอัปเกรด"}
        </Link>
      ) : null}

      <button
        type="button"
        onClick={onOpenHistory}
        className="text-xs text-muted underline underline-offset-2"
      >
        ประวัติการชำระเงิน:{" "}
        {me.payments.history.length === 0 ? "ยังไม่มี" : `${me.payments.history.length} รายการ`}
      </button>

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
