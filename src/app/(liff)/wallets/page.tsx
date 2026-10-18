"use client";

import { ArrowLeft, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { Sheet } from "@/components/liff/sheet";
import { cardClass, fieldClass } from "@/components/liff/settings/types";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { formatBaht } from "@/lib/money";
import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import {
  MAX_WALLET_NAME,
  WALLET_KINDS,
  WALLET_KIND_EMOJI,
  WALLET_KIND_LABEL,
  type WalletKind,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

interface WalletItem {
  id: string;
  name: string;
  kind: WalletKind;
  isDefault: boolean;
  openingSatang: number;
  balanceSatang: number;
  entryCount: number;
}

interface WalletsResponse {
  items: WalletItem[];
  totalSatang: number;
  limit: number;
  canAdd: boolean;
}

const money = (satang: number) => `${satang < 0 ? "-" : ""}฿${formatBaht(Math.abs(satang))}`;
const BALANCE_PATTERN = /^-?\d{1,10}(\.\d{1,2})?$/;

export default function WalletsPage() {
  const { api } = useLiff();
  const wallets = useApi<WalletsResponse>("/api/wallets");
  const [editing, setEditing] = useState<WalletItem | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const items = wallets.data?.items ?? [];

  async function act(run: () => Promise<unknown>, done: string) {
    setNotice(null);
    try {
      await run();
      setNotice(done);
      wallets.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  return (
    <main>
      <PageHeader
        title="กระเป๋าเงิน"
        right={
          <Link
            href="/settings"
            aria-label="กลับไปตั้งค่า"
            className="flex h-11 w-11 items-center justify-center text-muted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        }
      />
      <div className="space-y-4 px-4 pb-4">
        {wallets.loading ? (
          <LoadingBlock rows={3} />
        ) : wallets.error || !wallets.data ? (
          <ErrorState message={wallets.error ?? "โหลดไม่สำเร็จ"} onRetry={wallets.reload} />
        ) : (
          <>
            <section className={cardClass} aria-label="ยอดรวม">
              <p className="text-sm text-muted">รวมทุกกระเป๋า</p>
              <p
                className={cn(
                  "num text-2xl font-bold",
                  wallets.data.totalSatang < 0 ? "text-expense" : "text-income",
                )}
              >
                {money(wallets.data.totalSatang)}
              </p>
              <p className="text-xs text-muted">
                ยอดคงเหลือ = ยอดตั้งต้น + รายรับ − รายจ่าย · จดลงกระเป๋าอื่นในแชทโดยใส่ @ชื่อ เช่น
                &quot;กาแฟ 45 @บัตร&quot;
              </p>
            </section>

            <ul className="space-y-3" aria-label="รายการกระเป๋า">
              {items.map((w) => (
                <li key={w.id} className={cn(cardClass, "flex items-center gap-3")}>
                  <span className="text-2xl" aria-hidden>
                    {WALLET_KIND_EMOJI[w.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {w.name}
                      {w.isDefault && items.length > 1 ? (
                        <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">
                          หลัก
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {WALLET_KIND_LABEL[w.kind]} · {w.entryCount} รายการ
                    </p>
                  </div>
                  <p
                    className={cn(
                      "num shrink-0 text-sm font-bold",
                      w.balanceSatang < 0 ? "text-expense" : "text-income",
                    )}
                  >
                    {money(w.balanceSatang)}
                  </p>
                  {!w.isDefault ? (
                    <button
                      type="button"
                      aria-label={`ตั้ง ${w.name} เป็นกระเป๋าหลัก`}
                      onClick={() =>
                        act(
                          () =>
                            api(`/api/wallets/${w.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ isDefault: true }),
                            }),
                          `ตั้ง ${w.name} เป็นกระเป๋าหลักแล้ว`,
                        )
                      }
                      className="flex h-11 w-9 shrink-0 items-center justify-center text-muted"
                    >
                      <Star className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`แก้ไข ${w.name}`}
                    onClick={() => setEditing(w)}
                    className="flex h-11 w-9 shrink-0 items-center justify-center text-muted"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  {!w.isDefault ? (
                    <button
                      type="button"
                      aria-label={`ลบ ${w.name}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `ลบกระเป๋า "${w.name}" ใช่ไหม? รายการในกระเป๋านี้ไม่หาย แต่จะย้ายไปกระเป๋าหลัก`,
                          )
                        ) {
                          void act(
                            () => api(`/api/wallets/${w.id}`, { method: "DELETE" }),
                            "ลบกระเป๋าแล้ว",
                          );
                        }
                      }}
                      className="flex h-11 w-9 shrink-0 items-center justify-center text-muted"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>

            {notice ? (
              <p
                role="status"
                className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary"
              >
                {notice}
              </p>
            ) : null}

            {wallets.data.canAdd ? (
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="flex h-12 w-full items-center justify-center gap-1 rounded-2xl bg-primary text-base font-semibold text-surface"
              >
                <Plus className="h-5 w-5" aria-hidden /> เพิ่มกระเป๋า
              </button>
            ) : (
              <p className="rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary">
                แผนปัจจุบันมีกระเป๋าได้ {wallets.data.limit} ใบ{" "}
                <Link href="/upgrade" className="font-semibold underline">
                  ดูแผนอัปเกรด
                </Link>{" "}
                (Professional มีได้ 5 ใบ · Ultimate ไม่จำกัด)
              </p>
            )}
          </>
        )}
      </div>

      {editing ? (
        <WalletSheet
          wallet={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            wallets.reload();
          }}
        />
      ) : null}
    </main>
  );
}

function WalletSheet({
  wallet,
  onClose,
  onSaved,
}: {
  wallet: WalletItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useLiff();
  const [name, setName] = useState(wallet?.name ?? "");
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? "bank");
  const [opening, setOpening] = useState(
    wallet && wallet.openingSatang !== 0 ? (wallet.openingSatang / 100).toFixed(2) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeThaiDigits(opening).replace(/,/g, "").trim();
    if (!name.trim()) return setError("ตั้งชื่อกระเป๋าด้วยนะ");
    if (normalized && !BALANCE_PATTERN.test(normalized)) {
      return setError("ยอดตั้งต้นไม่ถูกต้อง (เช่น 5000 หรือ -1200.50)");
    }
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        kind,
        openingBalance: normalized || null,
      });
      if (wallet) {
        await api(`/api/wallets/${wallet.id}`, { method: "PATCH", body });
      } else {
        await api("/api/wallets", { method: "POST", body });
      }
      onSaved(wallet ? "บันทึกแล้ว" : "เพิ่มกระเป๋าแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Sheet title={wallet ? "แก้ไขกระเป๋า" : "เพิ่มกระเป๋า"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_WALLET_NAME}
          placeholder="ชื่อกระเป๋า เช่น บัตร KTC"
          aria-label="ชื่อกระเป๋า"
          className={fieldClass}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as WalletKind)}
          aria-label="ชนิดกระเป๋า"
          className={fieldClass}
        >
          {WALLET_KINDS.map((k) => (
            <option key={k} value={k}>
              {WALLET_KIND_EMOJI[k]} {WALLET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          inputMode="decimal"
          placeholder="ยอดตั้งต้น (บาท) เว้นว่าง = 0"
          aria-label="ยอดตั้งต้น"
          className={cn(fieldClass, "num")}
        />
        <p className="text-xs text-muted">บัตรเครดิตที่มียอดค้าง ใส่ติดลบได้ เช่น -3500</p>
        {error ? (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </form>
    </Sheet>
  );
}
