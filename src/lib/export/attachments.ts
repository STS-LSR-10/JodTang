import type { SupabaseClient } from "@supabase/supabase-js";
import { zipSync, type Zippable } from "fflate";
import { SLIP_BUCKET } from "@/lib/slip-repo";
import { log } from "@/lib/log";
import { exportDate, exportTime } from "./rows";

/** How many pictures one export may carry, and how many bytes in all (a cost and memory guard). */
export const MAX_ATTACHMENTS = 150;
export const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;
const CONCURRENCY = 5;

/** The files of one entry the export can pick up: its slip picture and the photo attached to it. */
export interface AttachmentSource {
  date: Date;
  title: string;
  slipId: string | null;
  photoPath: string | null;
}

export interface Attachment {
  name: string;
  data: Uint8Array;
}

/** A file name the zip tools on every system accept; Thai letters stay. */
export function safeName(text: string, max = 40): string {
  const cleaned = text
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(cleaned).slice(0, max).join("") || "รายการ";
}

const extOf = (path: string) => /\.(jpe?g|png|webp)$/i.exec(path)?.[1]?.toLowerCase() ?? "jpg";

/**
 * Download the slip pictures and photos of these entries from storage. Only the signed-in user's
 * own entries get here (the caller's query is scoped to them). Stops at the limits and says how many
 * pictures were left out.
 */
export async function collectAttachments(
  db: SupabaseClient,
  userId: string,
  sources: AttachmentSource[],
  limits: { maxFiles: number; maxBytes: number } = {
    maxFiles: MAX_ATTACHMENTS,
    maxBytes: MAX_ATTACHMENT_BYTES,
  },
): Promise<{ files: Attachment[]; skipped: number }> {
  const slipIds = [...new Set(sources.map((s) => s.slipId).filter((id): id is string => !!id))];
  const slipPath = new Map<string, string>();
  for (let i = 0; i < slipIds.length; i += 200) {
    const { data, error } = await db
      .from("slips")
      .select("id,storage_path")
      .eq("user_id", userId)
      .in("id", slipIds.slice(i, i + 200));
    if (error) throw new Error(`export slips: ${error.message}`);
    for (const r of (data ?? []) as { id: string; storage_path: string }[]) {
      slipPath.set(r.id, r.storage_path);
    }
  }

  const wanted: { name: string; path: string }[] = [];
  for (const s of sources) {
    const base = `${exportDate(s.date)} ${exportTime(s.date).replace(":", "")} ${safeName(s.title)}`;
    const slip = s.slipId ? slipPath.get(s.slipId) : undefined;
    if (slip) wanted.push({ name: `${base} (สลิป).${extOf(slip)}`, path: slip });
    if (s.photoPath)
      wanted.push({ name: `${base} (รูปแนบ).${extOf(s.photoPath)}`, path: s.photoPath });
  }

  const slice = wanted.slice(0, limits.maxFiles);
  let skipped = wanted.length - slice.length;
  const files: Attachment[] = [];
  let bytes = 0;
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      const item = slice[i];
      if (!item) return;
      if (bytes >= limits.maxBytes) {
        skipped++;
        continue;
      }
      try {
        const res = await db.storage.from(SLIP_BUCKET).download(item.path);
        if (res.error || !res.data) throw new Error(res.error?.message ?? "empty");
        const data = new Uint8Array(await res.data.arrayBuffer());
        if (bytes + data.byteLength > limits.maxBytes) {
          skipped++;
          continue;
        }
        bytes += data.byteLength;
        files.push({ name: item.name, data });
      } catch (error) {
        log.warn("export_attachment_failed", { reason: String(error) });
        skipped++;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, skipped };
}

/**
 * One zip: the data file at the top and the pictures in a folder. Names are numbered so two
 * entries with the same title and time never overwrite each other.
 */
export function buildZip(
  main: { name: string; data: Uint8Array },
  attachments: Attachment[],
  skipped: number,
): Uint8Array {
  const entries: Zippable = { [main.name]: [main.data, { level: 6 }] };
  attachments.forEach((a, i) => {
    entries[`รูปสลิปและใบเสร็จ/${String(i + 1).padStart(3, "0")} ${a.name}`] = [
      a.data,
      { level: 0 },
    ];
  });
  if (skipped > 0) {
    const note = `แนบรูปไม่ครบ ${skipped} ไฟล์ (เกินจำนวนหรือขนาดที่แนบได้ในครั้งเดียว หรือโหลดไม่สำเร็จ) ลองเลือกช่วงเวลาที่สั้นลงแล้วส่งออกอีกครั้ง\n`;
    entries["อ่านก่อน.txt"] = [new TextEncoder().encode(note), { level: 6 }];
  }
  return zipSync(entries);
}
