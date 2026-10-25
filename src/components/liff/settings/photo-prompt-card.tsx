"use client";

import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { cn } from "@/lib/utils";
import { PlusLock } from "./plus-lock";
import { cardClass, type Me, type Settings } from "./types";

/** "Offer me a photo after I record something" (the camera and album buttons under the card). */
export function PhotoPromptCard({
  me,
  settings,
  onSaved,
}: {
  me: Me;
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const { api } = useLiff();
  const locked = !me.features.entryPhoto;
  const enabled = settings.photo_prompt !== false;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await api<Settings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ photo_prompt: !enabled }),
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
    <section className={cardClass} aria-label="ชวนแนบรูปหลังจด">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">ชวนแนบรูปหลังจด</h2>
          <p className="text-xs text-muted">
            หลังจดรายการ บอทมีปุ่มถ่ายรูป/เลือกจากอัลบั้มให้แนบใบเสร็จหรือสินค้าต่อท้าย
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && !locked}
          aria-label="ชวนแนบรูปหลังจด"
          disabled={busy || locked}
          onClick={() => void toggle()}
          className={cn(
            "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50",
            enabled && !locked ? "bg-primary" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-6 w-6 rounded-full bg-surface shadow transition-all",
              enabled && !locked ? "left-7" : "left-1",
            )}
          />
        </button>
      </div>
      {locked ? <PlusLock>แนบรูปใบเสร็จหรือสินค้ากับรายการ</PlusLock> : null}
      {notice ? (
        <p role="status" className="text-sm text-muted">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
