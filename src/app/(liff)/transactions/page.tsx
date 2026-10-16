"use client";

import { Download, Plus, Receipt, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Sheet } from "@/components/liff/sheet";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { TxItem } from "@/components/liff/tx-item";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import type { TxDto } from "@/lib/dto";
import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | "expense" | "income";

interface ListResponse {
  items: TxDto[];
  hasMore: boolean;
}

interface CategoriesResponse {
  items: { id: string; type: "expense" | "income"; name: string }[];
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

export default function TransactionsPage() {
  const { api } = useLiff();
  const [type, setType] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim(), 300);
  const [extra, setExtra] = useState<TxDto[]>([]);
  const [extraMore, setExtraMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [slipFor, setSlipFor] = useState<TxDto | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const path = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (type !== "all") p.set("type", type);
    if (q) p.set("q", q);
    return `/api/transactions?${p.toString()}`;
  }, [type, q]);

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
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              aria-label="ส่งออกไฟล์"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-primary"
            >
              <Download className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="flex h-11 items-center gap-1 rounded-2xl bg-primary px-4 text-sm font-semibold text-surface"
            >
              <Plus className="h-4 w-4" aria-hidden /> เพิ่ม
            </button>
          </div>
        }
      />

      <div className="space-y-3 px-4 pb-4">
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

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อรายการ"
          aria-label="ค้นหาชื่อรายการ"
          className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm outline-none focus:border-primary"
        />

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
                  action={
                    <div className="flex shrink-0">
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

      {slipFor ? <SlipSheet tx={slipFor} onClose={() => setSlipFor(null)} /> : null}

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
  const advanced = me.data?.features.advancedExport === true;

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
          {advanced
            ? "แผน Plus: ไฟล์ Excel มีชีตสรุปตามหมวดและสรุปรายเดือนเพิ่มให้ด้วย"
            : "แผน Plus: ไฟล์ Excel จะมีชีตสรุปตามหมวดและสรุปรายเดือนเพิ่มให้"}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        ) : null}
      </div>
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
