"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ProgressBar } from "@/components/liff/progress-bar";
import { Sheet } from "@/components/liff/sheet";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { EMOJI_CHOICES, isSingleEmoji } from "@/lib/category-emoji";
import { normalizeThaiDigits } from "@/lib/parse/thai-number";
import { formatBaht } from "@/lib/money";
import { cn } from "@/lib/utils";

type Kind = "expense" | "income";

interface CategoryItem {
  id: string;
  type: Kind;
  name: string;
  own: boolean;
  keywords: string[];
  color: string | null;
  /** One emoji shown in front of the name (custom categories only). */
  emoji: string | null;
  isHidden: boolean;
  sortOrder: number;
  isFallback: boolean;
}

interface BudgetsResponse {
  mode: "overall" | "category";
  cycle: "monthly" | "weekly";
  overall: { amountSatang: number | null; spentSatang: number };
  categories: {
    categoryId: string;
    name: string;
    color: string | null;
    amountSatang: number | null;
    spentSatang: number;
  }[];
}

const SWATCHES = [
  "#0F766E",
  "#0369A1",
  "#7C3AED",
  "#DB2777",
  "#E11D48",
  "#D97706",
  "#CA8A04",
  "#059669",
  "#475569",
];
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

function parseAmount(input: string): { ok: true; value: string | null } | { ok: false } {
  const text = normalizeThaiDigits(input).replace(/,/g, "").trim();
  if (text === "") return { ok: true, value: null };
  if (!AMOUNT_PATTERN.test(text)) return { ok: false };
  return { ok: true, value: text };
}

function keywordsFromText(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[,\n]/)
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  );
}

export default function BudgetsPage() {
  const { api } = useLiff();
  const [kind, setKind] = useState<Kind>("expense");
  const cats = useApi<{ items: CategoryItem[] }>("/api/categories?all=1");
  const budgets = useApi<BudgetsResponse>("/api/budgets");
  const me = useApi<{ features: Record<string, boolean> }>("/api/me");
  // Professional and above create and edit their own categories; the server checks it too.
  const locked = !me.loading && me.data !== null && me.data?.features.customCategory !== true;
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [adding, setAdding] = useState(false);

  const list = useMemo(
    () =>
      (cats.data?.items ?? [])
        .filter((c) => c.type === kind)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [cats.data, kind],
  );

  function refresh() {
    cats.reload();
    budgets.reload();
  }

  async function run(action: () => Promise<unknown>, done?: string) {
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    }
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(target, 0, moved);
    void run(() =>
      api("/api/categories/reorder", { method: "POST", body: JSON.stringify({ ids }) }),
    );
  };

  const toggleHidden = (c: CategoryItem) =>
    run(() =>
      api(`/api/categories/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isHidden: !c.isHidden }),
      }),
    );

  const budgetOf = (categoryId: string) =>
    budgets.data?.categories.find((b) => b.categoryId === categoryId);

  const loading = cats.loading || (kind === "expense" && budgets.loading && !budgets.data);
  const error = cats.error ?? (kind === "expense" ? budgets.error : null);

  return (
    <main>
      <PageHeader
        title="หมวด/งบ"
        right={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-11 items-center gap-1 rounded-2xl bg-primary px-4 text-sm font-semibold text-surface"
          >
            {locked ? (
              <Lock className="h-4 w-4" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}{" "}
            เพิ่มหมวด
          </button>
        }
      />

      <div className="space-y-4 px-4 pb-4">
        <div role="tablist" aria-label="ประเภทหมวด" className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-11 rounded-2xl border text-sm font-semibold",
                kind === k
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-surface text-muted",
              )}
            >
              {k === "expense" ? "รายจ่าย" : "รายรับ"}
            </button>
          ))}
        </div>

        {notice ? (
          <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
            {notice}
          </p>
        ) : null}

        {loading ? (
          <LoadingBlock rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <>
            {kind === "expense" && budgets.data ? (
              <BudgetCard
                data={budgets.data}
                onChange={(body, done) =>
                  run(
                    () => api("/api/budgets", { method: "PUT", body: JSON.stringify(body) }),
                    done,
                  )
                }
              />
            ) : null}

            {list.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface shadow-card">
                <EmptyState title="ยังไม่มีหมวด" hint="กด “เพิ่มหมวด” เพื่อสร้างหมวดของคุณเอง" />
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
                {list.map((c, i) => {
                  const b = budgetOf(c.id);
                  const showBudget =
                    kind === "expense" && budgets.data?.mode === "category" && !c.isHidden;
                  return (
                    <li
                      key={c.id}
                      className={cn("space-y-2 px-4 py-3", c.isHidden && "opacity-60")}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-8 w-1.5 shrink-0 rounded-full"
                          style={{ background: c.color ?? "#64748B" }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {c.emoji ? (
                              <span aria-hidden className="mr-1">
                                {c.emoji}
                              </span>
                            ) : null}
                            {c.name}
                            {c.own ? (
                              <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                                ของฉัน
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {c.isHidden
                              ? "ซ่อนอยู่"
                              : c.keywords.length
                                ? c.keywords.join(", ")
                                : "ยังไม่มีคำค้น"}
                          </p>
                        </div>
                        <IconButton
                          label={`เลื่อน ${c.name} ขึ้น`}
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden />
                        </IconButton>
                        <IconButton
                          label={`เลื่อน ${c.name} ลง`}
                          onClick={() => move(i, 1)}
                          disabled={i === list.length - 1}
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden />
                        </IconButton>
                        {!c.isFallback ? (
                          <IconButton
                            label={c.isHidden ? `แสดง ${c.name}` : `ซ่อน ${c.name}`}
                            onClick={() => toggleHidden(c)}
                          >
                            {c.isHidden ? (
                              <EyeOff className="h-4 w-4" aria-hidden />
                            ) : (
                              <Eye className="h-4 w-4" aria-hidden />
                            )}
                          </IconButton>
                        ) : null}
                        <IconButton label={`แก้ไข ${c.name}`} onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </IconButton>
                      </div>

                      {showBudget ? (
                        <CategoryBudget
                          name={c.name}
                          amountSatang={b?.amountSatang ?? null}
                          spentSatang={b?.spentSatang ?? 0}
                          onSave={(value) =>
                            run(() =>
                              api("/api/budgets", {
                                method: "PUT",
                                body: JSON.stringify({
                                  categories: [{ categoryId: c.id, amount: value }],
                                }),
                              }),
                            )
                          }
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {editing ? (
        <EditSheet
          category={editing}
          locked={locked}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            setNotice(msg);
            refresh();
          }}
        />
      ) : null}
      {adding && locked ? <CustomCategoryLockedSheet onClose={() => setAdding(false)} /> : null}
      {adding && !locked ? (
        <AddSheet
          kind={kind}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setNotice("เพิ่มหมวดแล้ว");
            refresh();
          }}
        />
      ) : null}
    </main>
  );
}

/** What Free sees instead of the add form: the feature is Professional and above. */
function CustomCategoryLockedSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="หมวดของตัวเอง" onClose={onClose}>
      <div className="space-y-3 text-center">
        <p className="text-base font-semibold">สร้างหมวดของตัวเองสำหรับแผน Professional</p>
        <p className="text-sm text-muted">
          เพิ่มหมวดเฉพาะตัว เช่น “ค่าอาหารแมว” พร้อมเลือกอีโมจิ ลองใช้ฟรี 7 วันได้ที่หน้าอัปเกรด
          ตอนนี้ใช้หมวดมาตรฐานและปรับคำค้นได้ตามเดิม
        </p>
        <Link
          href="/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-surface"
        >
          ดูแผน Professional
        </Link>
      </div>
    </Sheet>
  );
}

/** Pick one emoji from the grid, or type your own; empty means none. */
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const valid = value === "" || isSingleEmoji(value);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">อีโมจิ (ไม่บังคับ)</p>
      <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="เลือกอีโมจิ">
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={value === e}
            aria-label={`อีโมจิ ${e}`}
            onClick={() => onChange(value === e ? "" : e)}
            className={cn(
              "flex h-10 items-center justify-center rounded-xl border text-xl",
              value === e ? "border-primary bg-primary-soft" : "border-transparent",
            )}
          >
            <span aria-hidden>{e}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={16}
          placeholder="หรือพิมพ์อีโมจิเอง"
          aria-label="อีโมจิ (พิมพ์เอง)"
          aria-invalid={!valid}
          className="h-11 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="h-11 shrink-0 rounded-2xl border border-border px-3 text-sm text-muted"
          >
            ล้าง
          </button>
        ) : null}
      </div>
      {!valid ? <p className="text-xs text-expense">ใส่ได้เป็นอีโมจิตัวเดียวเท่านั้นนะ</p> : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-muted disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function BudgetCard({
  data,
  onChange,
}: {
  data: BudgetsResponse;
  onChange: (
    body: { mode?: "overall" | "category"; overall?: string | null },
    done?: string,
  ) => void;
}) {
  const [text, setText] = useState(
    data.overall.amountSatang ? formatBaht(data.overall.amountSatang).replace(/,/g, "") : "",
  );
  const [error, setError] = useState<string | null>(null);

  function saveOverall() {
    const parsed = parseAmount(text);
    if (!parsed.ok) return setError("จำนวนเงินไม่ถูกต้อง (เช่น 5000 หรือ 5000.50)");
    setError(null);
    onChange({ overall: parsed.value }, parsed.value ? "ตั้งงบแล้ว" : "ล้างงบแล้ว");
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">งบประมาณ</h2>
        <span className="text-xs text-muted">
          {data.cycle === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="รูปแบบงบ">
        {(
          [
            ["overall", "งบรวม"],
            ["category", "แยกหมวด"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={data.mode === value}
            onClick={() => data.mode !== value && onChange({ mode: value })}
            className={cn(
              "h-11 rounded-2xl border text-sm font-semibold",
              data.mode === value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {data.mode === "overall" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode="decimal"
              placeholder="งบรวมต่อรอบ (บาท)"
              aria-label="งบรวมต่อรอบ"
              className="num h-11 min-w-0 flex-1 rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={saveOverall}
              className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-surface"
            >
              บันทึก
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          ) : null}
          {data.overall.amountSatang ? (
            <ProgressBar
              spentSatang={data.overall.spentSatang}
              limitSatang={data.overall.amountSatang}
            />
          ) : (
            <p className="text-xs text-muted">
              ยังไม่ได้ตั้งงบ ใช้ไปแล้ว ฿{formatBaht(data.overall.spentSatang)} ในรอบนี้
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          ตั้งงบของแต่ละหมวดได้ที่รายการด้านล่าง เว้นว่างไว้ถ้าไม่ต้องการจำกัด
        </p>
      )}
      <p className="text-xs text-muted">จะแจ้งเตือนในแชทเมื่อใช้ถึง 80% และเมื่อเกินงบ</p>
    </section>
  );
}

function CategoryBudget({
  name,
  amountSatang,
  spentSatang,
  onSave,
}: {
  name: string;
  amountSatang: number | null;
  spentSatang: number;
  onSave: (value: string | null) => void;
}) {
  const initial = amountSatang ? formatBaht(amountSatang).replace(/,/g, "") : "";
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (text === initial) return;
    const parsed = parseAmount(text);
    if (!parsed.ok) return setError("จำนวนเงินไม่ถูกต้อง");
    setError(null);
    onSave(parsed.value);
  }

  return (
    <div className="space-y-2 pl-3.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        inputMode="decimal"
        placeholder="งบของหมวดนี้ (บาท)"
        aria-label={`งบหมวด ${name}`}
        className="num h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:border-primary"
      />
      {error ? (
        <p role="alert" className="text-xs text-expense">
          {error}
        </p>
      ) : null}
      {amountSatang ? <ProgressBar spentSatang={spentSatang} limitSatang={amountSatang} /> : null}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="สี">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            "h-9 w-9 rounded-full border-2",
            value === c ? "border-foreground" : "border-transparent",
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

const fieldClass =
  "h-12 w-full rounded-2xl border border-border bg-background px-4 outline-none focus:border-primary";

function AddSheet({
  kind,
  onClose,
  onSaved,
}: {
  kind: Kind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api } = useLiff();
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [color, setColor] = useState(SWATCHES[0] ?? "#0F766E");
  const [emoji, setEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("ใส่ชื่อหมวดด้วยนะ");
    if (emoji !== "" && !isSingleEmoji(emoji))
      return setError("ใส่ได้เป็นอีโมจิตัวเดียวเท่านั้นนะ");
    setSaving(true);
    setError(null);
    try {
      await api("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          type: kind,
          name: name.trim(),
          keywords: keywordsFromText(keywords),
          color,
          emoji: emoji || null,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  }

  return (
    <Sheet title={`เพิ่มหมวด${kind === "expense" ? "รายจ่าย" : "รายรับ"}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="ชื่อหมวด เช่น สัตว์เลี้ยง"
          aria-label="ชื่อหมวด"
          className={fieldClass}
        />
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="คำค้นสำหรับจัดหมวดอัตโนมัติ คั่นด้วยคอมมา เช่น อาหารแมว, ทราย"
          aria-label="คำค้น"
          rows={3}
          className="w-full rounded-2xl border border-border bg-background p-4 outline-none focus:border-primary"
        />
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <ColorPicker value={color} onChange={setColor} />
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
          {saving ? "กำลังบันทึก..." : "เพิ่มหมวด"}
        </button>
      </form>
    </Sheet>
  );
}

function EditSheet({
  category,
  locked,
  onClose,
  onSaved,
}: {
  category: CategoryItem;
  /** Free cannot change what an own category is; it can still be deleted. */
  locked: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useLiff();
  const [name, setName] = useState(category.name);
  const [keywords, setKeywords] = useState(category.keywords.join(", "));
  const [color, setColor] = useState(category.color ?? SWATCHES[0] ?? "#0F766E");
  const [emoji, setEmoji] = useState(category.emoji ?? "");
  const [busy, setBusy] = useState(false);
  const frozen = category.own && locked;
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (category.own && !name.trim()) return setError("ใส่ชื่อหมวดด้วยนะ");
    if (category.own && emoji !== "" && !isSingleEmoji(emoji)) {
      return setError("ใส่ได้เป็นอีโมจิตัวเดียวเท่านั้นนะ");
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { keywords: keywordsFromText(keywords) };
      if (category.own) {
        body.name = name.trim();
        body.color = color;
        if (emoji !== (category.emoji ?? "")) body.emoji = emoji;
      }
      await api(`/api/categories/${category.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved("บันทึกแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`ลบหมวด "${category.name}" ใช่ไหม? รายการในหมวดนี้จะย้ายไปหมวด "อื่นๆ"`)) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/categories/${category.id}`, { method: "DELETE" });
      onSaved("ลบหมวดแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <Sheet title="แก้ไขหมวด" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!category.own || frozen}
          maxLength={30}
          aria-label="ชื่อหมวด"
          className={cn(fieldClass, (!category.own || frozen) && "opacity-60")}
        />
        {frozen ? (
          <p className="text-xs text-muted">
            แก้หมวดของตัวเองได้ในแผน Professional ขึ้นไป{" "}
            <Link href="/upgrade" className="font-semibold text-primary underline">
              ดูแผน
            </Link>{" "}
            (ลบหมวดนี้ได้ตามปกติ)
          </p>
        ) : null}
        {!category.own ? (
          <p className="text-xs text-muted">หมวดมาตรฐานแก้ชื่อไม่ได้ แต่ปรับคำค้นได้นะ</p>
        ) : null}
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="คำค้น คั่นด้วยคอมมา"
          aria-label="คำค้น"
          rows={3}
          disabled={frozen}
          className="w-full rounded-2xl border border-border bg-background p-4 outline-none focus:border-primary disabled:opacity-60"
        />
        {category.own && !frozen ? <EmojiPicker value={emoji} onChange={setEmoji} /> : null}
        {category.own && !frozen ? <ColorPicker value={color} onChange={setColor} /> : null}
        {error ? (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        ) : null}
        {frozen ? null : (
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-2xl bg-primary text-base font-semibold text-surface disabled:opacity-60"
          >
            บันทึก
          </button>
        )}
        {category.own ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="h-12 w-full rounded-2xl border border-expense text-base font-semibold text-expense disabled:opacity-60"
          >
            ลบหมวดนี้
          </button>
        ) : null}
      </form>
    </Sheet>
  );
}
