"use client";

import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { cn } from "@/lib/utils";
import { PlusLock } from "./plus-lock";
import { cardClass, type Me, type Settings } from "./types";

const DEFAULT_TIME = "20:00";

export function ReminderCard({
  me,
  settings,
  onSaved,
}: {
  me: Me;
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { api } = useLiff();
  const locked = !me.features.dailyReminder;
  const enabled = settings.daily_reminder_enabled;
  const time = (settings.daily_reminder_time ?? DEFAULT_TIME).slice(0, 5);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
    <section className={cardClass} aria-label="เตือนจดประจำวัน">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">เตือนจดประจำวัน</h2>
          <p className="text-xs text-muted">ส่งข้อความเตือนในแชทถ้าวันนั้นยังไม่ได้จด</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="เปิดเตือนจดประจำวัน"
          disabled={busy || (locked && !enabled)}
          onClick={() =>
            save(
              enabled
                ? { daily_reminder_enabled: false }
                : { daily_reminder_enabled: true, daily_reminder_time: time },
            )
          }
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

      {locked ? <PlusLock>เตือนจดประจำวันตามเวลาที่ตั้ง</PlusLock> : null}

      {!locked && enabled ? (
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>เตือนเวลา</span>
          <input
            type="time"
            value={time}
            disabled={busy}
            onChange={(e) => e.target.value && save({ daily_reminder_time: e.target.value })}
            className="num h-11 w-32 rounded-2xl border border-border bg-background px-3"
          />
        </label>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
