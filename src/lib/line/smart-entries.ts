import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmartEntry } from "@/lib/ai/text-structurer";
import { categorizeByRules, type CategoryLite, type MemoryLite } from "@/lib/categorize/rules";
import { insertTransaction, type UserRow } from "@/lib/repo";
import type { LineMessage } from "@/lib/types";
import { buildVoiceCard } from "./voice-flex";

/**
 * Save what the AI read as PENDING entries and return a check card for each. Nothing counts until
 * the person taps "จดเลย" (the same confirm step as a voice entry or a checked slip).
 */
export async function recordSmartEntries(input: {
  db: SupabaseClient;
  user: UserRow;
  entries: SmartEntry[];
  categories: CategoryLite[];
  memory: MemoryLite[];
  /** What the person wrote or said, kept as the entry's source text. */
  rawText: string;
  source: "text" | "voice";
}): Promise<LineMessage[]> {
  const cards: LineMessage[] = [];
  for (const entry of input.entries) {
    const named = entry.categoryName
      ? input.categories.find(
          (c) => c.type === entry.type && c.name === entry.categoryName && !c.is_hidden,
        )
      : undefined;
    const categoryId =
      named?.id ??
      categorizeByRules({
        title: entry.title,
        type: entry.type,
        categories: input.categories,
        memory: input.memory,
      }).categoryId;
    const tx = await insertTransaction(input.db, {
      userId: input.user.id,
      type: entry.type,
      title: entry.title,
      amountSatang: entry.amountSatang,
      categoryId,
      occurredAt: entry.occurredAt,
      status: "pending_confirm",
      rawText: input.rawText,
      source: input.source,
    });
    cards.push(
      buildVoiceCard({
        txId: tx.id,
        type: entry.type,
        title: entry.title,
        amountSatang: entry.amountSatang,
        categoryName: input.categories.find((c) => c.id === categoryId)?.name ?? null,
        occurredAt: entry.occurredAt,
        variant: input.source === "voice" ? "voice" : "ai",
      }),
    );
  }
  return cards;
}
