import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetAlertsFor, dailyBudgetAlertsFor } from "@/lib/budget-alert";
import { calendarMonthRange, cycleRange, dayRange } from "@/lib/budget-cycle";
import { categorizeByRules, matchLeadingCategory, type CategoryLite } from "@/lib/categorize/rules";
import { parseCommand, type Command } from "@/lib/commands";
import { formatBaht, satangToString, toSatang } from "@/lib/money";
import {
  CONFIRM_THRESHOLD,
  LARGE_AMOUNT_SATANG,
  parseMessage,
  type ParsedEntry,
} from "@/lib/parse/text-parser";
import {
  categoryTotalSatang,
  ensureUser,
  expenseTotalSatang,
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
import { categoryLabel } from "@/lib/category-emoji";
import { buildCategorySlices } from "@/lib/category-spend";
import { loadSearchItems, loadSearchTotals, parseSearchTerm } from "@/lib/search";
import { describeTotals, sameSpanRanges } from "@/lib/period-compare";
import {
  loadCategoryCompare,
  loadForecastInput,
  loadInsightFacts,
  loadCategorySpend,
  loadSummaryData,
  loadSummaryTransactions,
  loadYearData,
} from "@/lib/summary-load";
import { generateInsight, type InsightWriter } from "@/lib/ai/insight-writer";
import { forecastCycle } from "@/lib/forecast";
import { hasSomethingToSay } from "@/lib/insight";
import { resolveYear } from "@/lib/year-summary";
import { daySpecFromIso, resolveRange, type DaySpec } from "@/lib/summary-range";
import {
  buildSummaryCard,
  expenseChangePercent,
  previousRange,
  rangeLabel,
  summarize,
} from "@/lib/summary-report";
import { handleSlipImage } from "@/lib/slips";
import { handlePhotoImage, photoBlockedReply } from "@/lib/photos";
import { needsSmartParse, runSmartParse } from "@/lib/ai/smart-parse";
import type { TextStructurer } from "@/lib/ai/text-structurer";
import { recordSmartEntries } from "./smart-entries";
import { buildForecastCard } from "./forecast-flex";
import { buildInsightCard } from "./insight-flex";
import { buildTransferDone, buildWalletChooser, buildWalletsCard } from "./wallet-flex";
import { buildCardsCard } from "./card-flex";
import { buildGoalDone, buildGoalReachedCard, buildGoalsCard } from "./goal-flex";
import { dueSpecToDate, goalProgress, resolveGoal } from "@/lib/goal";
import { addDeposit, createGoal, listGoals, undoDeposit } from "@/lib/goal-repo";
import { goalCapacity } from "@/lib/plan";
import { dailyBudgetStatus } from "@/lib/daily-budget";
import { convertToSatang, formatForeign, formatRate } from "@/lib/fx";
import { getRate } from "@/lib/fx-repo";
import { bangkokDateKey } from "@/lib/points";
import { buildDebtDone, buildDebtsCard } from "./debt-flex";
import {
  MAX_OPEN_DEBTS_PER_PERSON,
  cleanPerson,
  planPayment,
  resolveDue,
  totalsByPerson,
} from "@/lib/debt";
import {
  addPayments,
  createDebt,
  deleteDebt,
  deletePayments,
  listDebts,
  openDebtsOf,
} from "@/lib/debt-repo";
import { limitAlert } from "@/lib/card";
import { loadCardStatuses } from "@/lib/card-repo";
import { createTransfer, deleteTransfer } from "@/lib/transfer-repo";
import { ensureWallets, listWallets, setEntryWallet } from "@/lib/wallet-repo";
import { balanceOf, resolveWallet, walletLabel } from "@/lib/wallet";
import { walletCapacity } from "@/lib/plan";
import { buildSearchCard } from "./search-flex";
import {
  buildCategorySpendCard,
  buildCompareCard,
  buildRecentCard,
  buildYearCard,
} from "./spend-flex";
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
  withSummaryShortcuts,
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
  COMPARE_EMPTY_TEXT,
  COMPARE_LOCKED_TEXT,
  INSIGHT_EMPTY_TEXT,
  INSIGHT_LIMIT_TEXT,
  INSIGHT_LOCKED_TEXT,
  FORECAST_EMPTY_TEXT,
  FORECAST_LOCKED_TEXT,
  RECENT_EMPTY_TEXT,
  SEARCH_LOCKED_TEXT,
  SEARCH_USAGE_TEXT,
  searchEmptyText,
  SMART_CANCELLED_TEXT,
  SMART_PREFACE_TEXT,
  SPLIT_LOCKED_TEXT,
  SUMMARY_RANGE_BAD_DATE_TEXT,
  SUMMARY_RANGE_LOCKED_TEXT,
  SUMMARY_RANGE_ORDER_TEXT,
  SUMMARY_RANGE_TOO_LONG_TEXT,
  SUMMARY_RANGE_USAGE_TEXT,
  YEAR_BAD_TEXT,
  YEAR_LOCKED_TEXT,
  yearEmptyText,
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
  WALLET_AMBIGUOUS_TEXT,
  WALLET_MOVE_ASK_TEXT,
  WALLET_MOVED_TEXT,
  WALLET_NOT_FOUND_TEXT,
  CARD_LOCKED_TEXT,
  GOAL_BAD_DUE_TEXT,
  GOAL_EMPTY_TEXT,
  GOAL_EXISTS_TEXT,
  GOAL_LOCKED_TEXT,
  GOAL_UNDO_BLOCKED_TEXT,
  GOAL_UNDONE_TEXT,
  goalAmbiguousText,
  goalFullText,
  goalOverdrawText,
  DAILY_BUDGET_CLEARED_TEXT,
  DAILY_BUDGET_LOCKED_TEXT,
  DAILY_BUDGET_NONE_TEXT,
  DAILY_BUDGET_USAGE_TEXT,
  dailyBudgetSetText,
  DEBT_BAD_DUE_TEXT,
  FX_FAILED_TEXT,
  FX_LOCKED_TEXT,
  FX_TOO_SMALL_TEXT,
  fxUnsupportedText,
  DEBT_CANCELLED_TEXT,
  DEBT_EMPTY_TEXT,
  DEBT_LOCKED_TEXT,
  DEBT_TOO_MANY_TEXT,
  debtOverpayText,
  CARD_NONE_TEXT,
  CARD_NO_DETAIL_TEXT,
  TRANSFER_CANCELLED_TEXT,
  TRANSFER_LOCKED_TEXT,
  TRANSFER_SAME_TEXT,
  TRANSFER_USAGE_TEXT,
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
  /** AI that writes the AI Insight (Ultimate). Absent -> plain-code observations instead. */
  insightWriter?: InsightWriter;
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
  if (command?.kind === "transfer") {
    // "โอนค่าเช่า 5000 ไป ..." that names no wallet is an ordinary entry, so it falls through
    const done = await runTransfer(command, user, deps);
    if (done) return done;
  } else if (
    command?.kind === "goal-new" ||
    command?.kind === "goal-deposit" ||
    command?.kind === "goal-withdraw"
  ) {
    // "ออม ทอง 500" that names none of their goals is an ordinary entry
    const done = await runGoal(command, user, deps);
    if (done) return done;
  } else if (command?.kind === "debt-new" || command?.kind === "debt-pay") {
    // "สมชายคืน 200" with no such debt (or "ยืม..." that is not one) is an ordinary message
    const done = await runDebt(command, user, deps);
    if (done) return done;
  } else if (command?.kind === "cards") {
    // "บัตร จอดรถ" that names no card of theirs is not a command
    const done = await runCards(command, user, deps);
    if (done) return done;
  } else if (command) {
    return runCommand(command, user, deps);
  }

  const parsed = parseMessage(input, deps.now(), { currencies: true });
  let { entries } = parsed;
  const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());

  // Long or unclear sentences (Ultimate): let the AI read them, then ask before saving anything.
  if (
    deps.structurer &&
    can(plan, "smartParse") &&
    !entries.some((e) => e.foreign) &&
    needsSmartParse(input, parsed)
  ) {
    const smart = await readWithAi(input, user, deps);
    if (smart) return smart;
  }

  if (entries.length === 0) return [text(NOT_UNDERSTOOD_TEXT)];
  // "ราเมน 1500 JPY": convert to baht first (Ultimate); everything after sees plain baht entries
  if (entries.some((e) => e.foreign)) {
    if (!can(plan, "foreignCurrency")) return [text(FX_LOCKED_TEXT)];
    const converted = await convertForeignEntries(entries, deps);
    if (typeof converted === "string") return [text(converted)];
    entries = converted;
  }
  if (entries.some((e) => e.backdated) && !can(plan, "backdate")) {
    return [text(BACKDATE_LOCKED_TEXT)];
  }
  if (entries.length > 1 && !can(plan, "multiEntry")) return [text(MULTI_ENTRY_LOCKED_TEXT)];
  if (entries.some((e) => e.tags.length > 0) && !can(plan, "tags")) {
    return [text(TAGS_LOCKED_TEXT)];
  }
  // "@บัตร": find each named wallet first, and record nothing if one cannot be told apart
  const walletIds = new Map<ParsedEntry, string>();
  if (entries.some((e) => e.walletHint)) {
    const wallets = await ensureWallets(deps.db, user.id);
    for (const e of entries) {
      if (!e.walletHint) continue;
      const found = resolveWallet(e.walletHint, wallets);
      if (!found.ok) {
        const names =
          found.reason === "ambiguous"
            ? wallets
                .filter((w) => w.name.toLowerCase().startsWith(e.walletHint!.toLowerCase()))
                .map((w) => w.name)
            : wallets.map((w) => w.name);
        return [
          text(
            found.reason === "ambiguous"
              ? WALLET_AMBIGUOUS_TEXT(e.walletHint, names)
              : WALLET_NOT_FOUND_TEXT(e.walletHint, names),
          ),
        ];
      }
      walletIds.set(e, found.wallet.id);
    }
  }
  return saveEntries(entries, user, deps, walletIds);
}

/** Wallet balance as text, e.g. "เงินสด คงเหลือ ฿9,500". */
async function balanceLine(deps: HandlerDeps, userId: string, walletId: string): Promise<string> {
  const wallets = await listWallets(deps.db, userId);
  const w = wallets.find((x) => x.id === walletId);
  return w ? `${w.name} คงเหลือ ฿${formatBaht(balanceOf(w))}` : "";
}

/** Lend / borrow / repay by chat. null when it is not about a debt of theirs (then it is an ordinary message). */
async function runDebt(
  command: Extract<Command, { kind: "debt-new" | "debt-pay" }>,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[] | null> {
  const { db } = deps;
  const ultimate = can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "debts");

  if (command.kind === "debt-pay") {
    if (!ultimate) return null;
    const debts = await listDebts(db, user.id);
    const open = openDebtsOf(debts, command.person, command.direction);
    if (open.length === 0) return null;
    const plan = planPayment(
      open.map((d) => ({ id: d.id, remainingSatang: d.remainingSatang })),
      command.amountSatang,
    );
    const person = cleanPerson(open[0]?.person ?? command.person);
    if (!plan.ok) return [text(debtOverpayText(person, formatBaht(plan.owedSatang)))];

    const wallets = await ensureWallets(db, user.id);
    let wallet =
      wallets.find((w) => w.id === open[0]?.accountId) ?? wallets.find((w) => w.isDefault);
    if (command.walletHint) {
      const found = resolveWallet(command.walletHint, wallets);
      if (!found.ok) {
        const names = wallets.map((w) => w.name);
        return [
          text(
            found.reason === "ambiguous"
              ? WALLET_AMBIGUOUS_TEXT(command.walletHint, names)
              : WALLET_NOT_FOUND_TEXT(command.walletHint, names),
          ),
        ];
      }
      wallet = found.wallet;
    }
    if (!wallet) return null;

    const ids = await addPayments(db, user.id, plan.parts, {
      accountId: wallet.id,
      paidAt: deps.now(),
    });
    const left = open.reduce((s, d) => s + d.remainingSatang, 0) - command.amountSatang;
    return [
      buildDebtDone({
        undoData: `a=dpx&id=${ids.join(",")}`,
        text: [
          command.direction === "lent"
            ? `รับคืนจาก ${person} ฿${formatBaht(command.amountSatang)}`
            : `คืนเงิน ${person} ฿${formatBaht(command.amountSatang)}`,
          left > 0 ? `ยังเหลือ ฿${formatBaht(left)}` : "ปิดหนี้ครบแล้ว 🎉",
          await balanceLine(deps, user.id, wallet.id),
          "(ไม่นับเป็นรายรับ/รายจ่าย)",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    ];
  }

  if (!ultimate) return [text(DEBT_LOCKED_TEXT)];
  const wallets = await ensureWallets(db, user.id);
  let wallet = wallets.find((w) => w.isDefault);
  if (command.walletHint) {
    const found = resolveWallet(command.walletHint, wallets);
    if (!found.ok) {
      const names = wallets.map((w) => w.name);
      return [
        text(
          found.reason === "ambiguous"
            ? WALLET_AMBIGUOUS_TEXT(command.walletHint, names)
            : WALLET_NOT_FOUND_TEXT(command.walletHint, names),
        ),
      ];
    }
    wallet = found.wallet;
  }
  if (!wallet) return null;

  let dueAt: Date | null = null;
  if (command.due) {
    dueAt = resolveDue(command.due, deps.now());
    if (!dueAt) return [text(DEBT_BAD_DUE_TEXT)];
  }
  const existing = await listDebts(db, user.id);
  if (
    openDebtsOf(existing, command.person, command.direction).length >= MAX_OPEN_DEBTS_PER_PERSON
  ) {
    return [text(DEBT_TOO_MANY_TEXT)];
  }

  const id = await createDebt(db, user.id, {
    direction: command.direction,
    person: command.person,
    amountSatang: command.amountSatang,
    accountId: wallet.id,
    occurredAt: deps.now(),
    dueAt,
  });
  const person = cleanPerson(command.person);
  return [
    buildDebtDone({
      undoData: `a=dx&id=${id}`,
      text: [
        command.direction === "lent"
          ? `จดแล้ว: ให้ ${person} ยืม ฿${formatBaht(command.amountSatang)}`
          : `จดแล้ว: ยืม ${person} ฿${formatBaht(command.amountSatang)}`,
        dueAt ? `กำหนดคืน ${formatThaiDate(dueAt)}` : "",
        await balanceLine(deps, user.id, wallet.id),
        "(ไม่นับเป็นรายรับ/รายจ่าย)",
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  ];
}

/** New goal / put in / take out. null when it is not about a goal of theirs (then an ordinary message). */
async function runGoal(
  command: Extract<Command, { kind: "goal-new" | "goal-deposit" | "goal-withdraw" }>,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[] | null> {
  const { db } = deps;
  const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());
  const allowed = can(plan, "savingsGoal");
  if (command.kind === "goal-new" && !allowed) return [text(GOAL_LOCKED_TEXT)];
  if (!allowed) return null;

  const goals = (await listGoals(db, user.id, deps.now())).filter((g) => !g.archived);

  if (command.kind === "goal-new") {
    if (goals.length >= goalCapacity(plan)) return [text(goalFullText(goalCapacity(plan)))];
    const dueOn = command.due ? dueSpecToDate(command.due, (s) => resolveDue(s, deps.now())) : null;
    if (command.due && !dueOn) return [text(GOAL_BAD_DUE_TEXT)];
    const id = await createGoal(db, user.id, {
      name: command.name,
      targetSatang: command.targetSatang,
      dueOn,
    });
    if (id === "duplicate") return [text(GOAL_EXISTS_TEXT)];
    return [
      text(
        [
          `สร้างเป้าหมายแล้ว: ${command.name} ฿${formatBaht(command.targetSatang)}`,
          dueOn ? `ภายใน ${dueOn.split("-").reverse().join("/")}` : "",
          `หยอดกระปุกด้วย "ออม ${command.name} 1000" ได้เลย`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ];
  }

  const found = resolveGoal(command.name, goals);
  if (!found.ok) {
    if (found.reason === "none") return null;
    const names = goals
      .filter((g) => g.name.toLowerCase().startsWith(command.name.toLowerCase()))
      .map((g) => g.name);
    return [text(goalAmbiguousText(command.name, names))];
  }
  const goal = found.goal;
  const out = command.kind === "goal-withdraw";
  if (out && command.amountSatang > goal.savedSatang) {
    return [text(goalOverdrawText(goal.name, formatBaht(goal.savedSatang)))];
  }

  const depositId = await addDeposit(db, user.id, goal.id, {
    amountSatang: out ? -command.amountSatang : command.amountSatang,
    occurredAt: deps.now(),
  });
  const saved = goal.savedSatang + (out ? -command.amountSatang : command.amountSatang);
  const after = {
    ...goal,
    savedSatang: saved,
    ...goalProgress({ ...goal, savedSatang: saved }, deps.now()),
  };
  const reached = !goal.done && after.done;
  const messages: LineMessage[] = [
    buildGoalDone({
      undoData: `a=gx&id=${depositId}&g=${goal.id}`,
      text: [
        out
          ? `ถอนแล้ว ฿${formatBaht(command.amountSatang)} จาก ${goal.name}`
          : `หยอดแล้ว ฿${formatBaht(command.amountSatang)} → ${goal.name}`,
        `สะสม ฿${formatBaht(saved)} จาก ฿${formatBaht(goal.targetSatang)} (${after.percent}%)`,
        after.done ? "ครบเป้าแล้ว" : `เหลืออีก ฿${formatBaht(after.remainingSatang)}`,
      ].join("\n"),
    }),
  ];
  if (reached) messages.push(buildGoalReachedCard(after));
  return messages;
}

/** The daily limit in satang when they have one and their plan allows it, else null. */
async function dailyLimitOf(user: UserRow, deps: HandlerDeps): Promise<number | null> {
  if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "dailyBudget")) return null;
  const settings = await getSettings(deps.db, user.id);
  return settings.daily_budget === null || settings.daily_budget === undefined
    ? null
    : toSatang(settings.daily_budget);
}

async function saveDailyBudget(deps: HandlerDeps, userId: string, satang: number | null) {
  const { error } = await deps.db
    .from("user_settings")
    .upsert(
      { user_id: userId, daily_budget: satang === null ? null : satangToString(satang) },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`save daily budget: ${error.message}`);
}

/** "บัตร": the card summary. null when a typed name matches none of their cards. */
async function runCards(
  command: Extract<Command, { kind: "cards" }>,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[] | null> {
  const wallets = await ensureWallets(deps.db, user.id);
  let cards = wallets.filter((w) => w.kind === "card");
  if (command.name) {
    const found = resolveWallet(command.name, cards);
    if (!found.ok) return null;
    cards = [found.wallet];
  }
  if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "creditCard")) {
    return [text(CARD_LOCKED_TEXT)];
  }
  if (cards.length === 0) return [text(CARD_NONE_TEXT)];
  const statuses = await loadCardStatuses(deps.db, user.id, cards, deps.now());
  const shown = cards.flatMap((wallet) => {
    const status = statuses.get(wallet.id);
    return status ? [{ wallet, status }] : [];
  });
  if (shown.length === 0) return [text(CARD_NO_DETAIL_TEXT)];
  return [buildCardsCard({ cards: shown, manageUrl: pageUrl("/wallets") })];
}

/**
 * 80% / 100% of a card's limit: after expenses were saved to cards, warn when the amount owed
 * crossed a line. Entries to the same card in one message are added up first.
 */
async function cardLimitAlerts(
  deps: HandlerDeps,
  user: UserRow,
  spent: { walletId: string | null; amountSatang: number }[],
): Promise<string[]> {
  if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "creditCard")) return [];
  try {
    const wallets = await listWallets(deps.db, user.id);
    const main = wallets.find((w) => w.isDefault);
    const totals = new Map<string, number>();
    for (const s of spent) {
      const id = s.walletId ?? main?.id;
      if (id) totals.set(id, (totals.get(id) ?? 0) + s.amountSatang);
    }
    const out: string[] = [];
    for (const [id, amount] of totals) {
      const wallet = wallets.find((w) => w.id === id);
      const alert = wallet ? limitAlert(wallet, amount) : null;
      if (alert) out.push(alert);
    }
    return out;
  } catch (error) {
    log.error("card_alert_failed", error);
    return [];
  }
}

/** "โอน 500 เงินสด>KTC": null when neither name is a wallet of theirs (then it is not a transfer). */
async function runTransfer(
  command: Extract<Command, { kind: "transfer" }>,
  user: UserRow,
  deps: HandlerDeps,
): Promise<LineMessage[] | null> {
  const wallets = await ensureWallets(deps.db, user.id);
  const from = resolveWallet(command.from, wallets);
  const to = resolveWallet(command.to, wallets);
  if (!from.ok && !to.ok && from.reason === "none" && to.reason === "none") return null;

  if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "transfer")) {
    return [text(TRANSFER_LOCKED_TEXT)];
  }
  for (const [side, hint] of [
    [from, command.from],
    [to, command.to],
  ] as const) {
    if (!side.ok) {
      const names = wallets.map((w) => w.name);
      return [
        text(
          side.reason === "ambiguous"
            ? WALLET_AMBIGUOUS_TEXT(hint, names)
            : WALLET_NOT_FOUND_TEXT(hint, names),
        ),
      ];
    }
  }
  if (!from.ok || !to.ok) return null;
  if (from.wallet.id === to.wallet.id) return [text(TRANSFER_SAME_TEXT)];

  const id = await createTransfer(deps.db, user.id, {
    fromId: from.wallet.id,
    toId: to.wallet.id,
    amountSatang: command.amountSatang,
    occurredAt: deps.now(),
  });
  const after = await listWallets(deps.db, user.id);
  const balance = (walletId: string) => {
    const w = after.find((x) => x.id === walletId);
    return w ? `฿${formatBaht(balanceOf(w))}` : "";
  };
  return [
    buildTransferDone({
      transferId: id,
      text: [
        `โอนแล้ว ฿${formatBaht(command.amountSatang)}`,
        `${walletLabel(from.wallet)} → ${walletLabel(to.wallet)}`,
        `คงเหลือ: ${from.wallet.name} ${balance(from.wallet.id)} · ${to.wallet.name} ${balance(to.wallet.id)}`,
        "(ไม่นับเป็นรายรับ/รายจ่าย)",
      ].join("\n"),
    }),
  ];
}

/**
 * Turn each foreign-currency entry into baht at the rate of its day. Returns the reason (text for the
 * user) when one cannot be converted: nothing is saved then.
 */
async function convertForeignEntries(
  entries: ParsedEntry[],
  deps: HandlerDeps,
): Promise<ParsedEntry[] | string> {
  const today = bangkokDateKey(deps.now());
  const rates = new Map<string, Awaited<ReturnType<typeof getRate>>>();
  const out: ParsedEntry[] = [];
  for (const entry of entries) {
    const f = entry.foreign;
    if (!f) {
      out.push(entry);
      continue;
    }
    if (!f.supported) return fxUnsupportedText(f.currency);
    const day = bangkokDateKey(entry.occurredAt);
    const key = `${f.currency}:${day}`;
    if (!rates.has(key)) rates.set(key, await getRate(deps.db, f.currency, day, today));
    const resolved = rates.get(key);
    if (!resolved) return FX_FAILED_TEXT;
    const amountSatang = convertToSatang(f.minor, resolved.rate);
    if (amountSatang <= 0) return FX_TOO_SMALL_TEXT;
    out.push({
      ...entry,
      amountSatang,
      fx: {
        currency: f.currency,
        minor: f.minor,
        rate: resolved.rate,
        sourceDay: resolved.sourceDay,
        stale: resolved.stale,
      },
    });
  }
  return out;
}

/** "1,500 JPY @ 0.2335" (with a note when an older rate had to be used). */
function fxNoteOf(fx: NonNullable<ParsedEntry["fx"]>): string {
  const base = `${formatForeign(fx.minor, fx.currency)} @ ${formatRate(fx.rate)}`;
  if (!fx.stale) return base;
  const [, month, day] = fx.sourceDay.split("-");
  return `${base} (อัตราของวันที่ ${Number(day)}/${Number(month)} เพราะแหล่งอัตราไม่ตอบ)`;
}

/** "🐱 ค่าอาหารแมว" for a category that has an emoji, its plain name otherwise, null for none. */
function categoryLabelOf(c: { name: string; icon?: string | null } | undefined): string | null {
  return c ? categoryLabel(c.name, c.icon) : null;
}

/** A page of the web app, through the LIFF link inside LINE (undefined when no address is known). */
function pageUrl(path: string): string | undefined {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `https://liff.line.me/${liffId}${path}`;
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}${path}` : undefined;
}

/**
 * Link that opens the entries list with a search already typed: inside LINE it goes through the
 * LIFF link (which keeps the path and query), otherwise the plain app URL.
 */
function listUrl(term: string): string | undefined {
  const query = term ? `?q=${encodeURIComponent(term)}` : "";
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `https://liff.line.me/${liffId}/transactions${query}`;
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  return base ? `${base}/transactions${query}` : undefined;
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
  walletIds: Map<ParsedEntry, string> = new Map(),
): Promise<LineMessage[]> {
  const { db } = deps;
  const [settings, categories, memory] = await Promise.all([
    getSettings(db, user.id),
    loadCategories(db, user.id),
    loadMemoryFor(db, user, deps.now()),
  ]);

  const confirmed: {
    tx: TxRow;
    entry: ParsedEntry;
    categoryId: string | null;
    walletId: string | null;
  }[] = [];
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
      accountId: walletIds.get(parsed) ?? null,
      foreign: parsed.fx
        ? { currency: parsed.fx.currency, minor: parsed.fx.minor, rate: parsed.fx.rate }
        : null,
    });
    if (needsConfirm) pending.push({ tx, entry });
    else confirmed.push({ tx, entry, categoryId, walletId: walletIds.get(parsed) ?? null });
  }

  const messages: LineMessage[] = [];

  if (settings.confirm_style !== "off" && confirmed.length > 0) {
    if (confirmed.length <= MAX_CARDS_PER_REPLY) {
      for (const c of confirmed) {
        messages.push(
          await confirmCard(
            c.tx,
            c.categoryId,
            categories,
            settings,
            user,
            deps,
            c.entry.tags,
            c.walletId,
            c.entry.fx ? fxNoteOf(c.entry.fx) : null,
          ),
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
  alerts.push(...(await safeDailyAlerts(deps, user.id, confirmed)));
  alerts.push(
    ...(await cardLimitAlerts(
      deps,
      user,
      confirmed
        .filter((c) => c.entry.type === "expense")
        .map((c) => ({ walletId: c.walletId, amountSatang: c.entry.amountSatang })),
    )),
  );
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

/** The daily-limit scold for what this message added to today (best effort, like the budget alerts). */
async function safeDailyAlerts(
  deps: HandlerDeps,
  userId: string,
  saved: { tx: TxRow }[],
): Promise<string[]> {
  const today = deps.now();
  const expenses = saved.filter((s) => s.tx.type === "expense");
  const todays = expenses.filter(
    (s) => bangkokDateKey(new Date(s.tx.occurred_at)) === bangkokDateKey(today),
  );
  const amountSatang = todays.reduce((sum, s) => sum + txAmountSatang(s.tx), 0);
  if (amountSatang <= 0) return [];
  try {
    return await dailyBudgetAlertsFor(deps.db, {
      userId,
      amountSatang,
      occurredAt: today,
      now: today,
    });
  } catch (error) {
    log.error("daily_budget_alert_failed", error);
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
  walletId: string | null = null,
  fxNote: string | null = null,
): Promise<LineMessage> {
  const style = settings.confirm_style === "short" ? "short" : "full";
  // The wallet only shows up once there is more than one to tell apart.
  const wallets = await listWallets(deps.db, user.id).catch(() => []);
  const multi = wallets.length > 1;
  const wallet = multi
    ? (wallets.find((w) => w.id === walletId) ?? wallets.find((w) => w.isDefault))
    : undefined;
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
    categoryName: categoryLabelOf(categories.find((c) => c.id === categoryId)),
    amountSatang: txAmountSatang(tx),
    occurredAt: new Date(tx.occurred_at),
    tags,
    walletName: wallet ? walletLabel(wallet) : null,
    canMoveWallet: multi,
    fxNote,
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
        // with a daily limit set (Professional and above) the card says how much of it is used
        const limit = await dailyLimitOf(user, deps);
        return [
          withSummaryShortcuts(
            buildSummaryCard({
              title: "สรุปวันนี้",
              range,
              data,
              subtitle,
              liffUrl,
              dailyLimitSatang: limit ?? undefined,
            }),
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
        withSummaryShortcuts(
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

    case "recent": {
      const items = await loadSearchItems(db, user.id, { q: null, tag: null }, 5);
      if (items.length === 0) return [text(RECENT_EMPTY_TEXT)];
      return [buildRecentCard({ items, moreUrl: listUrl("") })];
    }

    case "category-spend": {
      const now = deps.now();
      const settings = await getSettings(db, user.id);
      const range =
        settings.budget_cycle === "monthly"
          ? cycleRange(now, "monthly", settings.cycle_start_day)
          : calendarMonthRange(now);
      const subtitle = `${formatThaiDate(range.from)} – ${formatThaiDate(new Date(range.to.getTime() - 1))}`;
      const slices = buildCategorySlices(await loadCategorySpend(db, user.id, range));
      if (slices.length === 0)
        return [text(`ใช้จ่ายตามหมวด (${subtitle})\nยังไม่มีรายจ่ายในรอบนี้`)];
      const totalSatang = slices.reduce((sum, s) => sum + s.amountSatang, 0);
      return [
        buildCategorySpendCard({
          subtitle,
          slices,
          totalSatang,
          // the charts page is a Professional feature: Free is not sent to a locked page
          moreUrl: can(effectivePlan(user.plan, user.plan_expires_at, now), "dashboard")
            ? pageUrl("/analytics")
            : undefined,
        }),
      ];
    }

    case "compare-months": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "categoryCompare")) {
        return [text(COMPARE_LOCKED_TEXT)];
      }
      const now = deps.now();
      const settings = await getSettings(db, user.id);
      const cycle =
        settings.budget_cycle === "monthly"
          ? cycleRange(now, "monthly", settings.cycle_start_day)
          : calendarMonthRange(now);
      const span = sameSpanRanges(cycle, now);
      const result = await loadCategoryCompare(db, user.id, span.current, span.previous);
      if (result.currentSatang === 0 && result.previousSatang === 0) {
        return [text(COMPARE_EMPTY_TEXT)];
      }
      return [
        buildCompareCard({
          currentLabel: rangeLabel(span.current),
          previousLabel: rangeLabel(span.previous),
          rows: result.rows,
          currentSatang: result.currentSatang,
          previousSatang: result.previousSatang,
          totalChange: describeTotals(result.currentSatang, result.previousSatang),
          moreUrl: pageUrl("/analytics"),
        }),
      ];
    }

    case "forecast": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "forecast")) {
        return [text(FORECAST_LOCKED_TEXT)];
      }
      const now = deps.now();
      const settings = await getSettings(db, user.id);
      const cycle =
        settings.budget_cycle === "monthly"
          ? cycleRange(now, "monthly", settings.cycle_start_day)
          : calendarMonthRange(now);
      const forecastInput = await loadForecastInput(db, user.id, now, cycle);
      if (forecastInput.entryCount === 0 && forecastInput.upcoming.length === 0) {
        return [text(FORECAST_EMPTY_TEXT)];
      }
      const today = bangkokParts(now);
      return [
        buildForecastCard({
          forecast: forecastCycle(forecastInput),
          today: fromBangkok(today.year, today.month, today.day),
          subtitle: `${formatThaiDate(cycle.from)} – ${formatThaiDate(new Date(cycle.to.getTime() - 1))}`,
          moreUrl: pageUrl("/summary"),
        }),
      ];
    }

    case "goals": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "savingsGoal")) {
        return [text(GOAL_LOCKED_TEXT)];
      }
      const goals = (await listGoals(db, user.id, deps.now())).filter((g) => !g.archived);
      if (goals.length === 0) return [text(GOAL_EMPTY_TEXT)];
      return [buildGoalsCard({ goals, manageUrl: pageUrl("/goals") })];
    }

    case "goal-new":
    case "goal-deposit":
    case "goal-withdraw": // handled in handleText; only reached by a direct call
      return [text(GOAL_EMPTY_TEXT)];

    case "daily-budget": {
      const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());
      if (command.action === "usage") return [text(DAILY_BUDGET_USAGE_TEXT)];
      if (command.action === "clear") {
        await saveDailyBudget(deps, user.id, null);
        return [text(DAILY_BUDGET_CLEARED_TEXT)];
      }
      if (!can(plan, "dailyBudget")) return [text(DAILY_BUDGET_LOCKED_TEXT)];
      if (command.action === "set" && command.amountSatang) {
        await saveDailyBudget(deps, user.id, command.amountSatang);
        return [text(dailyBudgetSetText(formatBaht(command.amountSatang)))];
      }
      const limit = await dailyLimitOf(user, deps);
      if (limit === null) return [text(DAILY_BUDGET_NONE_TEXT)];
      const range = dayRange(deps.now());
      const spent = await expenseTotalSatang(db, {
        userId: user.id,
        from: range.from,
        to: range.to,
      });
      return [text(dailyBudgetStatus(spent, limit))];
    }

    case "debts": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "debts")) {
        return [text(DEBT_LOCKED_TEXT)];
      }
      const people = totalsByPerson(await listDebts(db, user.id));
      if (people.length === 0) return [text(DEBT_EMPTY_TEXT)];
      return [buildDebtsCard({ people, now: deps.now(), manageUrl: pageUrl("/debts") })];
    }

    case "debt-new":
    case "debt-pay": // handled in handleText; only reached by a direct call
      return [text(DEBT_EMPTY_TEXT)];

    case "cards": // handled in handleText; only reached by a direct call
      return [text(CARD_NONE_TEXT)];

    case "transfer": // handled in handleText; only reached by a direct call
      return [text(TRANSFER_USAGE_TEXT)];

    case "wallets": {
      const wallets = await ensureWallets(db, user.id);
      const plan = effectivePlan(user.plan, user.plan_expires_at, deps.now());
      return [
        buildWalletsCard({
          wallets,
          canAdd: wallets.length < walletCapacity(plan),
          manageUrl: pageUrl("/wallets"),
        }),
      ];
    }

    case "insight": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "insight")) {
        return [text(INSIGHT_LOCKED_TEXT)];
      }
      if (deps.limit) {
        const day = await deps.limit("insight_day", user.line_user_id, LIMITS.insightDay);
        if (!day.allowed) return [text(INSIGHT_LIMIT_TEXT)];
      }
      const now = deps.now();
      const settings = await getSettings(db, user.id);
      const cycle =
        settings.budget_cycle === "monthly"
          ? cycleRange(now, "monthly", settings.cycle_start_day)
          : calendarMonthRange(now);
      const span = sameSpanRanges(cycle, now);
      const facts = await loadInsightFacts(db, user.id, span.current, span.previous, {
        current: rangeLabel(span.current),
        previous: "เดือนก่อน",
      });
      if (!hasSomethingToSay(facts)) return [text(INSIGHT_EMPTY_TEXT)];
      const insight = await generateInsight(deps.insightWriter, facts);
      return [
        buildInsightCard({
          insight,
          subtitle: `รอบนี้ ${rangeLabel(span.current)} เทียบ ${rangeLabel(span.previous)}`,
          moreUrl: can(effectivePlan(user.plan, user.plan_expires_at, now), "dashboard")
            ? pageUrl("/analytics")
            : undefined,
        }),
      ];
    }

    case "year-summary": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "yearSummary")) {
        return [text(YEAR_LOCKED_TEXT)];
      }
      const year = resolveYear(command.year, deps.now());
      if (!year.ok) return [text(YEAR_BAD_TEXT)];
      const data = await loadYearData(db, user.id, year);
      const yearBE = year.year + 543;
      if (data.summary.current.count === 0) return [text(yearEmptyText(yearBE))];
      return [
        buildYearCard({
          yearBE,
          subtitle: `${formatThaiDate(year.range.from)} – ${formatThaiDate(new Date(year.range.to.getTime() - 1))}`,
          income: data.summary.current.income,
          expense: data.summary.current.expense,
          changePercent: expenseChangePercent(data.summary),
          topExpenses: data.summary.topExpenses,
          months: data.months.map((m) => ({ month: m.month, expenseSatang: m.expenseSatang })),
          moreUrl: pageUrl("/analytics"),
        }),
      ];
    }

    case "search-usage":
      return [text(SEARCH_USAGE_TEXT)];

    case "search": {
      if (!can(effectivePlan(user.plan, user.plan_expires_at, deps.now()), "searchTotals")) {
        return [text(SEARCH_LOCKED_TEXT)];
      }
      const target = parseSearchTerm(command.term);
      if (!target) return [text(SEARCH_USAGE_TEXT)];
      const term = target.tag ? `#${target.tag}` : (target.q ?? "");
      const [totals, items] = await Promise.all([
        loadSearchTotals(db, user.id, target),
        loadSearchItems(db, user.id, target, 5),
      ]);
      if (totals.count === 0) return [text(searchEmptyText(term))];
      return [buildSearchCard({ term, totals, items, moreUrl: listUrl(term) })];
    }

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

  // "↩ ยกเลิกการโอน" under a transfer: the id is a transfer, not an entry
  if (action === "tc") {
    const transferId = params.get("id");
    if (!transferId) return [];
    const removed = await deleteTransfer(deps.db, user.id, transferId);
    return [text(removed ? TRANSFER_CANCELLED_TEXT : NOT_FOUND_TEXT)];
  }

  // "↩ ยกเลิก" under a deposit into a goal: the id is a deposit, g is its goal
  if (action === "gx") {
    const result = await undoDeposit(
      deps.db,
      user.id,
      params.get("g") ?? "",
      params.get("id") ?? "",
    );
    return [
      text(
        result === "ok"
          ? GOAL_UNDONE_TEXT
          : result === "blocked"
            ? GOAL_UNDO_BLOCKED_TEXT
            : NOT_FOUND_TEXT,
      ),
    ];
  }

  // "↩ ยกเลิก" under a debt or a repayment
  if (action === "dx" || action === "dpx") {
    const target = params.get("id") ?? "";
    const removed =
      action === "dx"
        ? await deleteDebt(deps.db, user.id, target)
        : (await deletePayments(deps.db, user.id, target.split(",").filter(Boolean))) > 0;
    return [text(removed ? DEBT_CANCELLED_TEXT : NOT_FOUND_TEXT)];
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

  // "💳 ย้ายกระเป๋า": list the wallets, then (a=wm) move the entry to the one tapped
  if (action === "wl") {
    const wallets = await listWallets(db, user.id);
    if (wallets.length < 2) return [];
    return [buildWalletChooser({ txId: id, wallets, currentId: null, text: WALLET_MOVE_ASK_TEXT })];
  }
  if (action === "wm") {
    const target = (await listWallets(db, user.id)).find((w) => w.id === params.get("w"));
    if (!target) return [text(NOT_FOUND_TEXT)];
    const moved = await setEntryWallet(db, user.id, id, target.isDefault ? null : target.id);
    return [text(moved ? WALLET_MOVED_TEXT(tx.title, walletLabel(target)) : NOT_FOUND_TEXT)];
  }

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
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
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
