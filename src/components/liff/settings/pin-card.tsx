"use client";

import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { Sheet } from "@/components/liff/sheet";
import { formatThaiDate } from "@/lib/thai-date";
import { PlusLock } from "./plus-lock";
import { cardClass, fieldClass } from "./types";

interface PinStatus {
  hasPin: boolean;
  required: boolean;
  canSet: boolean;
  resetAt: string | null;
}

type Mode = "set" | "change" | "disable";

const pinField = `${fieldClass} num text-center tracking-[0.4em]`;

/** Turn the PIN lock on, change it, or turn it off. The PIN is only ever sent to the server, never kept here. */
export function PinCard() {
  const { api, adoptUnlock } = useLiff();
  const status = useApi<PinStatus>("/api/pin/status");
  const [mode, setMode] = useState<Mode | null>(null);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const s = status.data;

  function close() {
    if (busy) return;
    setMode(null);
    setCurrent("");
    setPin("");
    setConfirm("");
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "disable") {
        await api("/api/pin/disable", { method: "POST", body: JSON.stringify({ pin: current }) });
        adoptUnlock(null);
        setNotice("ปิดการล็อกด้วย PIN แล้ว");
      } else {
        const res = await api<{ token: string }>("/api/pin/set", {
          method: "POST",
          body: JSON.stringify({
            pin,
            confirmPin: confirm,
            ...(mode === "change" ? { current } : {}),
          }),
        });
        adoptUnlock(res.token);
        setNotice(mode === "set" ? "ตั้ง PIN แล้ว ครั้งหน้าที่เปิดจะถาม PIN" : "เปลี่ยน PIN แล้ว");
      }
      setBusy(false);
      close();
      status.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
      setBusy(false);
    }
  }

  const valid = (v: string) => /^\d{4,6}$/.test(v);
  const ready =
    mode === "disable"
      ? valid(current)
      : mode === "change"
        ? valid(current) && valid(pin) && confirm.length > 0
        : valid(pin) && confirm.length > 0;

  return (
    <section className={cardClass} aria-label="ล็อกด้วย PIN">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">ล็อกหน้าเว็บด้วย PIN</h2>
          <p className="text-xs text-muted">
            ต้องใส่ PIN 4–6 หลักก่อนเห็นตัวเลขและรายการในหน้าเว็บ (สรุป วิเคราะห์ รายการ ฯลฯ)
          </p>
        </div>
        {s?.hasPin ? (
          <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            {s.required ? "เปิดอยู่" : "พักไว้"}
          </span>
        ) : null}
      </div>

      {s && !s.canSet && !s.hasPin ? (
        <PlusLock>ป้องกันคนอื่นที่ถือโทรศัพท์ของคุณไม่ให้เปิดดูข้อมูลการเงินในหน้าเว็บ</PlusLock>
      ) : null}
      {s?.hasPin && !s.required ? (
        <p className="text-xs text-muted">
          แผนของคุณหมดอายุ จึงยังไม่ถาม PIN (PIN ที่ตั้งไว้ยังอยู่ จะกลับมาใช้เมื่อต่ออายุแผน)
        </p>
      ) : null}
      {s?.resetAt ? (
        <p className="rounded-2xl bg-primary-soft px-3 py-2 text-xs text-primary">
          มีคำขอลบ PIN จะมีผล {formatThaiDate(new Date(s.resetAt), true)}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}

      {s ? (
        s.hasPin ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!s.canSet}
              onClick={() => setMode("change")}
              className="h-11 rounded-2xl border border-border text-sm font-semibold disabled:opacity-40"
            >
              เปลี่ยน PIN
            </button>
            <button
              type="button"
              onClick={() => setMode("disable")}
              className="h-11 rounded-2xl border border-expense text-sm font-semibold text-expense"
            >
              ปิดการล็อก
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!s.canSet}
            onClick={() => setMode("set")}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-surface disabled:opacity-40"
          >
            <KeyRound className="h-4 w-4" aria-hidden /> ตั้ง PIN
          </button>
        )
      ) : null}

      <p className="text-xs text-muted">
        PIN ล็อกเฉพาะหน้าเว็บ ไม่ได้ล็อกการคุยกับบอทในแชท LINE ถ้าอยากกันแชทด้วย ให้เปิด Passcode
        ของ LINE (ตั้งค่า LINE → ความเป็นส่วนตัว → ล็อกด้วยรหัสผ่าน)
      </p>

      {mode ? (
        <Sheet
          title={
            mode === "set" ? "ตั้ง PIN" : mode === "change" ? "เปลี่ยน PIN" : "ปิดการล็อกด้วย PIN"
          }
          onClose={close}
        >
          <form onSubmit={submit} className="space-y-3">
            {mode !== "set" ? (
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={current}
                onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
                placeholder="PIN ปัจจุบัน"
                aria-label="PIN ปัจจุบัน"
                className={pinField}
              />
            ) : null}
            {mode !== "disable" ? (
              <>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="PIN ใหม่ 4–6 หลัก"
                  aria-label="PIN ใหม่"
                  className={pinField}
                />
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
                  placeholder="ใส่ PIN ใหม่อีกครั้ง"
                  aria-label="ยืนยัน PIN ใหม่"
                  className={pinField}
                />
                <p className="text-xs text-muted">หลีกเลี่ยงเลขเดาง่าย เช่น 1234 หรือเลขซ้ำ</p>
              </>
            ) : (
              <p className="text-sm text-muted">ใส่ PIN ปัจจุบันเพื่อยืนยันการปิด</p>
            )}
            {error ? (
              <p role="alert" className="text-sm text-expense">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !ready}
              className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-40"
            >
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </form>
        </Sheet>
      ) : null}
    </section>
  );
}
