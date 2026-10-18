"use client";

import { ArrowLeft, ArrowRightLeft, Pencil, Plus, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { Sheet } from "@/components/liff/sheet";
import { PlusLock } from "@/components/liff/settings/plus-lock";
import { cardClass, fieldClass, type Me } from "@/components/liff/settings/types";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { MAX_TRANSFER_NOTE, type TransferDto } from "@/lib/transfer";
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
  creditLimitSatang: number | null;
  statementDay: number | null;
  dueDay: number | null;
  card: {
    owedSatang: number;
    limitSatang: number | null;
    availableSatang: number | null;
    usedPercent: number | null;
    cycleSpentSatang: number;
    previousCycleSpentSatang: number;
    nextStatement: string | null;
    nextDue: string | null;
  } | null;
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
  const me = useApi<Me>("/api/me");
  const transfers = useApi<{ items: TransferDto[] }>("/api/transfers");
  const [transferring, setTransferring] = useState(false);
  const [editing, setEditing] = useState<WalletItem | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const items = wallets.data?.items ?? [];

  async function act(run: () => Promise<unknown>, done: string) {
    setNotice(null);
    try {
      await run();
      setNotice(done);
      wallets.reload();
      transfers.reload();
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
                <li key={w.id} className={cardClass}>
                  <div className="flex items-center gap-3">
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
                  </div>
                  {w.card ? <CardDetails card={w.card} /> : null}
                </li>
              ))}
            </ul>

            {items.length > 1 ? (
              <section className={cardClass} aria-label="โอนระหว่างกระเป๋า">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">โอนระหว่างกระเป๋า</h2>
                    <p className="text-xs text-muted">ไม่นับเป็นรายรับหรือรายจ่าย</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTransferring(true)}
                    disabled={!me.data?.features.transfer}
                    className="flex h-11 items-center gap-1 rounded-2xl bg-primary px-3 text-sm font-semibold text-surface disabled:opacity-40"
                  >
                    <ArrowRightLeft className="h-4 w-4" aria-hidden /> โอน
                  </button>
                </div>
                {me.data && !me.data.features.transfer ? (
                  <PlusLock>โอนเงินระหว่างกระเป๋าของคุณได้โดยไม่กระทบสรุปรายรับ-รายจ่าย</PlusLock>
                ) : null}
                {(transfers.data?.items.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted">ยังไม่มีรายการโอน</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {transfers.data?.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {t.fromName} → {t.toName}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {formatThaiDate(new Date(t.occurredAt))}
                            {t.note ? ` · ${t.note}` : ""}
                          </p>
                        </div>
                        <p className="num shrink-0 text-sm font-bold">
                          ฿{formatBaht(t.amountSatang)}
                        </p>
                        <button
                          type="button"
                          aria-label={`ยกเลิกการโอน ${t.fromName} ไป ${t.toName}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                "ยกเลิกการโอนนี้ใช่ไหม? ยอดสองกระเป๋าจะกลับเป็นเหมือนเดิม",
                              )
                            ) {
                              void act(
                                () => api(`/api/transfers/${t.id}`, { method: "DELETE" }),
                                "ยกเลิกการโอนแล้ว",
                              );
                            }
                          }}
                          className="flex h-11 w-9 shrink-0 items-center justify-center text-muted"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

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

      {transferring ? (
        <TransferSheet
          wallets={items}
          onClose={() => setTransferring(false)}
          onSaved={() => {
            setTransferring(false);
            setNotice("โอนแล้ว");
            wallets.reload();
            transfers.reload();
          }}
        />
      ) : null}

      {editing ? (
        <WalletSheet
          wallet={editing === "new" ? null : editing}
          canCard={me.data?.features.creditCard === true}
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

function CardDetails({ card }: { card: NonNullable<WalletItem["card"]> }) {
  const percent = card.usedPercent;
  return (
    <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
      <div className="flex justify-between">
        <span className="text-muted">ยอดค้างชำระ</span>
        <span className="num font-semibold">{money(card.owedSatang)}</span>
      </div>
      {card.limitSatang !== null && card.availableSatang !== null ? (
        <>
          <div className="flex justify-between">
            <span className="text-muted">
              {card.availableSatang < 0 ? "เกินวงเงิน" : "วงเงินคงเหลือ"} (จาก{" "}
              {money(card.limitSatang)})
            </span>
            <span
              className={cn(
                "num font-semibold",
                card.availableSatang < 0 ? "text-expense" : "text-income",
              )}
            >
              {money(Math.abs(card.availableSatang))}
            </span>
          </div>
          {percent !== null ? (
            <div
              role="progressbar"
              aria-label="การใช้วงเงิน"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, percent)}
              aria-valuetext={`ใช้วงเงินไป ${percent}%`}
              className="h-2 overflow-hidden rounded-full bg-border"
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  percent >= 100 ? "bg-expense" : percent >= 80 ? "bg-amber-600" : "bg-primary",
                )}
                style={{ width: `${Math.min(100, Math.max(percent > 0 ? 3 : 0, percent))}%` }}
              />
            </div>
          ) : null}
          {percent !== null ? <p className="text-xs text-muted">ใช้วงเงินไป {percent}%</p> : null}
        </>
      ) : null}
      {card.nextStatement ? (
        <>
          <div className="flex justify-between">
            <span className="text-muted">ยอดใช้รอบนี้</span>
            <span className="num">{money(card.cycleSpentSatang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ยอดใช้รอบที่แล้ว</span>
            <span className="num">{money(card.previousCycleSpentSatang)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">ตัดรอบบิลถัดไป</span>
            <span>{formatThaiDate(new Date(card.nextStatement))}</span>
          </div>
        </>
      ) : null}
      {card.nextDue ? (
        <div className="flex justify-between">
          <span className="text-muted">ครบกำหนดชำระ</span>
          <span>{formatThaiDate(new Date(card.nextDue))}</span>
        </div>
      ) : null}
    </div>
  );
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function WalletSheet({
  wallet,
  canCard,
  onClose,
  onSaved,
}: {
  wallet: WalletItem | null;
  canCard: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useLiff();
  const [name, setName] = useState(wallet?.name ?? "");
  const [kind, setKind] = useState<WalletKind>(wallet?.kind ?? "bank");
  const [opening, setOpening] = useState(
    wallet && wallet.openingSatang !== 0 ? (wallet.openingSatang / 100).toFixed(2) : "",
  );
  const [limit, setLimit] = useState(
    wallet?.creditLimitSatang ? (wallet.creditLimitSatang / 100).toFixed(2) : "",
  );
  const [statementDay, setStatementDay] = useState(wallet?.statementDay ?? 0);
  const [dueDay, setDueDay] = useState(wallet?.dueDay ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeThaiDigits(opening).replace(/,/g, "").trim();
    const limitText = normalizeThaiDigits(limit).replace(/,/g, "").trim();
    if (kind === "card" && canCard && limitText && !/^\d{1,10}(\.\d{1,2})?$/.test(limitText)) {
      return setError("วงเงินไม่ถูกต้อง (เช่น 50000)");
    }
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
        // only a card has these; a locked plan sends nothing so the save still works
        ...(kind === "card" && canCard
          ? {
              creditLimit: limitText || null,
              statementDay: statementDay || null,
              dueDay: dueDay || null,
            }
          : {}),
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
        {kind === "card" ? (
          canCard ? (
            <>
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="decimal"
                placeholder="วงเงิน (บาท) เช่น 50000"
                aria-label="วงเงิน"
                className={cn(fieldClass, "num")}
              />
              <select
                value={statementDay}
                onChange={(e) => setStatementDay(Number(e.target.value))}
                aria-label="วันตัดรอบบิล"
                className={fieldClass}
              >
                <option value={0}>วันตัดรอบบิล (ไม่ระบุ)</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    ตัดรอบทุกวันที่ {d}
                  </option>
                ))}
              </select>
              <select
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                aria-label="วันครบกำหนดชำระ"
                className={fieldClass}
              >
                <option value={0}>วันครบกำหนดชำระ (ไม่ระบุ)</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    ครบกำหนดทุกวันที่ {d}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <PlusLock>ตั้งวงเงิน วันตัดรอบ และดูยอดตามรอบบิลของบัตรเครดิต</PlusLock>
          )
        ) : null}
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

function TransferSheet({
  wallets,
  onClose,
  onSaved,
}: {
  wallets: WalletItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useLiff();
  const [fromId, setFromId] = useState(wallets[0]?.id ?? "");
  const [toId, setToId] = useState(wallets[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeThaiDigits(amount).replace(/,/g, "").trim();
    if (fromId === toId) return setError("เลือกสองกระเป๋าที่ต่างกันนะ");
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      return setError("จำนวนเงินไม่ถูกต้อง (เช่น 500 หรือ 500.50)");
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/transfers", {
        method: "POST",
        body: JSON.stringify({ fromId, toId, amount: normalized, note: note.trim() || null }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "โอนไม่สำเร็จ");
      setSaving(false);
    }
  }

  const options = wallets.map((w) => (
    <option key={w.id} value={w.id}>
      {WALLET_KIND_EMOJI[w.kind]} {w.name}
    </option>
  ));

  return (
    <Sheet title="โอนระหว่างกระเป๋า" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          aria-label="จากกระเป๋า"
          className={fieldClass}
        >
          {options}
        </select>
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          aria-label="ไปกระเป๋า"
          className={fieldClass}
        >
          {options}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="จำนวนเงิน (บาท)"
          aria-label="จำนวนเงินที่โอน"
          className={cn(fieldClass, "num")}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_TRANSFER_NOTE}
          placeholder="โน้ต (ไม่บังคับ)"
          aria-label="โน้ตการโอน"
          className={fieldClass}
        />
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
          {saving ? "กำลังโอน..." : "โอน"}
        </button>
      </form>
    </Sheet>
  );
}
