-- Shared wallets: a wallet that two (Professional) or more (Ultimate) people write into from their
-- own private chats with the bot, with one balance. Additive and idempotent.
--  * Only a NEW wallet is made shared (turning an existing one shared would show its old entries).
--  * An entry belongs to whoever wrote it (transactions.user_id) and points at the shared wallet
--    (account_id); a person's own summaries still count only their own entries.
--  * Transfers, debts and credit cards stay on private wallets for now.
--  * wallet_members / wallet_invites are server only (RLS on, no policies), like the group ledger.
alter table accounts add column if not exists is_shared boolean not null default false;
alter table accounts drop constraint if exists accounts_shared_ok;
alter table accounts add constraint accounts_shared_ok
  check (not is_shared or (not is_default and kind <> 'card'));

create table if not exists wallet_members (
  wallet_id uuid not null references accounts(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  role      text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);
create index if not exists wallet_members_user_idx on wallet_members (user_id);

-- A 6-digit code the owner gives to the other person, who types it in the chat with the bot.
create table if not exists wallet_invites (
  code       text primary key check (code ~ '^[0-9]{6}$'),
  wallet_id  uuid not null references accounts(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references users(id) on delete set null
);
create index if not exists wallet_invites_wallet_idx on wallet_invites (wallet_id);

alter table wallet_members enable row level security;
alter table wallet_invites enable row level security;

-- wallet_balances now also lists the shared wallets the person is on, and for those adds up the
-- entries of every member (not only the owner's). Everything else about a wallet is unchanged.
-- The return type changes, so the old function is dropped first.
drop function if exists wallet_balances(uuid);
create function wallet_balances(p_user uuid)
returns table (
  id uuid, name text, kind text, is_default boolean, opening_balance numeric,
  income numeric, expense numeric, tx_count bigint,
  transfer_in numeric, transfer_out numeric,
  credit_limit numeric, statement_day smallint, due_day smallint,
  debt_in numeric, debt_out numeric,
  is_shared boolean, owner_user_id uuid, member_count bigint
)
language sql stable security invoker as $$
  select
    a.id,
    a.name,
    a.kind::text,
    a.is_default,
    a.opening_balance,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(t.id),
    coalesce((
      select sum(x.amount) from transfers x
      where x.user_id = a.user_id and (x.to_account = a.id or (a.is_default and x.to_account is null))
    ), 0),
    coalesce((
      select sum(x.amount) from transfers x
      where x.user_id = a.user_id and (x.from_account = a.id or (a.is_default and x.from_account is null))
    ), 0),
    a.credit_limit,
    a.statement_day,
    a.due_day,
    coalesce((
      select sum(d.amount) from debts d
      where d.user_id = a.user_id and d.direction = 'borrowed'
        and (d.account_id = a.id or (a.is_default and d.account_id is null))
    ), 0) + coalesce((
      select sum(p.amount) from debt_payments p join debts d on d.id = p.debt_id
      where p.user_id = a.user_id and d.direction = 'lent'
        and (p.account_id = a.id or (a.is_default and p.account_id is null))
    ), 0),
    coalesce((
      select sum(d.amount) from debts d
      where d.user_id = a.user_id and d.direction = 'lent'
        and (d.account_id = a.id or (a.is_default and d.account_id is null))
    ), 0) + coalesce((
      select sum(p.amount) from debt_payments p join debts d on d.id = p.debt_id
      where p.user_id = a.user_id and d.direction = 'borrowed'
        and (p.account_id = a.id or (a.is_default and p.account_id is null))
    ), 0),
    a.is_shared,
    a.user_id,
    case when a.is_shared
      then (select count(*) from wallet_members m where m.wallet_id = a.id)
      else 1 end
  from accounts a
  left join transactions t
    on t.status = 'confirmed'
   and (
     -- a shared wallet: whoever wrote the entry
     (a.is_shared and t.account_id = a.id)
     -- a private wallet: only its owner's entries; no wallet means the main wallet
     or (not a.is_shared and t.user_id = a.user_id and (t.account_id = a.id or (a.is_default and t.account_id is null)))
   )
  where a.user_id = p_user
     or (a.is_shared and exists (
          select 1 from wallet_members m where m.wallet_id = a.id and m.user_id = p_user))
  group by a.id
  order by (a.user_id <> p_user), a.is_default desc, a.created_at, a.name;
$$;
