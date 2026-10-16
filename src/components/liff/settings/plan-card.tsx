"use client";

import { Flame, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import { cardClass, type Me } from "./types";

export function PlanCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const { api } = useLiff();
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const plus = me.plan === "plus";
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
      setNotice(`แลกแล้ว +${days} วัน Plus`);
      setDays(1);
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "แลกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function upgrade() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ available: boolean; message?: string; url?: string }>(
        "/api/plan/checkout",
        { method: "POST", body: JSON.stringify({ months: 1 }) },
      );
      if (res.available && res.url) window.location.href = res.url;
      else setNotice(res.message ?? "ยังไม่เปิดให้ชำระเงิน");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
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
            className="h-12 w-12 rounded-full border border-border object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-primary-soft" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{me.displayName ?? "ผู้ใช้"}</p>
          <p className="text-xs text-muted">
            แผน{" "}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                plus ? "bg-accent/20 text-foreground" : "bg-primary-soft text-primary",
              )}
            >
              {plus ? "Plus" : "Free"}
            </span>
            {plus && me.planExpiresAt ? (
              <> · ใช้ได้ถึง {formatThaiDate(new Date(me.planExpiresAt))}</>
            ) : null}
          </p>
        </div>
      </div>

      {!plus && me.slips.limit !== null ? (
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
        <div className="rounded-2xl bg-background p-3">
          <p className="flex items-center gap-1 text-xs text-muted">
            <Sparkles className="h-3 w-3" aria-hidden /> ตังสะสม
          </p>
          <p className="num text-xl font-bold">{me.points}</p>
        </div>
        <div className="rounded-2xl bg-background p-3">
          <p className="flex items-center gap-1 text-xs text-muted">
            <Flame className="h-3 w-3" aria-hidden /> จดต่อเนื่อง
          </p>
          <p className="num text-xl font-bold">{me.streak} วัน</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">แลกเป็นวันใช้ Plus</p>
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

      {!plus ? (
        <button
          type="button"
          onClick={upgrade}
          disabled={busy}
          className="h-11 w-full rounded-2xl border border-primary text-sm font-semibold text-primary disabled:opacity-60"
        >
          อัปเกรดเป็น Plus
        </button>
      ) : null}

      <p className="text-xs text-muted">
        ประวัติการชำระเงิน:{" "}
        {me.payments.history.length === 0 ? "ยังไม่มี" : `${me.payments.history.length} รายการ`}
      </p>

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
