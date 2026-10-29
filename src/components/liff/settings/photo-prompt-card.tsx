"use client";

import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { PlusLock } from "./plus-lock";
import { Switch } from "./switch";
import { cardClass, type Me, type Settings } from "./types";

/** Show the small "แนบรูป" button on the card of a saved entry (a tap opens the camera / album step). */
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
    <section className={cardClass} aria-label="ปุ่มแนบรูปบนการ์ด">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">ปุ่มแนบรูปบนการ์ด</h2>
          <p className="text-xs text-muted">
            การ์ดจดสำเร็จมีปุ่ม “แนบรูป” เล็ก ๆ มุมซ้ายล่าง
            กดแล้วถ่ายรูปหรือเลือกจากอัลบั้มเพื่อแนบใบเสร็จหรือสินค้า
          </p>
        </div>
        <Switch
          checked={enabled && !locked}
          label="ปุ่มแนบรูปบนการ์ด"
          disabled={busy || locked}
          onChange={() => void toggle()}
        />
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
