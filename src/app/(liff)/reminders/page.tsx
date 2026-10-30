"use client";

import { Repeat as RepeatIcon, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApi, useLiff } from "@/components/liff/liff-provider";
import { cardClass, fieldClass } from "@/components/liff/settings/types";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/liff/states";
import { fromBangkokInputValue, toBangkokInputValue } from "@/lib/thai-date";
import {
  describeReminder,
  MAX_REMINDER_TEXT,
  REPEAT_LABEL,
  type ReminderDto,
  type Repeat,
} from "@/lib/user-reminder";

interface RemindersResponse {
  items: ReminderDto[];
  limit: number;
  canAdd: boolean;
}

const HOUR_MS = 3_600_000;
const defaultWhen = () => toBangkokInputValue(new Date(Date.now() + HOUR_MS));

export default function RemindersPage() {
  const { api } = useLiff();
  const reminders = useApi<RemindersResponse>("/api/reminders");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [repeat, setRepeat] = useState<Repeat | "">("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const data = reminders.data;

  async function add(e: FormEvent) {
    e.preventDefault();
    const at = fromBangkokInputValue(when);
    if (!body.trim() || !at) return;
    setSaving(true);
    setNotice(null);
    try {
      await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify({ body, remindAt: at.toISOString(), repeat: repeat || null }),
      });
      setBody("");
      setWhen(defaultWhen());
      setRepeat("");
      setNotice("ตั้งเตือนแล้ว");
      reminders.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "ตั้งเตือนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: ReminderDto) {
    if (!window.confirm(`ยกเลิกเตือน "${r.body}" ใช่ไหม?`)) return;
    setNotice(null);
    try {
      await api(`/api/reminders/${r.id}`, { method: "DELETE" });
      setNotice("ยกเลิกแล้ว");
      reminders.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "ยกเลิกไม่สำเร็จ");
    }
  }

  return (
    <main>
      <PageHeader title="เตือน" />
      <div className="space-y-4 px-4 pb-4">
        <form onSubmit={add} className={cardClass} aria-label="ตั้งเตือนใหม่">
          <label className="block space-y-1 text-sm font-medium">
            เตือนเรื่อง
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX_REMINDER_TEXT}
              placeholder="เช่น จ่ายค่าไฟ"
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            วันและเวลา
            <input
              type="datetime-local"
              value={when}
              min={toBangkokInputValue(new Date())}
              onChange={(e) => setWhen(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            ความถี่
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as Repeat | "")}
              className={fieldClass}
            >
              <option value="">ครั้งเดียว</option>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => (
                <option key={k} value={k}>
                  {REPEAT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="num text-xs text-muted">
              {data ? `ตั้งไว้ ${data.items.length}/${data.limit} เตือน` : ""}
            </p>
            <button
              type="submit"
              disabled={
                saving ||
                !body.trim() ||
                !fromBangkokInputValue(when) ||
                (data ? !data.canAdd : false)
              }
              className="h-11 rounded-2xl bg-primary px-5 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {saving ? "กำลังตั้ง…" : "ตั้งเตือน"}
            </button>
          </div>
          {data && !data.canAdd ? (
            <p className="text-xs text-warn">
              เตือนเต็มแล้ว ยกเลิกอันที่ไม่ใช้หรืออัปเกรดแผนเพื่อตั้งเพิ่ม
            </p>
          ) : null}
          <p className="text-xs text-muted">
            บอทจะส่งข้อความเตือนในแชท ตรงเวลาโดยประมาณ (อาจช้าไม่เกินราว 10 นาที)
          </p>
        </form>

        {notice ? (
          <p role="status" className="rounded-2xl bg-primary-soft px-4 py-2 text-sm text-primary">
            {notice}
          </p>
        ) : null}

        {reminders.loading && !data ? (
          <LoadingBlock rows={3} />
        ) : reminders.error && !data ? (
          <ErrorState message={reminders.error} onRetry={reminders.reload} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title="ยังไม่มีเตือนที่รออยู่"
            hint='ตั้งที่ฟอร์มด้านบน หรือพิมพ์ในแชท เช่น "เตือน พรุ่งนี้ 9 โมง จ่ายค่าไฟ"'
          />
        ) : data ? (
          <ul className="space-y-3" aria-label="เตือนที่รออยู่">
            {data.items.map((r) => (
              <li key={r.id} className={`${cardClass} flex items-start justify-between gap-3`}>
                <div className="min-w-0">
                  <p className="break-words font-semibold">{r.body}</p>
                  <p className="flex items-center gap-1 text-sm text-primary">
                    {r.repeat ? <RepeatIcon className="h-3.5 w-3.5" aria-hidden /> : null}
                    {describeReminder(new Date(r.remindAt), r.repeat)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(r)}
                  aria-label={`ยกเลิกเตือน ${r.body}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-expense"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </main>
  );
}
