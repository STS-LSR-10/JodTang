import type { SlipImage } from "@/lib/ocr/provider";

const API_DATA = "https://api-data.line.me/v2/bot";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ImageError extends Error {
  constructor(
    readonly reason: "too_large" | "unsupported" | "download_failed",
    message: string,
  ) {
    super(message);
  }
}

/** Download an image message's content from LINE (status only in errors, never the payload). */
export async function fetchLineImage(
  accessToken: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SlipImage> {
  const res = await fetchImpl(`${API_DATA}/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ImageError("download_failed", `LINE content failed: ${res.status}`);

  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  if (!ALLOWED.has(mimeType)) throw new ImageError("unsupported", "unsupported image type");

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new ImageError("too_large", "image too large");

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageError("too_large", "image too large");
  return { bytes, mimeType };
}

export function extensionFor(mimeType: string): string {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_MS = 30_000;

/** Download a voice message's audio from LINE (status only in errors, never the payload). */
export async function fetchLineAudio(
  accessToken: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const res = await fetchImpl(`${API_DATA}/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ImageError("download_failed", `LINE content failed: ${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_AUDIO_BYTES) throw new ImageError("too_large", "audio too large");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new ImageError("too_large", "audio too large");
  if (bytes.byteLength === 0) throw new ImageError("download_failed", "empty audio");
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  return { bytes, mimeType };
}
