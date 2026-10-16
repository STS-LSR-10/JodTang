"use client";

import { Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { useLiff } from "@/components/liff/liff-provider";
import { cardClass, fieldClass, type Me } from "./types";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

export function ReferralCard({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const { api } = useLiff();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shareText = `มาจดรายรับรายจ่ายง่าย ๆ ในไลน์กับจดตังค์ (JodTang) ด้วยกันนะ เพิ่มเพื่อนแล้วพิมพ์ "ใช้รหัส ${me.referralCode}" ทั้งคู่ได้โบนัสตังสะสม${
    LIFF_ID ? `\nhttps://liff.line.me/${LIFF_ID}` : ""
  }`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(me.referralCode);
      setNotice("คัดลอกรหัสแล้ว");
    } catch {
      setNotice("คัดลอกอัตโนมัติไม่ได้ ลองกดค้างที่รหัสเพื่อคัดลอกนะ");
    }
  }

  async function apply() {
    if (!code.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ message: string }>("/api/referral", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setNotice(res.message);
      setCode("");
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ใช้รหัสไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cardClass} aria-label="ชวนเพื่อน">
      <h2 className="font-semibold">ชวนเพื่อน</h2>
      <p className="text-xs text-muted">
        เพื่อนใช้รหัสของคุณแล้วจดรายการแรก ทั้งคู่ได้โบนัสตังสะสม
      </p>

      <div className="flex items-center gap-2">
        <p
          className="num flex-1 select-all rounded-2xl bg-primary-soft px-4 py-3 text-center text-xl font-bold tracking-widest text-primary"
          aria-label="รหัสชวนเพื่อนของคุณ"
        >
          {me.referralCode}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label="คัดลอกรหัส"
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border"
        >
          <Copy className="h-4 w-4" aria-hidden />
        </button>
        <a
          href={`https://line.me/R/share?text=${encodeURIComponent(shareText)}`}
          aria-label="ส่งให้เพื่อน"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-surface"
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </a>
      </div>

      {!me.referred ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">มีรหัสจากเพื่อน?</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={16}
              placeholder="เช่น ABCD1234"
              aria-label="รหัสของเพื่อน"
              autoCapitalize="characters"
              className={`${fieldClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={apply}
              disabled={busy || code.trim().length < 4}
              className="h-12 rounded-2xl bg-primary px-4 text-sm font-semibold text-surface disabled:opacity-60"
            >
              ใช้รหัส
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">คุณใช้รหัสชวนเพื่อนแล้ว</p>
      )}

      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
