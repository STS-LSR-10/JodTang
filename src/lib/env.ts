import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_LIFF_ID: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
});

const serverSchema = z.object({
  LINE_CHANNEL_ID: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(1),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  SESSION_JWT_SECRET: z.string().min(32, "SESSION_JWT_SECRET must be at least 32 chars"),
  CRON_SECRET: z.string().min(1),
});

type EnvSource = Record<string, string | undefined>;

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function parse<T extends z.ZodTypeAny>(schema: T, source: EnvSource, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid ${label} environment variables: ${keys}`);
  }
  return result.data;
}

/** Safe on client and server. */
export function getPublicEnv(source: EnvSource = process.env): PublicEnv {
  return parse(publicSchema, source, "public");
}

/** Server only. Never import this from client components. */
export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must not be called in the browser");
  }
  return parse(serverSchema, source, "server");
}
