-- "Start over": erase a person's financial history but keep their account, plan and set-up, or erase
-- one month. Done in the database in one step so it is all-or-nothing. Additive and idempotent.
--
-- What counts as erasable:
--   * their own entries (transactions) that are NOT in a shared wallet (those are visible to the
--     other people on the wallet, so a reset never touches them);
--   * with p_all: also their transfers, debts (and payments) and savings deposits;
--   * with a month (p_all = false): only entries and transfers dated in [p_from, p_to).
-- Slip rows of erased entries are scrubbed, not deleted: the image path, hash, reference and read
-- text go (so the same slip can be read again), while the row stays as a record that a slip was
-- read this month (the monthly slip quota counts those rows).

-- Entries a reset may remove.
create or replace function erasable_entry_ids(p_user uuid, p_from timestamptz, p_to timestamptz, p_all boolean)
returns table (id uuid)
language sql stable security invoker as $$
  select t.id
  from transactions t
  where t.user_id = p_user
    and not exists (select 1 from accounts a where a.id = t.account_id and a.is_shared)
    and (p_all or (t.occurred_at >= p_from and t.occurred_at < p_to));
$$;

-- Slips whose entries are being erased (with p_all, also slips no kept entry uses).
create or replace function erasable_slip_ids(p_user uuid, p_from timestamptz, p_to timestamptz, p_all boolean)
returns table (id uuid)
language sql stable security invoker as $$
  select s.id
  from slips s
  where s.user_id = p_user
    and (
      exists (select 1 from transactions t
              where t.slip_id = s.id and t.id in (select e.id from erasable_entry_ids(p_user, p_from, p_to, p_all) e))
      or (p_all and not exists (select 1 from transactions t where t.slip_id = s.id and t.user_id = p_user))
    );
$$;

-- Storage files to remove first: photos of erasable entries and the images of erasable slips.
create or replace function data_erase_paths(p_user uuid, p_from timestamptz, p_to timestamptz, p_all boolean)
returns table (path text)
language sql stable security invoker as $$
  select t.photo_path
  from transactions t
  where t.photo_path is not null and t.id in (select e.id from erasable_entry_ids(p_user, p_from, p_to, p_all) e)
  union
  select s.storage_path
  from slips s
  where s.storage_path <> '' and s.id in (select e.id from erasable_slip_ids(p_user, p_from, p_to, p_all) e);
$$;

-- How much a reset / month delete would remove (what the confirmation screen shows).
create or replace function data_erase_preview(p_user uuid, p_from timestamptz, p_to timestamptz, p_all boolean)
returns table (entries bigint, transfers bigint, debts bigint, goal_deposits bigint, files bigint, kept_shared bigint)
language sql stable security invoker as $$
  select
    (select count(*) from erasable_entry_ids(p_user, p_from, p_to, p_all)),
    (select count(*) from transfers x where x.user_id = p_user and (p_all or (x.occurred_at >= p_from and x.occurred_at < p_to))),
    case when p_all then (select count(*) from debts d where d.user_id = p_user) else 0::bigint end,
    case when p_all then (select count(*) from savings_deposits g where g.user_id = p_user) else 0::bigint end,
    (select count(*) from data_erase_paths(p_user, p_from, p_to, p_all)),
    (select count(*) from transactions t
       where t.user_id = p_user
         and exists (select 1 from accounts a where a.id = t.account_id and a.is_shared)
         and (p_all or (t.occurred_at >= p_from and t.occurred_at < p_to)));
$$;

-- Erase. With p_keep_balance (only meaningful with p_all) each private wallet's current balance
-- becomes its new opening balance first, so the money in it stays the same.
create or replace function data_erase(
  p_user uuid, p_from timestamptz, p_to timestamptz, p_all boolean, p_keep_balance boolean
)
returns table (entries bigint, transfers bigint, debts bigint, goal_deposits bigint)
language plpgsql security invoker as $$
declare
  e_ids uuid[];
  s_ids uuid[];
  n_entries bigint := 0;
  n_transfers bigint := 0;
  n_debts bigint := 0;
  n_deposits bigint := 0;
begin
  select coalesce(array_agg(x.id), '{}') into e_ids from erasable_entry_ids(p_user, p_from, p_to, p_all) x;
  select coalesce(array_agg(x.id), '{}') into s_ids from erasable_slip_ids(p_user, p_from, p_to, p_all) x;

  if p_all and p_keep_balance then
    update accounts a
       set opening_balance = b.opening_balance + b.income - b.expense
                             + b.transfer_in - b.transfer_out + b.debt_in - b.debt_out
      from wallet_balances(p_user) b
     where a.id = b.id and a.user_id = p_user and not a.is_shared;
  end if;

  update slips
     set storage_path = '', image_sha256 = 'erased:' || id::text, slip_ref = null,
         ocr_json = null, amount = null, payee = null, bank = null, paid_at = null
   where id = any (s_ids);

  delete from transactions where id = any (e_ids);
  get diagnostics n_entries = row_count;

  delete from transfers x
   where x.user_id = p_user and (p_all or (x.occurred_at >= p_from and x.occurred_at < p_to));
  get diagnostics n_transfers = row_count;

  if p_all then
    delete from debts where user_id = p_user;
    get diagnostics n_debts = row_count;
    delete from savings_deposits where user_id = p_user;
    get diagnostics n_deposits = row_count;
  end if;

  return query select n_entries, n_transfers, n_debts, n_deposits;
end;
$$;

-- Months (Bangkok calendar) that have something to delete, newest first.
create or replace function months_with_data(p_user uuid)
returns table (month text, entries bigint, transfers bigint)
language sql stable security invoker as $$
  select m.month, coalesce(sum(m.e), 0)::bigint, coalesce(sum(m.t), 0)::bigint
  from (
    select to_char(t.occurred_at at time zone 'Asia/Bangkok', 'YYYY-MM') as month, 1 as e, 0 as t
    from transactions t
    where t.id in (select x.id from erasable_entry_ids(p_user, null, null, true) x)
    union all
    select to_char(x.occurred_at at time zone 'Asia/Bangkok', 'YYYY-MM'), 0, 1
    from transfers x where x.user_id = p_user
  ) m
  group by m.month
  order by m.month desc;
$$;
