import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarMonthRange, dayRange } from "@/lib/budget-cycle";
import {
  MAX_GROUPS_PER_OWNER,
  MAX_GROUP_ENTRIES_PER_DAY,
  MAX_RECORDS_PER_MESSAGE,
  RECENT_COUNT,
  canDeleteEntry,
  parseGroupCommand,
  summarizePayers,
  type GroupCommand,
  type GroupRow,
} from "@/lib/group";
import {
  addEntries,
  closeGroup,
  countEntriesSince,
  countOwnedGroups,
  deleteEntry,
  getEntry,
  getGroup,
  getOwner,
  memberNames,
  openGroup,
  payerTotals,
  recentEntries,
  upsertMember,
} from "@/lib/group-repo";
import { log } from "@/lib/log";
import { formatBaht } from "@/lib/money";
import { parseMessage } from "@/lib/parse/text-parser";
import { can, effectivePlan } from "@/lib/plan";
import { LIMITS } from "@/lib/rate-limit";
import { ensureUser } from "@/lib/repo";
import { formatThaiDate } from "@/lib/thai-date";
import type { LineMessage } from "@/lib/types";
import { buildGroupSummaryCard } from "./group-flex";
import type { HandlerDeps, LineEvent } from "./handlers";
import {
  GROUP_ALREADY_OPEN_TEXT,
  GROUP_CANNOT_DELETE_TEXT,
  GROUP_CLOSED_TEXT,
  GROUP_DAY_FULL_TEXT,
  GROUP_DELETED_TEXT,
  GROUP_ENTRY_GONE_TEXT,
  GROUP_EXPENSE_ONLY_TEXT,
  GROUP_HELP_TEXT,
  GROUP_LOCKED_TEXT,
  GROUP_NOT_OPEN_TEXT,
  GROUP_NOTHING_TO_DELETE_TEXT,
  GROUP_NO_USER_TEXT,
  GROUP_OPENED_TEXT,
  GROUP_OTHER_OWNER_TEXT,
  GROUP_OWNER_ONLY_TEXT,
  GROUP_PAUSED_TEXT,
  GROUP_RECENT_EMPTY_TEXT,
  GROUP_RECORD_USAGE_TEXT,
  GROUP_TOO_MANY_ENTRIES_TEXT,
  GROUP_TOO_MANY_TEXT,
  GROUP_WELCOME_TEXT,
  text,
} from "./messages";

const NAME_FALLBACK = "สมาชิกกลุ่ม";
const NAME_REFRESH_MS = 7 * 86_400_000;

/**
 * Events from a LINE group. The bot answers only the explicit group commands (see
 * parseGroupCommand): ordinary chat is never recorded, and nothing personal is ever shown here.
 */
export async function handleGroupEvent(event: LineEvent, deps: HandlerDeps): Promise<void> {
  const groupId = event.source?.groupId;
  if (!groupId) return;
  const reply = async (messages: LineMessage[]) => {
    if (event.replyToken && messages.length > 0) await deps.reply(event.replyToken, messages);
  };

  switch (event.type) {
    case "join":
      await reply([text(GROUP_WELCOME_TEXT)]);
      return;
    case "leave":
      await closeGroup(deps.db, groupId);
      return;
    case "postback":
      await handleGroupPostback(event, groupId, deps, reply);
      return;
    case "message": {
      if (event.message?.type !== "text" || event.message.text === undefined) return;
      const command = parseGroupCommand(event.message.text);
      if (!command) return; // ordinary chat: stay quiet
      if (deps.limit) {
        const result = await deps.limit("group", groupId, LIMITS.chat);
        if (!result.allowed) return;
      }
      await runGroupCommand(command, event, groupId, deps, reply);
      return;
    }
    default:
      return;
  }
}

type Reply = (messages: LineMessage[]) => Promise<void>;

/** Is the ledger usable for writing: its owner still on Ultimate? */
async function ownerState(db: SupabaseClient, group: GroupRow, now: Date) {
  const owner = await getOwner(db, group.ownerUserId);
  const writable =
    owner !== null &&
    can(
      effectivePlan(owner.plan as "free" | "plus" | "ultimate", owner.planExpiresAt, now),
      "groupLedger",
    );
  return { owner, writable };
}

async function runGroupCommand(
  command: GroupCommand,
  event: LineEvent,
  groupId: string,
  deps: HandlerDeps,
  reply: Reply,
): Promise<void> {
  const { db } = deps;
  const userId = event.source?.userId;
  const now = deps.now();

  if (command.kind === "help") return reply([text(GROUP_HELP_TEXT)]);

  if (command.kind === "open") {
    if (!userId) return reply([text(GROUP_NO_USER_TEXT)]);
    const user = await ensureUser(db, userId, () => deps.getProfile(userId));
    if (!can(effectivePlan(user.plan, user.plan_expires_at, now), "groupLedger")) {
      return reply([text(GROUP_LOCKED_TEXT)]);
    }
    const existing = await getGroup(db, groupId);
    if (existing?.isActive) {
      if (existing.ownerUserId === user.id) return reply([text(GROUP_ALREADY_OPEN_TEXT)]);
      // somebody else owns it: only when their Ultimate has run out may it change hands
      if ((await ownerState(db, existing, now)).writable)
        return reply([text(GROUP_OTHER_OWNER_TEXT)]);
    }
    if (
      existing?.ownerUserId !== user.id &&
      (await countOwnedGroups(db, user.id)) >= MAX_GROUPS_PER_OWNER
    ) {
      return reply([text(GROUP_TOO_MANY_TEXT)]);
    }
    await openGroup(db, groupId, user.id);
    return reply([text(GROUP_OPENED_TEXT)]);
  }

  const group = await getGroup(db, groupId);
  if (!group || !group.isActive) return reply([text(GROUP_NOT_OPEN_TEXT)]);
  const { owner, writable } = await ownerState(db, group, now);
  const isOwner = owner !== null && userId !== undefined && owner.lineUserId === userId;

  switch (command.kind) {
    case "close":
      if (!isOwner) return reply([text(GROUP_OWNER_ONLY_TEXT)]);
      await closeGroup(db, groupId);
      return reply([text(GROUP_CLOSED_TEXT)]);

    case "summary": {
      const range = command.scope === "today" ? dayRange(now) : calendarMonthRange(now);
      const [rows, names] = await Promise.all([
        payerTotals(db, group.id, range.from, range.to),
        memberNames(db, group.id),
      ]);
      const summary = summarizePayers(rows, new Map([...names].map(([id, v]) => [id, v.name])));
      if (summary.count === 0) return reply([text(GROUP_RECENT_EMPTY_TEXT)]);
      return reply([
        buildGroupSummaryCard({
          title: command.scope === "today" ? "สมุดกลุ่ม · วันนี้" : "สมุดกลุ่ม · เดือนนี้",
          subtitle: formatThaiDate(now),
          summary,
        }),
      ]);
    }

    case "recent": {
      const [entries, names] = await Promise.all([
        recentEntries(db, group.id, RECENT_COUNT),
        memberNames(db, group.id),
      ]);
      if (entries.length === 0) return reply([text(GROUP_RECENT_EMPTY_TEXT)]);
      const lines = entries.map(
        (e) =>
          `• ${e.title} ฿${formatBaht(e.amountSatang)} · ${names.get(e.payerLineUserId)?.name ?? NAME_FALLBACK}`,
      );
      return reply([text(["รายการล่าสุดของกลุ่ม", ...lines].join("\n"))]);
    }

    case "delete-last": {
      if (!userId) return reply([text(GROUP_NO_USER_TEXT)]);
      if (!writable) return reply([text(GROUP_PAUSED_TEXT)]);
      const [mine] = await recentEntries(db, group.id, 1, userId);
      if (!mine) return reply([text(GROUP_NOTHING_TO_DELETE_TEXT)]);
      await deleteEntry(db, group.id, mine.id);
      return reply([
        text(`${GROUP_DELETED_TEXT}: ${mine.title} ฿${formatBaht(mine.amountSatang)}`),
      ]);
    }

    case "record":
      return recordInGroup(command.body, userId, group, writable, deps, reply);

    default:
      return;
  }
}

/** "จด ข้าวเที่ยง 350": write the entries with the person who typed them as the payer. */
async function recordInGroup(
  body: string,
  userId: string | undefined,
  group: GroupRow,
  writable: boolean,
  deps: HandlerDeps,
  reply: Reply,
): Promise<void> {
  const { db } = deps;
  if (!userId) return reply([text(GROUP_NO_USER_TEXT)]);
  if (!writable) return reply([text(GROUP_PAUSED_TEXT)]);

  const { entries } = parseMessage(body, deps.now());
  if (entries.length === 0) return reply([text(GROUP_RECORD_USAGE_TEXT)]);
  if (entries.length > MAX_RECORDS_PER_MESSAGE) return reply([text(GROUP_TOO_MANY_ENTRIES_TEXT)]);
  if (entries.some((e) => e.type === "income")) return reply([text(GROUP_EXPENSE_ONLY_TEXT)]);

  const today = dayRange(deps.now());
  if (
    (await countEntriesSince(db, group.id, today.from)) + entries.length >
    MAX_GROUP_ENTRIES_PER_DAY
  ) {
    return reply([text(GROUP_DAY_FULL_TEXT)]);
  }

  const name = await knownName(db, group, userId, deps);
  const saved = await addEntries(
    db,
    group.id,
    userId,
    entries.map((e) => ({
      title: e.title,
      amountSatang: e.amountSatang,
      occurredAt: e.occurredAt,
      raw: e.raw,
    })),
  );

  if (saved.length === 1 && saved[0]) {
    const e = saved[0];
    return reply([
      {
        type: "text",
        text: `จดแล้ว: ${e.title} ฿${formatBaht(e.amountSatang)}\nจ่ายโดย ${name}`,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback",
                label: "↩ ยกเลิก",
                data: `a=gdx&id=${e.id}`,
                displayText: "ยกเลิก",
              },
            },
          ],
        },
      },
    ]);
  }
  const lines = saved.map((e) => `• ${e.title} ฿${formatBaht(e.amountSatang)}`);
  const total = saved.reduce((s, e) => s + e.amountSatang, 0);
  return reply([
    text(
      [
        `จดแล้ว ${saved.length} รายการ · จ่ายโดย ${name}`,
        ...lines,
        `รวม ฿${formatBaht(total)}`,
      ].join("\n"),
    ),
  ]);
}

/**
 * The name to show for a member: the saved one, refreshed from LINE when it is new or a week old.
 * A profile that cannot be read leaves a neutral name (the entry is still recorded to their id).
 */
async function knownName(
  db: SupabaseClient,
  group: GroupRow,
  userId: string,
  deps: HandlerDeps,
): Promise<string> {
  const names = await memberNames(db, group.id);
  const known = names.get(userId);
  if (known && Date.now() - new Date(known.updatedAt).getTime() < NAME_REFRESH_MS)
    return known.name;
  try {
    const profile = await deps.getGroupMemberProfile?.(group.lineGroupId, userId);
    const name = profile?.displayName?.trim() || known?.name || NAME_FALLBACK;
    await upsertMember(db, group.id, userId, name);
    return name;
  } catch (error) {
    log.error("group_profile_failed", error);
    return known?.name ?? NAME_FALLBACK;
  }
}

/** The "↩ ยกเลิก" under an entry: its writer or the owner of the ledger may remove it. */
async function handleGroupPostback(
  event: LineEvent,
  groupId: string,
  deps: HandlerDeps,
  reply: Reply,
): Promise<void> {
  const params = new URLSearchParams(event.postback?.data ?? "");
  if (params.get("a") !== "gdx") return;
  const userId = event.source?.userId;
  if (!userId) return reply([text(GROUP_NO_USER_TEXT)]);
  const { db } = deps;

  const group = await getGroup(db, groupId);
  if (!group || !group.isActive) return reply([text(GROUP_NOT_OPEN_TEXT)]);
  const { owner, writable } = await ownerState(db, group, deps.now());
  if (!writable) return reply([text(GROUP_PAUSED_TEXT)]);

  const entry = await getEntry(db, group.id, params.get("id") ?? "");
  if (!entry) return reply([text(GROUP_ENTRY_GONE_TEXT)]);
  const allowed = canDeleteEntry({
    entryPayer: entry.payerLineUserId,
    requester: userId,
    requesterIsOwner: owner !== null && owner.lineUserId === userId,
  });
  if (!allowed) return reply([text(GROUP_CANNOT_DELETE_TEXT)]);
  await deleteEntry(db, group.id, entry.id);
  return reply([text(`${GROUP_DELETED_TEXT}: ${entry.title} ฿${formatBaht(entry.amountSatang)}`)]);
}
