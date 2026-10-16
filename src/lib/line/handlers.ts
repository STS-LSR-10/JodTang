import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetAlertsFor } from "@/lib/budget-alert";
import { calendarMonthRange, cycleRange, dayRange } from "@/lib/budget-cycle";
import { categorizeByRules, type CategoryLite } from "@/lib/categorize/rules";
import { parseCommand, type Command } from "@/lib/commands";
import { formatBaht } from "@/lib/money";
import { CONFIRM_THRESHOLD, parseMessage, type ParsedEntry } from "@/lib/parse/text-parser";
import {
  categoryTotalSatang,
  ensureUser,
  getLatestConfirmed,
  getSettings,
  getTransaction,
  insertTransaction,
  loadCategories,
  loadMemoryFor,
  periodSummary,
  txAmountSatang,
  updateTransaction,
  type SettingsRow,
  type TxRow,
  type UserRow,
} from "@/lib/repo";
import { formatThaiDate } from "@/lib/thai-date";
import type { LineMessage, TxType } from "@/lib/types";
import type { SlipImage, SlipOcrProvider } from "@/lib/ocr/provider";
import { can, effectivePlan } from "@/lib/plan";
import { LIMITS, type LimitRule, type RateLimitResult } from "@/lib/rate-limit";
import {
  applyReferralCode,
  awardActivity,
  currentStreak,
  recentDailyKeys,
  redeemable,
} from "@/lib/points";
import { getSlip, learnMerchant } from "@/lib/slip-repo";
import { handleSlipImage } from "@/lib/slips";
import { buildComposeCard, buildConfirmMessage, buildTypeQuestion } from "./flex";
import { buildCategoryChooser } from "./slip-flex";
import {
  EDIT_HINT_TEXT,
  EDIT_USAGE_TEXT,
  ERROR_TEXT,
  HELP_TEXT,
  MEMORY_PLUS_HINT_TEXT,
  NOT_FOUND_TEXT,
  NOT_UNDERSTOOD_TEXT,
  NOTHING_TO_DELETE_TEXT,
  REFERRAL_BONUS_TEXT,
  REFERRAL_FAIL_TEXT,
  REFERRAL_OK_TEXT,
  referralShareText,
  SLIP_CANCELLED_TEXT,
  SLIP_SOON_TEXT,
  TOO_MANY_MESSAGES_TEXT,
  USE_CODE_USAGE_TEXT,
  WELCOME_TEXT,
  text,
} from "./messages";
import { log } from "@/lib/log";

export interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id?: string; text?: string };
  postback?: { data: string };
}

export interface HandlerDeps {
  db: SupabaseClient;
  reply: (replyToken: string, messages: LineMessage[]) => Promise<void>;
  getProfile: (lineUserId: string) => Promise<{ displayName?: string; pictureUrl?: string } | null>;
  now: () => Date;
  /** Per-user rate limiter (absent in tests -> no limiting). */
  limit?: (bucket: string, subject: string, rule: LimitRule) => Promise<RateLimitResult>;
  /** Slip reading (Phase 4). Absent -> image messages get a "coming soon" reply. */
  slip?: {
    fetchImage: (messageId: string) => Promise<SlipImage>;
    ocr: SlipOcrProvider;
  };
}

const MAX_REPLY_MESSAGES = 5;
const MAX_CARDS_PER_REPLY = 3;

export async function handleEvent(event: LineEvent, deps: HandlerDeps): Promise<void> {
  const lineUserId = event.source?.userId;
  // 1:1 chats only for now.
  if (!lineUserId || event.source?.type !== "user") return;

  // Spam / cost guard, before any database or paid-API work. Over the limit we answer once
  // (on the first excess hit of the window) and then stay quiet instead of flooding the chat.
  if (deps.limit && (event.type === "message" || event.type === "postback")) {
    const isImage = event.message?.type === "image";
    const [bucket, rule] =
      event.type === "postback"
        ? (["postback", LIMITS.postback] as const)
        : isImage
          ? (["chat_image", LIMITS.chatImage] as const)
          : (["chat", LIMITS.chat] as const);
    const result = await deps.limit(bucket, lineUserId, rule);
    if (!result.allowed) {
      if (result.hits === result.limit + 1 && event.replyToken) {
        await deps.reply(event.replyToken, [text(TOO_MANY_MESSAGES_TEXT)]);
      }
      return;
    }
  }

  const user = await ensureUser(deps.db, lineUserId, () => deps.getProfile(lineUserId));
  const reply = async (messages: LineMessage[]) => {
    if (event.replyToken && messages.length > 0) {
      await deps.reply(event.replyToken, messages.slice(0, MAX_REPLY_MESSAGES));
    }
  };

  switch (event.type) {
    case "follow":
      await reply([text(WELCOME_TEXT)]);
      return;
    case "message":
      if (event.message?.type === "text" && event.message.text !== undefined) {
        await reply(await handleText(event.message.text, user, deps));
      } else if (event.message?.type === "image") {
        const { slip } = deps;
        if (slip && event.message.id) {
          await reply(
            await handleSlipImage(
              { db: deps.db, now: deps.now, fetchImage: slip.fetchImage, ocr: slip.ocr },
              user,
              event.message.id,
            ),
          );
        } else {
          await reply([text(SLIP_SOON_TEXT)]);
        }
      }
      return;
    case "postback":
      if (event.postback?.data) await reply(await handlePostback(event.postback.data, user, deps));
      return;
    default:
      return;
  }
}

// ───────────────────────── text ─────────────────────────

async function handleText(input: string, user: UserRow, deps: HandlerDeps): Promise<LineMessage[]> {
  const command = parseCommand(input);
  if (command) return runCommand(command, user, deps);

  const { entries } = parseMessage(input, deps.now());
  if (entries.length === 0) return [text(NOT_UNDERSTOOD_TEXT)];
  return saveEntries(entries, user, deps);
}

async function saveEntries(
  entries: ParsedEntry[],
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[]> {
  const { db } = deps;
  const [settings, categories, memory] = await Promise.all([
    getSettings(db, user.id),
    loadCategories(db, user.id),
    loadMemoryFor(db, user, deps.now()),
  ]);

  const confirmed: { tx: TxRow; entry: ParsedEntry; categoryId: string | null }[] = [];
  const pending: { tx: TxRow; entry: ParsedEntry }[] = [];

  for (const entry of entries) {
    const { categoryId } = categorizeByRules({
      title: entry.title,
      type: entry.type,
      categories,
      memory,
    });
    const needsConfirm = entry.confidence < CONFIRM_THRESHOLD;
    const tx = await insertTransaction(db, {
      userId: user.id,
      type: entry.type,
      title: entry.title,
      amountSatang: entry.amountSatang,
      categoryId,
      occurredAt: entry.occurredAt,
      status: needsConfirm ? "pending_confirm" : "confirmed",
      rawText: entry.raw,
    });
    if (needsConfirm) pending.push({ tx, entry });
    else confirmed.push({ tx, entry, categoryId });
  }

  const messages: LineMessage[] = [];

  if (settings.confirm_style !== "off" && confirmed.length > 0) {
    if (confirmed.length <= MAX_CARDS_PER_REPLY) {
      for (const c of confirmed) {
        messages.push(await confirmCard(c.tx, c.categoryId, categories, settings, user, deps));
      }
    } else {
      const lines = confirmed.map(
        (c) =>
          `• ${c.entry.title} ${c.entry.type === "income" ? "+" : "-"}฿${formatBaht(c.entry.amountSatang)}`,
      );
      messages.push(text([`จดแล้ว ${confirmed.length} รายการ`, ...lines].join("\n")));
    }
  }

  for (const p of pending) {
    messages.push(
      buildTypeQuestion({ txId: p.tx.id, title: p.tx.title, amountSatang: p.entry.amountSatang }),
    );
  }

  // Budget alerts go last so they are the freshest thing in the chat (even with cards turned off).
  const alerts: string[] = [];
  for (const c of confirmed) {
    alerts.push(...(await safeAlerts(deps, user.id, c.tx, c.categoryId)));
  }
  for (const a of alerts) messages.push(text(a));
  if (confirmed.length > 0) messages.push(...(await awardAndNotify(deps, user.id)));
  return messages;
}

/**
 * After an entry is confirmed: the day's point, and the one-time referral bonus on the first
 * activity of a referred user. Silent unless a bonus was just paid. Never throws.
 */
async function awardAndNotify(deps: HandlerDeps, userId: string): Promise<LineMessage[]> {
  const result = await awardActivity(deps.db, userId, deps.now());
  return result.referralBonus ? [text(REFERRAL_BONUS_TEXT)] : [];
}

async function pointsSummaryText(db: SupabaseClient, userId: string, now: Date): Promise<string> {
  const [row, keys] = await Promise.all([
    db.from("users").select("points").eq("id", userId).single(),
    recentDailyKeys(db, userId),
  ]);
  const points = (row.data as { points?: number } | null)?.points ?? 0;
  const streak = currentStreak(keys, now);
  const { days } = redeemable(points);
  return [
    `ตังสะสมของคุณ: ${points} แต้ม`,
    streak > 0 ? `จดต่อเนื่อง ${streak} วันแล้ว` : "วันนี้จดรายการแรกเพื่อเริ่มสะสมนะ",
    days > 0
      ? `แลกเป็นวันใช้ Professional ได้ ${days} วัน (แลกที่หน้าตั้งค่า)`
      : "สะสมครบแล้วแลกเป็นวันใช้ Professional ได้ที่หน้าตั้งค่านะ",
  ].join("\n");
}

/** Budget alerts are best effort: a failure here must never block recording the entry. */
async function safeAlerts(
  deps: HandlerDeps,
  userId: string,
  tx: TxRow,
  categoryId: string | null,
): Promise<string[]> {
  try {
    return await budgetAlertsFor(deps.db, {
      userId,
      type: tx.type,
      categoryId,
      amountSatang: txAmountSatang(tx),
      occurredAt: new Date(tx.occurred_at),
      now: deps.now(),
    });
  } catch (error) {
    log.error("budget_alert_failed", error);
    return [];
  }
}

async function confirmCard(
  tx: TxRow,
  categoryId: string | null,
  categories: CategoryLite[],
  settings: SettingsRow,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage> {
  const style = settings.confirm_style === "short" ? "short" : "full";
  let cycleTotal: number | null = null;
  if (style === "full" && categoryId) {
    const range = cycleRange(deps.now(), settings.budget_cycle, settings.cycle_start_day);
    cycleTotal = await categoryTotalSatang(deps.db, {
      userId: user.id,
      categoryId,
      type: tx.type,
      from: range.from,
      to: range.to,
    });
  }
  return buildConfirmMessage({
    style,
    txId: tx.id,
    type: tx.type,
    title: tx.title,
    categoryName: categories.find((c) => c.id === categoryId)?.name ?? null,
    amountSatang: txAmountSatang(tx),
    occurredAt: new Date(tx.occurred_at),
    cycleTotalSatang: cycleTotal,
  });
}

// ───────────────────────── commands ─────────────────────────

async function runCommand(
  command: Command,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[]> {
  const { db } = deps;
  switch (command.kind) {
    case "help":
      return [text(HELP_TEXT)];

    case "summary": {
      const now = deps.now();
      let label: string;
      let range;
      if (command.scope === "today") {
        range = dayRange(now);
        label = `สรุปวันนี้ (${formatThaiDate(now)})`;
      } else {
        const settings = await getSettings(db, user.id);
        range =
          settings.budget_cycle === "monthly"
            ? cycleRange(now, "monthly", settings.cycle_start_day)
            : calendarMonthRange(now);
        const last = new Date(range.to.getTime() - 1);
        label = `สรุปเดือนนี้ (${formatThaiDate(range.from)} – ${formatThaiDate(last)})`;
      }
      const s = await periodSummary(db, { userId: user.id, from: range.from, to: range.to });
      if (s.count === 0) return [text(`${label}\nยังไม่มีรายการเลย`)];
      return [
        text(
          [
            label,
            `รายรับ ฿${formatBaht(s.incomeSatang)}`,
            `รายจ่าย ฿${formatBaht(s.expenseSatang)}`,
            `คงเหลือ ฿${formatBaht(s.incomeSatang - s.expenseSatang)}`,
            `(${s.count} รายการ)`,
          ].join("\n"),
        ),
      ];
    }

    case "delete-latest": {
      const latest = await getLatestConfirmed(db, user.id);
      if (!latest) return [text(NOTHING_TO_DELETE_TEXT)];
      await updateTransaction(db, user.id, latest.id, { status: "deleted" });
      return [text(`ลบแล้ว: ${latest.title} ฿${formatBaht(txAmountSatang(latest))}`)];
    }

    case "edit-latest": {
      const latest = await getLatestConfirmed(db, user.id);
      if (!latest) return [text(NOTHING_TO_DELETE_TEXT)];
      await updateTransaction(db, user.id, latest.id, { amountSatang: command.amountSatang });
      return [
        text(
          `แก้แล้ว: ${latest.title} ฿${formatBaht(txAmountSatang(latest))} → ฿${formatBaht(command.amountSatang)}`,
        ),
      ];
    }

    case "edit-latest-usage":
      return [text(EDIT_USAGE_TEXT)];

    case "points":
      return [text(await pointsSummaryText(db, user.id, deps.now()))];

    case "my-code": {
      const { data } = await db.from("users").select("referral_code").eq("id", user.id).single();
      const code = (data as { referral_code?: string } | null)?.referral_code;
      return [text(code ? referralShareText(code) : ERROR_TEXT)];
    }

    case "use-code-usage":
      return [text(USE_CODE_USAGE_TEXT)];

    case "use-code": {
      const outcome = await applyReferralCode(db, user.id, command.code);
      return [text(outcome === "ok" ? REFERRAL_OK_TEXT : REFERRAL_FAIL_TEXT[outcome])];
    }
  }
}

// ───────────────────────── postbacks ─────────────────────────

async function handlePostback(
  data: string,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[]> {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  // Rich Menu "จดตังค์": answer with the how-to card; its button opens the keyboard (a=compose-go).
  if (action === "compose") return [buildComposeCard()];

  const id = params.get("id");
  if (!action || !id) return [];

  const { db } = deps;
  const tx = await getTransaction(db, user.id, id);
  if (!tx || tx.status === "deleted") return [text(NOT_FOUND_TEXT)];

  if (action === "del") {
    await updateTransaction(db, user.id, id, { status: "deleted" });
    return [text(`ลบแล้ว: ${tx.title} ฿${formatBaht(txAmountSatang(tx))}`)];
  }

  if (action === "edit") return [text(EDIT_HINT_TEXT)];

  if (action === "pt") {
    if (tx.status !== "pending_confirm") return [text(NOT_FOUND_TEXT)];
    const choice = params.get("t");
    if (choice === "cancel") {
      await updateTransaction(db, user.id, id, { status: "deleted" });
      return [text("ยกเลิกแล้ว ไม่ได้จดรายการนี้")];
    }
    if (choice !== "income" && choice !== "expense") return [];

    const type: TxType = choice;
    const [settings, categories, memory] = await Promise.all([
      getSettings(db, user.id),
      loadCategories(db, user.id),
      loadMemoryFor(db, user, deps.now()),
    ]);
    const { categoryId } = categorizeByRules({ title: tx.title, type, categories, memory });
    const updated = await updateTransaction(db, user.id, id, {
      type,
      categoryId,
      status: "confirmed",
    });
    if (!updated) return [text(NOT_FOUND_TEXT)];
    const alerts = (await safeAlerts(deps, user.id, updated, categoryId)).map((a) => text(a));
    const bonus = await awardAndNotify(deps, user.id);
    if (settings.confirm_style === "off") return [text("จดแล้ว"), ...alerts, ...bonus];
    return [
      await confirmCard(updated, categoryId, categories, settings, user, deps),
      ...alerts,
      ...bonus,
    ];
  }

  // ── slip review: confirm / pick category / cancel ──
  if (action === "sc" || action === "se" || action === "sk" || action === "sx") {
    if (tx.status !== "pending_confirm") return [text(NOT_FOUND_TEXT)];

    if (action === "sx") {
      await updateTransaction(db, user.id, id, { status: "deleted" });
      return [text(SLIP_CANCELLED_TEXT)];
    }

    const [settings, categories, memory] = await Promise.all([
      getSettings(db, user.id),
      loadCategories(db, user.id),
      loadMemoryFor(db, user, deps.now()),
    ]);

    if (action === "se") {
      const choices = categories
        .filter((c) => c.type === tx.type && !c.is_hidden)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ id: c.id, name: c.name }));
      return [buildCategoryChooser(id, choices)];
    }

    let categoryId = tx.category_id;
    let learned: string | null = null;
    if (action === "sk") {
      const picked = categories.find((c) => c.id === params.get("c") && c.type === tx.type);
      if (!picked) return [text(NOT_FOUND_TEXT)];
      categoryId = picked.id;
      const slip = tx.slip_id ? await getSlip(db, user.id, tx.slip_id) : null;
      if (slip?.payee) {
        const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());
        if (can(plan, "merchantMemory")) {
          await learnMerchant(db, { userId: user.id, payee: slip.payee, categoryId: picked.id });
          learned = `จำไว้แล้ว: ${slip.payee} → ${picked.name}`;
        } else {
          learned = MEMORY_PLUS_HINT_TEXT;
        }
      }
    } else if (categoryId === null) {
      // the guess found nothing: fall back to the rules once more
      categoryId = categorizeByRules({
        title: tx.title,
        type: tx.type,
        categories,
        memory,
      }).categoryId;
    }

    const updated = await updateTransaction(db, user.id, id, { categoryId, status: "confirmed" });
    if (!updated) return [text(NOT_FOUND_TEXT)];

    const out: LineMessage[] = [];
    if (settings.confirm_style === "off") out.push(text("จดแล้ว"));
    else out.push(await confirmCard(updated, categoryId, categories, settings, user, deps));
    if (learned) out.push(text(learned));
    for (const a of await safeAlerts(deps, user.id, updated, categoryId)) out.push(text(a));
    out.push(...(await awardAndNotify(deps, user.id)));
    return out;
  }

  return [];
}
