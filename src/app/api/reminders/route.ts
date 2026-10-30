import { z } from "zod";
import { apiError, guard, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/require-user";
import { getPlanInfo } from "@/lib/plan-server";
import { LIMITS, limitOr429 } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { MAX_AHEAD_DAYS, MAX_REMINDER_TEXT, reminderCapacity } from "@/lib/user-reminder";
import { countActiveReminders, createReminder, listReminders } from "@/lib/user-reminder-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reminders — the reminders still waiting, soonest first, and how many the plan allows. */
export async function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const db = getAdminClient();
    const [items, { plan }] = await Promise.all([
      listReminders(db, auth.userId),
      getPlanInfo(db, auth.userId),
    ]);
    const limit = reminderCapacity(plan);
    return json({ items, limit, canAdd: items.length < limit });
  });
}

const createSchema = z.object({
  body: z.string().trim().min(1).max(MAX_REMINDER_TEXT),
  /** ISO moment with an offset (the page sends the Bangkok time the person picked). */
  remindAt: z.string().datetime({ offset: true }),
  repeat: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
});

/** POST /api/reminders { body, remindAt, repeat? } — a new reminder. */
export async function POST(request: Request): Promise<Response> {
  return guard(async () => {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;
    const db = getAdminClient();

    const limited = await limitOr429(db, "write", auth.userId, LIMITS.write);
    if (limited) return limited;

    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError(
        `เขียนเรื่องที่ให้เตือน (ไม่เกิน ${MAX_REMINDER_TEXT} ตัวอักษร) และเลือกวันเวลาให้ถูกต้องนะ`,
        400,
      );
    }
    const remindAt = new Date(parsed.data.remindAt);
    const now = Date.now();
    if (remindAt.getTime() <= now + 30_000)
      return apiError("เวลานั้นผ่านไปแล้ว เลือกเวลาใหม่นะ", 400);
    if (remindAt.getTime() > now + MAX_AHEAD_DAYS * 86_400_000) {
      return apiError("ตั้งเตือนล่วงหน้าได้ไม่เกิน 1 ปีนะ", 400);
    }

    const [{ plan }, count] = await Promise.all([
      getPlanInfo(db, auth.userId),
      countActiveReminders(db, auth.userId),
    ]);
    const limit = reminderCapacity(plan);
    if (count >= limit) {
      return json(
        {
          error: `มีเตือนที่รออยู่ครบ ${limit} รายการแล้ว ลบอันที่ไม่ใช้หรืออัปเกรดแผนเพื่อตั้งเพิ่มนะ`,
          upgrade: plan !== "ultimate",
        },
        409,
      );
    }
    const reminder = await createReminder(db, auth.userId, {
      body: parsed.data.body,
      remindAt,
      repeat: parsed.data.repeat ?? null,
    });
    return json({ reminder }, 201);
  });
}
