"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { LoadingBlock } from "@/components/liff/states";
import { PlusLock } from "./plus-lock";
import { cardClass, type Me } from "./types";

interface MemoryItem {
  id: string;
  text: string;
  categoryName: string | null;
  hits: number;
}

/** "Recipient / word -> category" mappings the bot learned from the user's corrections. */
export function MemoryCard({ me, embedded = false }: { me: Me; embedded?: boolean }) {
  const { api } = useLiff();
  const locked = !me.features.merchantMemory;
  // null path = nothing to fetch while the feature is locked
  const memory = useApi<{ items: MemoryItem[] }>(locked ? null : "/api/memory");
  const [notice, setNotice] = useState<string | null>(null);
  const items = memory.data?.items ?? [];

  async function forget(item: MemoryItem) {
    setNotice(null);
    try {
      await api(`/api/memory/${item.id}`, { method: "DELETE" });
      setNotice("ลืมแล้ว");
      memory.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <section className={embedded ? "space-y-3" : cardClass} aria-label="จัดหมวดด้วยความจำ">
      <div>
        {embedded ? null : <h2 className="font-semibold">จัดหมวดด้วยความจำ</h2>}
        <p className="text-xs text-muted">
          เมื่อคุณแก้หมวดของสลิป บอทจะจำ &quot;ผู้รับ → หมวด&quot; ไว้ใช้ครั้งต่อไป
        </p>
      </div>

      {locked ? (
        <PlusLock>ให้บอทจำผู้รับ/ร้านค้ากับหมวดที่คุณเลือก</PlusLock>
      ) : memory.loading ? (
        <LoadingBlock rows={1} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          ยังไม่มีที่จำไว้ ลองส่งสลิปแล้วกด &quot;แก้ไขหมวด&quot; ดูนะ
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.text}</p>
                <p className="truncate text-xs text-muted">
                  → {m.categoryName ?? "หมวดที่ถูกลบ"} · ใช้ {m.hits} ครั้ง
                </p>
              </div>
              <button
                type="button"
                aria-label={`ลืม ${m.text}`}
                onClick={() => forget(m)}
                className="flex h-11 w-11 shrink-0 items-center justify-center text-muted"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
