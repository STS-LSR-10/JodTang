import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Real PostgreSQL (PGlite = Postgres compiled to WASM) with a thin Supabase look-alike:
 * the anon / authenticated / service_role roles, auth.uid(), the storage.buckets table, and the
 * default privileges Supabase gives those roles. Our own migrations run unmodified, except that
 * pgcrypto (not bundled with PGlite) is replaced by a tiny gen_random_bytes shim.
 */
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      coalesce(
        current_setting('request.jwt.claim.sub', true),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      ), ''
    )::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );

  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create function public.gen_random_bytes(n int) returns bytea language sql as $$
    select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
    from generate_series(1, n)
  $$;
`;

export const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      // pgcrypto is not available in PGlite; the shim above provides gen_random_bytes
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8").replace(
        /create extension if not exists pgcrypto;/gi,
        "",
      ),
    }));
}

export async function applyMigrations(db: PGlite): Promise<void> {
  for (const { name, sql } of migrationFiles()) {
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`migration ${name} failed: ${(error as Error).message}`);
    }
  }
}

export async function newDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  await applyMigrations(db);
  return db;
}

type Row = Record<string, unknown>;

export async function rows<T extends Row = Row>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T extends Row = Row>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const r = await rows<T>(db, sql, params);
  if (r.length !== 1) throw new Error(`expected 1 row, got ${r.length}: ${sql}`);
  return r[0] as T;
}

export async function newUser(db: PGlite, lineUserId: string): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    "insert into users (line_user_id, display_name) values ($1, $1) returning id",
    [lineUserId],
  );
  await db.query("insert into user_settings (user_id) values ($1)", [r.id]);
  return r.id;
}
