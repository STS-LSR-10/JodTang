"use client";

import {
  CheckSquare,
  Download,
  FolderInput,
  Image as ImageIcon,
  Plus,
  Receipt,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { Sheet } from "@/components/liff/sheet";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { TxItem } from "@/components/liff/tx-item";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { WALLET_KIND_EMOJI, type WalletKind } from "@/lib/wallet";
import type { TxDto } from "@/lib/dto";
import { formatBaht } from "@/lib/money";
import { satangToString } from "@/lib/money";
import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import { fromBangkokInputValue, toBangkokInputValue } from "@/lib/thai-date";
import { MAX_BULK, MAX_NOTE, MAX_TITLE } from "@/lib/tx-edit";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | "expense" | "income";

interface WalletsLite {
  items: { id: string; name: string; kind: WalletKind; isDefault: boolean }[];
}

interface ListResponse {
  items: TxDto[];
  hasMore: boolean;
  /** Totals of everything a search finds (Professional and above, first page only). */
  totals?: { incomeSatang: number; expenseSatang: number; count: number } | null;
}

interface CategoriesResponse {
  items: { id: string; type: "expense" | "income"; name: string }[];
}

interface BulkResponse {
  updated: number;
  skipped: number;
}

const PAGE_SIZE = 30;
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

const FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "expense", label: "รายจ่าย" },
  { value: "income", label: "รายรับ" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** The page reads `?q=` (the chat search card links here), which needs a Suspense boundary. */
export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingBlock rows={5} />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsView() {
  const { api } = useLiff();
  const [type, setType] = useState<TypeFilter>("all");
  const initialSearch = useSearchParams().get("q") ?? "";
  const [search, setSearch] = useState(initialSearch);
  const q = useDebounced(search.trim(), 300);
  const [extra, setExtra] = useState<TxDto[]>([]);
  const [extraMore, setExtraMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [slipFor, setSlipFor] = useState<TxDto | null>(null);
  const [photoFor, setPhotoFor] = useState<TxDto | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<TxDto | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [walletId, setWalletId] = useState("");
  const wallets = useApi<WalletsLite>("/api/wallets");

  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (type !== "all") p.set("type", type);
    if (q) p.set("q", q);
    if (walletId) p.set("accountId", walletId);
    return `/api/transactions?${p.toString()}`;
  }, [type, q, walletId]);

  const list = useApi<ListResponse>(path);

  // Filters changed (or reloaded): drop the pages loaded on top of the first one.
  useEffect(() => {
    setExtra([]);
    setExtraMore(null);
  }, [path, list.data]);

  const items = [...(list.data?.items ?? []), ...extra];
  const hasMore = extraMore ?? list.data?.hasMore ?? false;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api<ListResponse>(`${path}&offset=${items.length}`);
      setExtra((prev) => [...prev, ...res.items]);
      setExtraMore(res.hasMore);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "โหลดเพิ่มไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setMoveOpen(false);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK) next.add(id);
      return next;
    });
  }

  function bulkMessage(res: BulkResponse, done: string): string {
    return res.skipped > 0
      ? `${done} ${res.updated} รายการ (ข้าม ${res.skipped})`
      : `${done} ${res.updated} รายการ`;
  }

  async function bulkDelete() {
    if (!window.confirm(`ลบ ${selected.size} รายการที่เลือกใช่ไหม?`)) return;
    setBulkBusy(true);
    try {
      const res = await api<BulkResponse>("/api/transactions/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "delete", ids: [...selected] }),
      });
      setNotice(bulkMessage(res, "ลบแล้ว"));
      stopSelecting();
      list.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkMove(categoryId: string) {
    setBulkBusy(true);
    try {
      const res = await api<BulkResponse>("/api/transactions/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "move", ids: [...selected], categoryId }),
      });
      setNotice(bulkMessage(res, "ย้ายหมวดแล้ว"));
      stopSelecting();
      list.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ย้ายหมวดไม่สำเร็จ");
      setMoveOpen(false);
    } finally {
      setBulkBusy(false);
    }
  }

  async function remove(tx: TxDto) {
    if (!window.confirm(`ลบ "${tx.title}" ใช่ไหม?`)) return;
    try {
      await api(`/api/transactions/${tx.id}`, { method: "DELETE" });
      setNotice("ลบแล้ว");
      list.reload();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <main>
      <PageHeader
        title="รายการ"
        right={
          <div className="flex gap-2">
            {selecting ? (
              <button
                type="button"
                onClick={stopSelecting}
                className="flex h-11 items-center rounded-2xl border border-border bg-surface px-4 text-sm font-semibold"
              >
                ยกเลิก
              </button>
            ) : null}
            {!selecting && items.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="flex h-11 items-center gap-1 rounded-2xl border border-border bg-surface px-3 text-sm font-semibold text-primary"
              >
                <CheckSquare className="h-4 w-4" aria-hidden /> เลือก
              </button>
            ) : null}
            <button
              type="button"
              hidden={selecting}
              onClick={() => setExportOpen(true)}
              aria-label="ส่งออกไฟล์"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-primary"
            >
              <Download className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              hidden={selecting}
              onClick={() => setFormOpen(true)}
              className="flex h-11 items-center gap-1 rounded-2xl bg-primary px-4 text-sm font-semibold text-surface"
            >
              <Plus className="h-4 w-4" aria-hidden /> เพิ่ม
            </button>
          </div>
        }
      />

      <div className={cn("space-y-3 px-4 pb-4", selecting && "pb-24")}>
        <div role="tablist" aria-label="ประเภท" className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={type === f.value}
              type="button"
              onClick={() => setType(f.value)}
              className={cn(
                "h-10 flex-1 rounded-2xl border text-sm font-medium",
                type === f.value
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {(wallets.data?.items.length ?? 0) > 1 ? (
          <select
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            aria-label="กระเป๋า"
            className="h-10 w-full rounded-2xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">ทุกกระเป๋า</option>
            {wallets.data?.items.map((w) => (
              <option key={w.id} value={w.id}>
                {WALLET_KIND_EMOJI[w.kind]} {w.name}
              </option>
            ))}
          </select>
        ) : null}

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อรายการ หรือ #แท็ก"
          aria-label="ค้นหาชื่อรายการหรือแท็ก"
          className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
        />

        {q && list.data?.totals ? (
          <div
            role="status"
            aria-label="ยอดรวมของผลค้นหา"
            className="grid grid-cols-3 gap-2 rounded-2xl bg-primary-soft px-3 py-2 text-center text-xs"
          >
            <div>
              <p className="text-muted">รายรับ</p>
              <p className="num font-bold text-income">
                +฿{formatBaht(list.data.totals.incomeSatang)}
              </p>
            </div>
            <div>
              <p className="text-muted">รายจ่าย</p>
              <p className="num font-bold text-expense">
                -฿{formatBaht(list.data.totals.expenseSatang)}
              </p>
            </div>
            <div>
              <p className="text-muted">พบ</p>
              <p className="num font-bold">{list.data.totals.count} รายการ</p>
            </div>
          </div>
        ) : null}

        {notice ? (
          <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
            {notice}
          </p>
        ) : null}

        {list.loading ? (
          <LoadingBlock rows={5} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-card">
            <EmptyState
              title={q || type !== "all" ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีรายการ"}
              hint={
                q || type !== "all"
                  ? "ลองเปลี่ยนตัวกรองหรือคำค้นหาดูนะ"
                  : 'พิมพ์ "กาแฟ 30" ในแชท หรือกด "เพิ่ม" ด้านบนได้เลย'
              }
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
              {items.map((tx) => (
                <TxItem
                  key={tx.id}
                  tx={tx}
                  // somebody else's entry in a shared wallet can be read but not changed
                  onOpen={
                    tx.mine === false
                      ? undefined
                      : selecting
                        ? () => toggle(tx.id)
                        : () => setEditFor(tx)
                  }
                  leading={
                    selecting && tx.mine !== false ? (
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggle(tx.id)}
                        aria-label={`เลือก ${tx.title}`}
                        className="h-6 w-6 shrink-0 accent-[var(--primary)]"
                      />
                    ) : null
                  }
                  action={
                    selecting || tx.mine === false ? null : (
                      <div className="flex shrink-0">
                        {tx.hasPhoto ? (
                          <button
                            type="button"
                            onClick={() => setPhotoFor(tx)}
                            aria-label={`ดูรูปแนบ ${tx.title}`}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl text-primary"
                          >
                            <ImageIcon className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                        {tx.hasSlip ? (
                          <button
                            type="button"
                            onClick={() => setSlipFor(tx)}
                            aria-label={`ดูสลิป ${tx.title}`}
                            className="flex h-11 w-11 items-center justify-center rounded-2xl text-primary"
                          >
                            <Receipt className="h-4 w-4" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => remove(tx)}
                          aria-label={`ลบ ${tx.title}`}
                          className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    )
                  }
                />
              ))}
            </ul>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="h-11 w-full rounded-2xl border border-border bg-surface text-sm font-medium disabled:opacity-60"
              >
                {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
              </button>
            ) : null}
          </>
        )}
      </div>

      {selecting ? (
        <div
          role="region"
          aria-label="จัดการรายการที่เลือก"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2">
            <p className="num flex-1 text-sm font-semibold" aria-live="polite">
              เลือกแล้ว {selected.size} รายการ
            </p>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={() => setMoveOpen(true)}
              className="flex h-11 items-center gap-1 rounded-2xl border border-primary px-4 text-sm font-semibold text-primary disabled:opacity-50"
            >
              <FolderInput className="h-4 w-4" aria-hidden /> ย้ายหมวด
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || bulkBusy}
              onClick={bulkDelete}
              className="flex h-11 items-center gap-1 rounded-2xl bg-expense px-4 text-sm font-semibold text-surface disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> ลบ
            </button>
          </div>
        </div>
      ) : null}

      {moveOpen ? (
        <MoveSheet
          count={selected.size}
          busy={bulkBusy}
          onPick={bulkMove}
          onClose={() => setMoveOpen(false)}
        />
      ) : null}

      {editFor ? (
        <EditSheet
          tx={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null);
            setNotice("บันทึกแล้ว");
            list.reload();
          }}
        />
      ) : null}

      {slipFor ? <SlipSheet tx={slipFor} onClose={() => setSlipFor(null)} /> : null}

      {photoFor ? (
        <PhotoSheet
          tx={photoFor}
          onClose={() => setPhotoFor(null)}
          onRemoved={() => {
            setPhotoFor(null);
            setNotice("ลบรูปแนบแล้ว");
            list.reload();
          }}
        />
      ) : null}

      {exportOpen ? (
        <ExportSheet
          filters={{ type: type === "all" ? undefined : type, q: q || undefined }}
          onClose={() => setExportOpen(false)}
        />
      ) : null}

      {formOpen ? (
        <AddSheet
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setNotice("จดแล้ว");
            list.reload();
          }}
        />
      ) : null}
    </main>
  );
}

/**
 * Export what the list currently shows. The file link is opened in the phone's own browser
 * because the LINE in-app browser cannot download files.
 */
function ExportSheet({
  filters,
  onClose,
}: {
  filters: { type?: "expense" | "income"; q?: string };
  onClose: () => void;
}) {
  const { api, openExternal } = useLiff();
  const me = useApi<{ features: Record<string, boolean> }>("/api/me");
  const [busy, setBusy] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = me.data?.features.export === true;

  async function start(format: "csv" | "xlsx") {
    setBusy(format);
    setError(null);
    try {
      const res = await api<{ url: string }>("/api/export/link", {
        method: "POST",
        body: JSON.stringify({ format, ...filters }),
      });
      await openExternal(res.url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
      setBusy(null);
    }
  }

  return (
    <Sheet title="ส่งออกไฟล์" onClose={onClose}>
      {me.loading ? (
        <LoadingBlock rows={2} />
      ) : me.error ? (
        <ErrorState message={me.error} onRetry={me.reload} />
      ) : !allowed ? (
        <div className="space-y-3 text-center">
          <p className="text-base font-semibold">ส่งออก CSV / Excel สำหรับแผน Professional</p>
          <p className="text-sm text-muted">
            ดาวน์โหลดรายการไปทำบัญชีต่อในคอมพิวเตอร์หรือ Google Sheets ลองใช้ฟรี 7
            วันได้ที่หน้าอัปเกรด
          </p>
          <Link
            href="/upgrade"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-surface"
          >
            ดูแผน Professional
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            ส่งออกตามตัวกรองที่เลือกอยู่ (สูงสุด 5,000 แถว)
            ไฟล์จะเปิดในเบราว์เซอร์ของเครื่องเพื่อดาวน์โหลด ลิงก์ใช้ได้ 2 นาที
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => start("csv")}
            className="h-12 w-full rounded-2xl border border-primary text-base font-semibold text-primary disabled:opacity-60"
          >
            {busy === "csv" ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลด CSV"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => start("xlsx")}
            className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
          >
            {busy === "xlsx" ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลด Excel (.xlsx)"}
          </button>
          <p className="text-xs text-muted">
            ไฟล์ Excel มีชีตสรุปตามหมวดและสรุปรายเดือนเพิ่มให้ด้วย
          </p>
          {error ? (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

/** Shows the attached slip. The signed URL lives 60 s, so it is fetched on open, not stored. */
function SlipSheet({ tx, onClose }: { tx: TxDto; onClose: () => void }) {
  const slip = useApi<{ url: string }>(`/api/transactions/${tx.id}/slip`);
  return (
    <Sheet title={`สลิป: ${tx.title}`} onClose={onClose}>
      {slip.loading ? (
        <LoadingBlock rows={2} />
      ) : slip.error || !slip.data ? (
        <ErrorState message={slip.error ?? "เปิดสลิปไม่สำเร็จ"} onRetry={slip.reload} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={slip.data.url}
          alt={`สลิปของรายการ ${tx.title}`}
          className="mx-auto max-h-[70vh] w-full rounded-2xl border border-border object-contain"
        />
      )}
    </Sheet>
  );
}

/** Shows the photo attached to an entry, and lets the person remove it. */
function PhotoSheet({
  tx,
  onClose,
  onRemoved,
}: {
  tx: TxDto;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { api } = useLiff();
  const photo = useApi<{ url: string }>(`/api/transactions/${tx.id}/photo`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("ลบรูปแนบนี้ใช่ไหม? ลบแล้วกู้คืนไม่ได้")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/transactions/${tx.id}/photo`, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ลบรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`รูปแนบ: ${tx.title}`} onClose={onClose}>
      {photo.loading ? (
        <LoadingBlock rows={2} />
      ) : photo.error || !photo.data ? (
        <ErrorState message={photo.error ?? "เปิดรูปไม่สำเร็จ"} onRetry={photo.reload} />
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.data.url}
            alt={`รูปแนบของรายการ ${tx.title}`}
            className="mx-auto max-h-[60vh] w-full rounded-2xl border border-border object-contain"
          />
          {error ? (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold text-expense disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> {busy ? "กำลังลบ..." : "ลบรูปแนบ"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { api } = useLiff();
  const categories = useApi<CategoriesResponse>("/api/categories");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = (categories.data?.items ?? []).filter((c) => c.type === type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeThaiDigits(amount).replace(/,/g, "").trim();
    if (!title.trim()) return setError("ใส่ชื่อรายการด้วยนะ");
    if (!AMOUNT_PATTERN.test(normalized) || Number(normalized) <= 0) {
      return setError("จำนวนเงินไม่ถูกต้อง (เช่น 50 หรือ 50.50)");
    }
    setSaving(true);
    setError(null);
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          type,
          title: title.trim(),
          amount: normalized,
          categoryId: categoryId || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-foreground/40" role="dialog" aria-modal>
      <form
        onSubmit={submit}
        className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">เพิ่มรายการ</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="h-11 w-11">
            <X className="mx-auto h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภท">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={cn(
                "h-11 rounded-2xl border text-sm font-semibold",
                type === t
                  ? t === "expense"
                    ? "border-expense bg-expense/10 text-expense"
                    : "border-income bg-income/10 text-income"
                  : "border-border text-muted",
              )}
            >
              {t === "expense" ? "รายจ่าย" : "รายรับ"}
            </button>
          ))}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          placeholder="ชื่อรายการ เช่น กาแฟ"
          aria-label="ชื่อรายการ"
          className="h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="จำนวนเงิน (บาท)"
          aria-label="จำนวนเงิน"
          className="num h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="หมวดหมู่"
          className="h-12 w-full rounded-2xl border border-border bg-background px-3 outline-none focus:border-primary"
        >
          <option value="">เลือกให้อัตโนมัติ</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

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
    </div>
  );
}

/** Pick the category to move the selected entries into (entries of the other type are skipped). */
function MoveSheet({
  count,
  busy,
  onPick,
  onClose,
}: {
  count: number;
  busy: boolean;
  onPick: (categoryId: string) => void;
  onClose: () => void;
}) {
  const categories = useApi<CategoriesResponse>("/api/categories");
  const [categoryId, setCategoryId] = useState("");
  const items = categories.data?.items ?? [];
  const expense = items.filter((c) => c.type === "expense");
  const income = items.filter((c) => c.type === "income");

  return (
    <Sheet title={`ย้ายหมวด ${count} รายการ`} onClose={onClose}>
      {categories.loading ? (
        <LoadingBlock rows={2} />
      ) : categories.error ? (
        <ErrorState message={categories.error} onRetry={categories.reload} />
      ) : (
        <div className="space-y-3">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="หมวดปลายทาง"
            className="h-12 w-full rounded-2xl border border-border bg-background px-3 outline-none focus:border-primary"
          >
            <option value="">เลือกหมวดปลายทาง</option>
            <optgroup label="รายจ่าย">
              {expense.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="รายรับ">
              {income.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-xs text-muted">
            ย้ายได้เฉพาะรายการที่เป็นประเภทเดียวกับหมวดที่เลือก รายการประเภทอื่นจะถูกข้าม
          </p>
          <button
            type="button"
            disabled={!categoryId || busy}
            onClick={() => onPick(categoryId)}
            className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
          >
            {busy ? "กำลังย้าย..." : "ย้ายหมวด"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Edit one confirmed entry. Only fields that changed are sent. */
function EditSheet({
  tx,
  onClose,
  onSaved,
}: {
  tx: TxDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useLiff();
  const categories = useApi<CategoriesResponse>("/api/categories");
  const wallets = useApi<WalletsLite>("/api/wallets");
  const walletItems = wallets.data?.items ?? [];
  const mainWalletId = walletItems.find((w) => w.isDefault)?.id ?? "";
  const initial = useMemo(
    () => ({
      type: tx.type,
      title: tx.title,
      amount: satangToString(tx.amountSatang),
      categoryId: tx.categoryId ?? "",
      when: toBangkokInputValue(new Date(tx.occurredAt)),
      note: tx.note ?? "",
    }),
    [tx],
  );
  const [type, setType] = useState(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [amount, setAmount] = useState(initial.amount);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [when, setWhen] = useState(initial.when);
  const [note, setNote] = useState(initial.note);
  const [pickedWallet, setPickedWallet] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An entry without a wallet belongs to the main one.
  const currentWallet = tx.accountId ?? mainWalletId;
  const walletValue = pickedWallet ?? currentWallet;
  const typeChanged = type !== initial.type;
  const options = (categories.data?.items ?? []).filter((c) => c.type === type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeThaiDigits(amount).replace(/,/g, "").trim();
    if (!title.trim()) return setError("ใส่ชื่อรายการด้วยนะ");
    if (!AMOUNT_PATTERN.test(normalized) || Number(normalized) <= 0) {
      return setError("จำนวนเงินไม่ถูกต้อง (เช่น 50 หรือ 50.50)");
    }
    const at = fromBangkokInputValue(when);
    if (!at) return setError("วันเวลาไม่ถูกต้อง");

    const body: Record<string, unknown> = {};
    if (title.trim() !== initial.title) body.title = title.trim();
    if (Number(normalized) !== Number(initial.amount)) body.amount = normalized;
    if (typeChanged) body.type = type;
    // After a type change an empty choice means "pick for me"; otherwise it means no category.
    if (categoryId !== initial.categoryId && !(typeChanged && categoryId === "")) {
      body.categoryId = categoryId || null;
    }
    if (when !== initial.when) body.occurredAt = at.toISOString();
    if (note.trim() !== initial.note.trim()) body.note = note.trim() || null;
    if (pickedWallet && pickedWallet !== currentWallet) body.accountId = pickedWallet;
    if (Object.keys(body).length === 0) return onClose();

    setSaving(true);
    setError(null);
    try {
      await api(`/api/transactions/${tx.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  const field =
    "h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary";

  return (
    <Sheet title="แก้ไขรายการ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภท">
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                setType(t);
                setCategoryId(t === initial.type ? initial.categoryId : "");
              }}
              className={cn(
                "h-11 rounded-2xl border text-sm font-semibold",
                type === t
                  ? t === "expense"
                    ? "border-expense bg-expense/10 text-expense"
                    : "border-income bg-income/10 text-income"
                  : "border-border text-muted",
              )}
            >
              {t === "expense" ? "รายจ่าย" : "รายรับ"}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE}
          aria-label="ชื่อรายการ"
          className={field}
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="จำนวนเงิน"
          className={cn(field, "num")}
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="หมวดหมู่"
          className={field}
        >
          <option value="">{typeChanged ? "เลือกให้อัตโนมัติ" : "ไม่ระบุหมวด"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-label="วันและเวลา"
          className={field}
        />
        {walletItems.length > 1 ? (
          <select
            value={walletValue}
            onChange={(e) => setPickedWallet(e.target.value)}
            aria-label="กระเป๋า"
            className={field}
          >
            {walletItems.map((w) => (
              <option key={w.id} value={w.id}>
                {WALLET_KIND_EMOJI[w.kind]} {w.name}
              </option>
            ))}
          </select>
        ) : null}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE}
          placeholder="โน้ต (ไม่บังคับ)"
          aria-label="โน้ต"
          className={field}
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
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </form>
    </Sheet>
  );
}
