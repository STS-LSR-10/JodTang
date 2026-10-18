import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetAlertsFor } from "@/lib/budget-alert";
import { calendarMonthRange, cycleRange, dayRange } from "@/lib/budget-cycle";
import { categorizeByRules, matchLeadingCategory, type CategoryLite } from "@/lib/categorize/rules";
import { parseCommand, type Command } from "@/lib/commands";
import { formatBaht } from "@/lib/money";
import {
  CONFIRM_THRESHOLD,
  LARGE_AMOUNT_SATANG,
  parseMessage,
  type ParsedEntry,
} from "@/lib/parse/text-parser";
import {
  categoryTotalSatang,
  ensureUser,
  getLatestConfirmed,
  getSettings,
  getTransaction,
  claimPendingTransaction,
  insertTransaction,
  loadCategories,
  loadMemoryFor,
  releasePendingTransaction,
  txAmountSatang,
  updateTransaction,
  type SettingsRow,
  type TxRow,
  type UserRow,
} from "@/lib/repo";
import { bangkokParts, formatThaiDate, fromBangkok, isValidYmd } from "@/lib/thai-date";
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
import { getSlip, getSlipItems, learnMerchant } from "@/lib/slip-repo";
import { planReceiptSplit } from "@/lib/receipt-split";
import { loadSummaryData, loadSummaryTransactions } from "@/lib/summary-load";
import { daySpecFromIso, resolveRange, type DaySpec } from "@/lib/summary-range";
import { buildSummaryCard, previousRange, summarize } from "@/lib/summary-report";
import { handleSlipImage } from "@/lib/slips";
import { handlePhotoImage, photoBlockedReply } from "@/lib/photos";
import { needsSmartParse, runSmartParse } from "@/lib/ai/smart-parse";
import type { TextStructurer } from "@/lib/ai/text-structurer";
import { recordSmartEntries } from "./smart-entries";
import { getLivePhotoWait, getPhotoTx, startPhotoWait } from "@/lib/photo-repo";
import {
  BACKDATE_MAX_DAYS,
  buildBackdatePrompt,
  buildCategoryKeyboardList,
  buildComposeCard,
  buildConfirmMessage,
  buildDatePicker,
  buildPhotoAsk,
  buildRangeEndPicker,
  buildRangeStartPicker,
  withRangeButton,
  buildTypeQuestion,
} from "./flex";
import { buildCategoryChooser } from "./slip-flex";
import {
  EDIT_HINT_TEXT,
  EDIT_USAGE_TEXT,
  BACKDATE_BAD_DATE_TEXT,
  BACKDATE_LOCKED_TEXT,
  BACKDATE_PICKER_LOCKED_TEXT,
  MULTI_ENTRY_LOCKED_TEXT,
  TAGS_LOCKED_TEXT,
  ERROR_TEXT,
  HELP_TEXT,
  MEMORY_PLUS_HINT_TEXT,
  NOT_FOUND_TEXT,
  NOT_UNDERSTOOD_TEXT,
  PHOTO_ASK_REPLACE_TEXT,
  PHOTO_ASK_TEXT,
  SMART_CANCELLED_TEXT,
  SMART_PREFACE_TEXT,
  SPLIT_LOCKED_TEXT,
  SUMMARY_RANGE_BAD_DATE_TEXT,
  SUMMARY_RANGE_LOCKED_TEXT,
  SUMMARY_RANGE_ORDER_TEXT,
  SUMMARY_RANGE_TOO_LONG_TEXT,
  SUMMARY_RANGE_USAGE_TEXT,
  SPLIT_UNAVAILABLE_TEXT,
  splitDoneText,
  NOTHING_TO_DELETE_TEXT,
  REFERRAL_BONUS_TEXT,
  REFERRAL_FAIL_TEXT,
  REFERRAL_OK_TEXT,
  referralShareText,
  SLIP_CANCELLED_TEXT,
  SLIP_SOON_TEXT,
  TOO_MANY_MESSAGES_TEXT,
  USE_CODE_USAGE_TEXT,
  VOICE_CANCELLED_TEXT,
  VOICE_UNAVAILABLE_TEXT,
  WELCOME_TEXT,
  text,
} from "./messages";
import { log } from "@/lib/log";
import type { Transcriber } from "@/lib/voice/transcribe";
import { handleVoiceMessage, type VoiceDeps } from "./voice";

export interface LineEvent {
  type: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id?: string; text?: string; duration?: number };
  postback?: {
    data: string;
    /** Filled by the LINE date picker: { date: "2026-10-12" }. */
    params?: { date?: string; time?: string; datetime?: string };
  };
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
  /** AI that reads long sentences (Ultimate). Absent -> the ordinary rules handle everything. */
  structurer?: TextStructurer;
  /** Voice messages. Absent (no AI key that hears audio) -> a polite "not available" reply. */
  voice?: {
    fetchAudio: VoiceDeps["fetchAudio"];
    transcriber: Transcriber;
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
    const isAudio = event.message?.type === "audio";
    const [bucket, rule] =
      event.type === "postback"
        ? (["postback", LIMITS.postback] as const)
        : isImage
          ? (["chat_image", LIMITS.chatImage] as const)
          : isAudio
            ? (["chat_voice", LIMITS.chatVoice] as const)
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
          // an image right after "แนบรูป" belongs to that entry, everything else is a slip
          const wait = await getLivePhotoWait(deps.db, user.id, deps.now());
          if (wait) {
            await reply(
              await handlePhotoImage(
                { db: deps.db, now: deps.now, fetchImage: slip.fetchImage },
                user,
                event.message.id,
                wait,
              ),
            );
          } else {
            await reply(
              await handleSlipImage(
                { db: deps.db, now: deps.now, fetchImage: slip.fetchImage, ocr: slip.ocr },
                user,
                event.message.id,
              ),
            );
          }
        } else {
          await reply([text(SLIP_SOON_TEXT)]);
        }
      } else if (event.message?.type === "audio" && event.message.id) {
        const { voice } = deps;
        if (!voice) {
          await reply([text(VOICE_UNAVAILABLE_TEXT)]);
        } else {
          await reply(
            await handleVoiceMessage(
              {
                db: deps.db,
                now: deps.now,
                fetchAudio: voice.fetchAudio,
                transcriber: voice.transcriber,
                structurer: deps.structurer,
                limit: deps.limit,
              },
              user,
              { id: event.message.id, duration: event.message.duration },
              lineUserId,
            ),
          );
        }
      }
      return;
    case "postback":
      if (event.postback?.data)
        await reply(await handlePostback(event.postback.data, user, deps, event.postback.params));
      return;
    default:
      return;
  }
}

// ───────────────────────── text ─────────────────────────

async function handleText(input: string, user: UserRow, deps: HandlerDeps): Promise<LineMessage[]> {
  const command = parseCommand(input);
  if (command) return runCommand(command, user, deps);

  const parsed = parseMessage(input, deps.now());
  const { entries } = parsed;
  const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());

  // Long or unclear sentences (Ultimate): let the AI read them, then ask before saving anything.
  if (deps.structurer && can(plan, "smartParse") && needsSmartParse(input, parsed)) {
    const smart = await readWithAi(input, user, deps);
    if (smart) return smart;
  }

  if (entries.length === 0) return [text(NOT_UNDERSTOOD_TEXT)];
  if (entries.some((e) => e.backdated) && !can(plan, "backdate")) {
    return [text(BACKDATE_LOCKED_TEXT)];
  }
  if (entries.length > 1 && !can(plan, "multiEntry")) return [text(MULTI_ENTRY_LOCKED_TEXT)];
  if (entries.some((e) => e.tags.length > 0) && !can(plan, "tags")) {
    return [text(TAGS_LOCKED_TEXT)];
  }
  return saveEntries(entries, user, deps);
}

/** The card for a custom range (typed or picked), or the text that says what is wrong with it. */
async function summaryForRange(
  user: UserRow,
  deps: HandlerDeps,
  start: DaySpec,
  end: DaySpec | null,
): Promise<LineMessage[]> {
  const result = resolveRange(start, end, deps.now());
  if (!result.ok) {
    return [
      text(
        result.reason === "order"
          ? SUMMARY_RANGE_ORDER_TEXT
          : result.reason === "too_long"
            ? SUMMARY_RANGE_TOO_LONG_TEXT
            : SUMMARY_RANGE_BAD_DATE_TEXT,
      ),
    ];
  }
  const subtitle = `${formatThaiDate(result.range.from)} – ${formatThaiDate(result.lastDay)} (${result.days} วัน)`;
  const data = await loadSummaryData(deps.db, user.id, result.range, result.previous);
  if (data.current.count === 0) return [text(`สรุปช่วงที่เลือก\n${subtitle}\nยังไม่มีรายการเลย`)];
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return [
    buildSummaryCard({
      title: "สรุปช่วงที่เลือก",
      range: result.range,
      data,
      against: "ช่วงก่อนหน้า",
      subtitle,
      liffUrl: base ? `${base}/summary` : undefined,
    }),
  ];
}

/** A day from the LINE date picker ("2026-10-12"): real, not in the future, within a year. */
export function backdateFromPicker(
  value: string | undefined,
  now: Date,
): { iso: string; thai: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  if (!isValidYmd(year, month, day)) return null;
  const at = fromBangkok(year, month, day);
  const today = bangkokParts(now);
  if (at.getTime() > fromBangkok(today.year, today.month, today.day, 23, 59).getTime()) return null;
  if (now.getTime() - at.getTime() > (BACKDATE_MAX_DAYS + 1) * 86_400_000) return null;
  return { iso: `${m[1]}-${m[2]}-${m[3]}`, thai: formatThaiDate(at) };
}

/** AI reading of a message: pending entries + check cards, or null to fall back to the rules. */
async function readWithAi(
  input: string,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[] | null> {
  const { db } = deps;
  const [categories, memory] = await Promise.all([
    loadCategories(db, user.id),
    loadMemoryFor(db, user, deps.now()),
  ]);
  const entries = await runSmartParse(
    { structurer: deps.structurer, limit: deps.limit, now: deps.now },
    {
      text: input,
      subject: user.line_user_id,
      categories: categories
        .filter((c) => !c.is_hidden)
        .map((c) => ({ name: c.name, type: c.type })),
    },
  );
  if (!entries) return null;
  const cards = await recordSmartEntries({
    db,
    user,
    entries,
    categories,
    memory,
    rawText: input,
    source: "text",
  });
  return [text(SMART_PREFACE_TEXT), ...cards];
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

  for (const parsed of entries) {
    // A title that starts with a category name ("อาหาร 50", picked from the quick-reply list)
    // settles both the category and whether it is income or expense.
    const chosen = matchLeadingCategory(parsed.title, parsed.type, categories);
    const entry: ParsedEntry = chosen
      ? {
          ...parsed,
          type: chosen.type,
          confidence:
            parsed.amountSatang >= LARGE_AMOUNT_SATANG
              ? parsed.confidence
              : Math.max(parsed.confidence, CONFIRM_THRESHOLD),
        }
      : parsed;
    const categoryId = chosen
      ? chosen.id
      : categorizeByRules({ title: entry.title, type: entry.type, categories, memory }).categoryId;
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
      tags: entry.tags,
    });
    if (needsConfirm) pending.push({ tx, entry });
    else confirmed.push({ tx, entry, categoryId });
  }

  const messages: LineMessage[] = [];

  if (settings.confirm_style !== "off" && confirmed.length > 0) {
    if (confirmed.length <= MAX_CARDS_PER_REPLY) {
      for (const c of confirmed) {
        messages.push(
          await confirmCard(c.tx, c.categoryId, categories, settings, user, deps, c.entry.tags),
        );
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
 * Turn a pending receipt into one confirmed entry per product line (plus a remainder line when the
 * lines come to less than the total). The pending entry is claimed first, so a double tap splits once;
 * if anything fails afterwards the receipt goes back to waiting and the partial entries are removed.
 */
async function splitReceipt(tx: TxRow, user: UserRow, deps: HandlerDeps): Promise<LineMessage[]> {
  const { db } = deps;
  if (tx.status !== "pending_confirm" || !tx.slip_id) return [text(NOT_FOUND_TEXT)];
  const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());
  if (plan !== "ultimate") return [text(SPLIT_LOCKED_TEXT)];

  const split = planReceiptSplit(txAmountSatang(tx), await getSlipItems(db, user.id, tx.slip_id));
  if (!split.ok) return [text(SPLIT_UNAVAILABLE_TEXT)];

  const claimed = await claimPendingTransaction(db, user.id, tx.id);
  if (!claimed) return [text(NOT_FOUND_TEXT)];

  const created: TxRow[] = [];
  try {
    const [categories, memory] = await Promise.all([
      loadCategories(db, user.id),
      loadMemoryFor(db, user, deps.now()),
    ]);
    for (const line of split.lines) {
      const { categoryId } = categorizeByRules({
        title: line.name,
        type: tx.type,
        categories,
        memory,
      });
      created.push(
        await insertTransaction(db, {
          userId: user.id,
          type: tx.type,
          title: line.name,
          amountSatang: line.amountSatang,
          categoryId,
          occurredAt: new Date(tx.occurred_at),
          status: "confirmed",
          rawText: line.name,
          source: "slip",
          slipId: tx.slip_id,
        }),
      );
    }
    const messages: LineMessage[] = [
      text(
        splitDoneText(
          split.lines.map((l) => ({ title: l.name, amountBaht: formatBaht(l.amountSatang) })),
          formatBaht(txAmountSatang(tx)),
        ),
      ),
    ];
    for (const t of created) {
      for (const alert of await safeAlerts(deps, user.id, t, t.category_id)) {
        messages.push(text(alert));
      }
    }
    messages.push(...(await awardAndNotify(deps, user.id)));
    return messages;
  } catch (error) {
    // put everything back so the person can try again or confirm the whole receipt
    for (const t of created) {
      await updateTransaction(db, user.id, t.id, { status: "deleted" }).catch(() => undefined);
    }
    await releasePendingTransaction(db, user.id, tx.id).catch(() => undefined);
    throw error;
  }
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
  tags: string[] = [],
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
    tags,
    cycleTotalSatang: cycleTotal,
    cycleLabel:
      settings.budget_cycle === "weekly"
        ? "รายสัปดาห์"
        : `รายเดือน (วันที่ ${settings.cycle_start_day})`,
    logoUrl: process.env.APP_BASE_URL
      ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/logo.png`
      : undefined,
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
      const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
      const liffUrl = base ? `${base}/summary` : undefined;
      if (command.scope === "today") {
        const range = dayRange(now);
        const data = summarize(
          await loadSummaryTransactions(db, user.id, range.from, range.to),
          range,
          range,
        );
        const subtitle = formatThaiDate(now);
        if (data.current.count === 0) return [text(`สรุปวันนี้ (${subtitle})\nยังไม่มีรายการเลย`)];
        return [
          withRangeButton(
            buildSummaryCard({ title: "สรุปวันนี้", range, data, subtitle, liffUrl }),
          ),
        ];
      }
      const settings = await getSettings(db, user.id);
      const range =
        settings.budget_cycle === "monthly"
          ? cycleRange(now, "monthly", settings.cycle_start_day)
          : calendarMonthRange(now);
      const previous = previousRange("monthly", range);
      const data = summarize(
        await loadSummaryTransactions(db, user.id, previous.from, range.to),
        range,
        previous,
      );
      const last = new Date(range.to.getTime() - 1);
      const subtitle = `${formatThaiDate(range.from)} – ${formatThaiDate(last)}`;
      if (data.current.count === 0) return [text(`สรุปเดือนนี้ (${subtitle})\nยังไม่มีรายการเลย`)];
      return [
        withRangeButton(
          buildSummaryCard({
            title: "สรุปเดือนนี้",
            range,
            data,
            against: "เดือนก่อน",
            subtitle,
            liffUrl,
          }),
        ),
      ];
    }

    case "summary-range-usage":
      return [text(SUMMARY_RANGE_USAGE_TEXT)];

    case "summary-range": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "customRange")) {
        return [text(SUMMARY_RANGE_LOCKED_TEXT)];
      }
      return summaryForRange(
        user,
        deps,
        command.start,
        command.end === "today" ? null : command.end,
      );
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
  pickerParams?: { date?: string; time?: string; datetime?: string },
): Promise<LineMessage[]> {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  // Rich Menu "จดตังค์": answer with the how-to card; its button opens the keyboard (a=compose-go).
  if (action === "compose") return [buildComposeCard()];
  // "📆 ช่วงวันเอง" under a summary card: pick the first day, then the last (Professional and above).
  // The first day travels in the button's data, so nothing is stored between the two taps.
  if (action === "sr" || action === "sr1" || action === "sr2") {
    if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "customRange")) {
      return [text(SUMMARY_RANGE_LOCKED_TEXT)];
    }
    if (action === "sr") return [buildRangeStartPicker(deps.now())];
    const picked = daySpecFromIso(pickerParams?.date);
    if (action === "sr1") {
      if (!picked) return [text(SUMMARY_RANGE_BAD_DATE_TEXT)];
      const at = fromBangkok(picked.year!, picked.month, picked.day);
      const iso = pickerParams!.date!;
      return [buildRangeEndPicker(iso, formatThaiDate(at), deps.now())];
    }
    const first = daySpecFromIso(params.get("f") ?? undefined);
    if (!first || !picked) return [text(SUMMARY_RANGE_BAD_DATE_TEXT)];
    return summaryForRange(user, deps, first, picked);
  }
  // "📅 จดย้อนหลัง" under that card: Professional and above get the calendar, others the upsell
  // (checked here, before the calendar opens). a=bdk (the keyboard button) is silent.
  if (action === "bd") {
    if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "backdate")) {
      return [text(BACKDATE_PICKER_LOCKED_TEXT)];
    }
    return [buildDatePicker(deps.now())];
  }
  // The day chosen on the calendar -> open the keyboard with "DD/MM/YYYY " already typed.
  if (action === "bdp") {
    if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "backdate")) {
      return [text(BACKDATE_PICKER_LOCKED_TEXT)];
    }
    const picked = backdateFromPicker(pickerParams?.date, deps.now());
    if (!picked) return [text(BACKDATE_BAD_DATE_TEXT)];
    return [buildBackdatePrompt(picked.iso, picked.thai)];
  }
  // Quick Reply under that card: the categories of the chosen type (a=cc taps are silent).
  if (action === "cp") {
    const type = params.get("t") === "income" ? "income" : "expense";
    return [buildCategoryKeyboardList(type, await loadCategories(deps.db, user.id))];
  }

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

  // "📷 แนบรูป" on an entry card: plan and cap first, then wait for the next image
  if (action === "ph") {
    const blocked = await photoBlockedReply(db, user.id, deps.now());
    if (blocked) return blocked;
    const current = await getPhotoTx(db, user.id, id);
    await startPhotoWait(db, user.id, id, deps.now());
    return [buildPhotoAsk(current?.photo_path ? PHOTO_ASK_REPLACE_TEXT : PHOTO_ASK_TEXT)];
  }

  // "แยก n รายการ" on a receipt card (Ultimate): one entry per product line
  if (action === "sp") return splitReceipt(tx, user, deps);

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
  // (voice entries reuse the same steps; only "cancel" has its own wording)
  if (
    action === "sc" ||
    action === "se" ||
    action === "sk" ||
    action === "sx" ||
    action === "vx" ||
    action === "ax"
  ) {
    if (tx.status !== "pending_confirm") return [text(NOT_FOUND_TEXT)];

    if (action === "sx" || action === "vx" || action === "ax") {
      await updateTransaction(db, user.id, id, { status: "deleted" });
      return [
        text(
          action === "vx"
            ? VOICE_CANCELLED_TEXT
            : action === "ax"
              ? SMART_CANCELLED_TEXT
              : SLIP_CANCELLED_TEXT,
        ),
      ];
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
