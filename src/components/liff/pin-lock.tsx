"use client";

import { Lock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { formatThaiDate } from "@/lib/thai-date";

interface PinInfo {
  lockedUntil: string | null;
  triesLeft: number;
  resetAt: string | null;
}
type UnlockResult =
  { ok: true } | { ok: false; error: string; triesLeft?: number; lockedUntil?: string };

/** "12 นาที 05 วินาที" until the lock-out ends. */
const countdown = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return m > 0 ? `${m} นาที ${s} วินาที` : `${s} วินาที`;
};

/**
 * Full-screen PIN prompt shown instead of the app while a PIN is set and has not been typed. It only
 * asks; the server is what refuses data without the unlock token.
 */
export function PinLock({
  pin,
  unlock,
  requestReset,
  cancelReset,
}: {
  pin: PinInfo | null;
  unlock: (pin: string) => Promise<UnlockResult>;
  requestReset: () => Promise<string | null>;
  cancelReset: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const lockedMs = pin?.lockedUntil ? new Date(pin.lockedUntil).getTime() - now : 0;
  const lockedOut = lockedMs > 0;

  useEffect(() => {
    if (!lockedOut) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedOut]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || lockedOut || typed.length < 4) return;
    setBusy(true);
    setError(null);
    const result = await unlock(typed);
    setBusy(false);
    setNow(Date.now());
    if (!result.ok) {
      setTyped("");
      setError(
        result.triesLeft !== undefined && !result.lockedUntil
          ? `${result.error} (เหลืออีก ${result.triesLeft} ครั้ง)`
          : result.error,
      );
    }
  }

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      await requestReset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await cancelReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-10">
      <Logo size={72} />
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Lock className="h-5 w-5" aria-hidden /> ใส่ PIN เพื่อดูข้อมูล
      </h1>
      <form onSubmit={submit} className="w-full space-y-3">
        <label htmlFor="pin-input" className="sr-only">
          PIN 4–6 หลัก
        </label>
        <input
          id="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          value={typed}
          disabled={busy || lockedOut}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN 4–6 หลัก"
          className="num h-14 w-full rounded-2xl border border-border bg-background px-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary disabled:opacity-50"
        />
        {lockedOut ? (
          <p role="alert" className="text-center text-sm text-expense">
            ใส่ผิดหลายครั้ง ลองใหม่ได้ใน{" "}
            <span className="num font-semibold">{countdown(lockedMs)}</span>
          </p>
        ) : error ? (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || lockedOut || typed.length < 4}
          className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-40"
        >
          {busy ? "กำลังตรวจ..." : "ปลดล็อก"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setForgot((v) => !v)}
        aria-expanded={forgot}
        className="min-h-11 text-sm font-medium text-primary underline"
      >
        ลืม PIN?
      </button>
      {forgot ? (
        <section className="w-full space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm shadow-card">
          {pin?.resetAt ? (
            <>
              <p>
                รับคำขอลบ PIN แล้ว PIN จะถูกลบ{" "}
                <span className="font-semibold">{formatThaiDate(new Date(pin.resetAt), true)}</span>{" "}
                หลังจากนั้นเปิดใช้งานได้โดยไม่ต้องใส่ PIN (ตั้งใหม่ได้ที่หน้าตั้งค่า)
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void cancel()}
                className="h-11 w-full rounded-2xl border border-border font-semibold"
              >
                ยกเลิกคำขอ
              </button>
            </>
          ) : (
            <>
              <p>
                เพื่อความปลอดภัย การลบ PIN ต้องรอ <strong>24 ชั่วโมง</strong> และเราจะแจ้งเตือนในแชท
                LINE ของคุณพร้อมปุ่มยกเลิก ถ้าไม่ใช่คุณที่ขอ ให้กดยกเลิกในแชทได้เลย
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void ask()}
                className="h-11 w-full rounded-2xl border border-expense font-semibold text-expense"
              >
                ขอลบ PIN
              </button>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
