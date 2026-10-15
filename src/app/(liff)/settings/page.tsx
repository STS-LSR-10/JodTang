"use client";

import { useState } from "react";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { cn } from "@/lib/utils";

interface Settings {
  confirm_style: "full" | "short" | "off";
  budget_cycle: "monthly" | "weekly";
  cycle_start_day: number;
}

interface Me {
  displayName: string | null;
  pictureUrl: string | null;
  plan: "free" | "plus";
  points: number;
}

const CONFIRM_OPTIONS: { value: Settings["confirm_style"]; label: string; hint: string }[] = [
  { value: "full", label: "เต็ม", hint: "การ์ดพร้อมปุ่มแก้ไข/ลบ" },
  { value: "short", label: "สั้น", hint: "ข้อความบรรทัดเดียว" },
  { value: "off", label: "ไม่ส่ง", hint: "จดเงียบ ๆ ไม่ตอบกลับ" },
];

const CYCLE_OPTIONS: { value: Settings["budget_cycle"]; label: string }[] = [
  { value: "monthly", label: "รายเดือน" },
  { value: "weekly", label: "รายสัปดาห์" },
];

const START_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export default function SettingsPage() {
  const { api } = useLiff();
  const settings = useApi<Settings>("/api/settings");
  const me = useApi<Me>("/api/me");
  const [override, setOverride] = useState<Settings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const current = override ?? settings.data;

  async function save(patch: Partial<Settings>) {
    if (!current) return;
    const previous = current;
    setOverride({ ...current, ...patch }); // optimistic
    setSaving(true);
    setNotice(null);
    try {
      const saved = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setOverride(saved);
      setNotice("บันทึกแล้ว");
    } catch (e) {
      setOverride(previous);
      setNotice(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <PageHeader title="ตั้งค่า" />
      <div className="space-y-4 px-4 pb-4">
        {settings.loading ? (
          <LoadingBlock rows={4} />
        ) : settings.error || !current ? (
          <ErrorState message={settings.error ?? "โหลดไม่สำเร็จ"} onRetry={settings.reload} />
        ) : (
          <>
            <section className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
              {me.data?.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={me.data.pictureUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary-soft" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{me.data?.displayName ?? "ผู้ใช้"}</p>
                <p className="text-xs text-muted">
                  แผน{" "}
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                    {me.data?.plan === "plus" ? "Plus" : "Free"}
                  </span>{" "}
                  · ตังสะสม <span className="num">{me.data?.points ?? 0}</span>
                </p>
              </div>
            </section>

            <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <h2 className="font-semibold">การ์ดยืนยันหลังจด</h2>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="รูปแบบการ์ด">
                {CONFIRM_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={current.confirm_style === o.value}
                    disabled={saving}
                    onClick={() => save({ confirm_style: o.value })}
                    className={cn(
                      "min-h-14 rounded-2xl border px-2 py-2 text-center",
                      current.confirm_style === o.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted",
                    )}
                  >
                    <span className="block text-sm font-semibold">{o.label}</span>
                    <span className="block text-[11px] leading-tight">{o.hint}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
              <h2 className="font-semibold">รอบงบ</h2>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ชนิดรอบงบ">
                {CYCLE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={current.budget_cycle === o.value}
                    disabled={saving}
                    onClick={() => save({ budget_cycle: o.value })}
                    className={cn(
                      "h-11 rounded-2xl border text-sm font-semibold",
                      current.budget_cycle === o.value
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {current.budget_cycle === "monthly" ? (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>เริ่มรอบทุกวันที่</span>
                  <select
                    value={current.cycle_start_day}
                    disabled={saving}
                    onChange={(e) => save({ cycle_start_day: Number(e.target.value) })}
                    className="num h-11 w-24 rounded-2xl border border-border bg-background px-3"
                  >
                    {START_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-muted">รอบสัปดาห์เริ่มทุกวันจันทร์</p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-muted">ภาษา</dt>
                  <dd>ไทย</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">สกุลเงิน</dt>
                  <dd>บาท (THB)</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">เขตเวลา</dt>
                  <dd>Asia/Bangkok</dd>
                </div>
              </dl>
            </section>

            {notice ? (
              <p
                role="status"
                className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary"
              >
                {notice}
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
