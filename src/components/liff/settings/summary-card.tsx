"use client";

import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { cn } from "@/lib/utils";
import { PlusLock } from "./plus-lock";
import { cardClass, type Me, type Settings } from "./types";

type Key = "weekly_summary_enabled" | "monthly_summary_enabled";

const OPTIONS: { key: Key; label: string; hint: (monthlyDay: string) => string }[] = [
  {
    key: "weekly_summary_enabled",
    label: "สรุปรายสัปดาห์",
    hint: () => "ส่งทุกวันจันทร์ 09:00 สรุปสัปดาห์ที่ผ่านมา",
  },
  {
    key: "monthly_summary_enabled",
    label: "สรุปรายเดือน",
    hint: (day) => `ส่ง ${day} 09:00 สรุปรอบงบที่ผ่านมา`,
  },
];

/** Opt-in weekly / monthly summary pushed to the chat (Professional and above). */
export function SummaryCard({
  me,
  settings,
  onSaved,
}: {
  me: Me;
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { api } = useLiff();
  const locked = !me.features.autoSummary;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const monthlyDay =
    settings.budget_cycle === "weekly"
      ? "วันที่ 1 ของเดือน"
      : `วันที่ ${settings.cycle_start_day} ของเดือน`;

  async function save(patch: Partial<Settings>) {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      onSaved(saved);
      setNotice("บันทึกแล้ว");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cardClass} aria-label="สรุปอัตโนมัติ">
      <div>
        <h2 className="font-semibold">สรุปอัตโนมัติในแชท</h2>
        <p className="text-xs text-muted">
          รายรับ รายจ่าย และหมวดที่ใช้เยอะสุด ส่งให้เองไม่ต้องเปิดแอป
        </p>
      </div>

      {OPTIONS.map(({ key, label, hint }) => {
        const enabled = settings[key];
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted">{hint(monthlyDay)}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`เปิด${label}`}
              disabled={busy || (locked && !enabled)}
              onClick={() => save({ [key]: !enabled })}
              className={cn(
                "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50",
                enabled ? "bg-primary" : "bg-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-6 w-6 rounded-full bg-surface shadow transition-all",
                  enabled ? "left-7" : "left-1",
                )}
              />
            </button>
          </div>
        );
      })}

      {locked ? <PlusLock>รับสรุปรายสัปดาห์และรายเดือนในแชทอัตโนมัติ</PlusLock> : null}

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
