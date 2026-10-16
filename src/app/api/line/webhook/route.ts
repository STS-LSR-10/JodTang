import { after } from "next/server";
import { getServerEnv } from "@/lib/env";
import { processEvents } from "@/lib/line/process";
import { verifySignature } from "@/lib/line/signature";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Room for DB writes + replies after the 200 has been sent.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  // The signature is computed over the raw body, so read it as text first.
  const rawBody = await request.text();

  let secret: string;
  try {
    secret = getServerEnv().LINE_CHANNEL_SECRET;
  } catch (error) {
    // The message lists variable NAMES only (never values), so it is safe to log.
    log.error("webhook_config_error", error);
    return new Response("server misconfigured", { status: 500 });
  }

  if (!verifySignature(rawBody, request.headers.get("x-line-signature"), secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let events: unknown[] = [];
  try {
    const body = JSON.parse(rawBody) as { events?: unknown };
    if (Array.isArray(body.events)) events = body.events;
  } catch {
    return new Response("invalid body", { status: 400 });
  }

  // Answer 200 right away; LINE retries on slow responses.
  if (events.length > 0) after(() => processEvents(events));
  return new Response("ok", { status: 200 });
}
