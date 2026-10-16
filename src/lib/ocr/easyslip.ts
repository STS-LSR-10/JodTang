import { z } from "zod";
import type { SlipImage, SlipOcrProvider } from "./provider";

const ENDPOINT = "https://api.easyslip.com/v2/verify/bank";
const MAX_BYTES = 4 * 1024 * 1024; // EasySlip's documented limit
const TIMEOUT_MS = 20_000;

const nameSchema = z
  .object({ th: z.string().nullish(), en: z.string().nullish() })
  .partial()
  .nullish();

const partySchema = z
  .object({
    bank: z.object({ name: z.string().nullish(), short: z.string().nullish() }).partial().nullish(),
    account: z.object({ name: nameSchema }).partial().nullish(),
  })
  .partial()
  .nullish();

const responseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      rawSlip: z
        .object({
          transRef: z.string().nullish(),
          date: z.string().nullish(),
          amount: z
            .union([
              z.number(),
              z.string(),
              z.object({ amount: z.union([z.number(), z.string()]) }),
            ])
            .nullish(),
          sender: partySchema,
          receiver: partySchema,
        })
        .partial(),
    })
    .partial()
    .nullish(),
  error: z.object({ code: z.string().optional() }).partial().nullish(),
});

/**
 * EasySlip v2 reads the slip's QR code and checks it with the bank, so the values are
 * authoritative (and fake slips are rejected). It only handles transfer slips with a readable QR;
 * anything else throws so the next reader in the chain gets a turn.
 *
 * Returns the same loose shape the AI readers return, so `sanitizeSlip` handles both.
 */
export function createEasySlipProvider(
  cfg: { apiKey: string },
  fetchImpl: typeof fetch = fetch,
): SlipOcrProvider {
  return {
    name: "easyslip",
    async extract(image: SlipImage) {
      if (image.bytes.byteLength > MAX_BYTES) throw new Error("easyslip skipped: image over 4MB");

      const form = new FormData();
      form.append(
        "image",
        new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
        "slip",
      );

      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const body = responseSchema.safeParse(await res.json().catch(() => null));
      if (!res.ok || !body.success || !body.data.success) {
        // status and error code only: never the payload
        const code = body.success ? (body.data.error?.code ?? "unknown") : "unparsable";
        throw new Error(`easyslip failed: ${res.status} ${code}`);
      }

      const slip = body.data.data?.rawSlip;
      if (!slip) throw new Error("easyslip failed: no slip data");
      const amount =
        typeof slip.amount === "object" && slip.amount ? slip.amount.amount : slip.amount;

      return {
        is_slip: true,
        kind: "transfer",
        amount: amount ?? null,
        paid_at: slip.date ?? null,
        payee_name: slip.receiver?.account?.name?.th ?? slip.receiver?.account?.name?.en ?? null,
        payee_bank: slip.receiver?.bank?.name ?? slip.receiver?.bank?.short ?? null,
        payee_account: null, // not requested: only the last 4 digits would ever be kept anyway
        payer_bank: slip.sender?.bank?.name ?? slip.sender?.bank?.short ?? null,
        reference: slip.transRef ?? null,
        memo: null,
      };
    },
  };
}
