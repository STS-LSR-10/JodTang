-- RLS / permission smoke test. Run it in the Supabase SQL Editor (as the default `postgres` role).
--
--   * It creates two throw-away users and checks, from each user's point of view, that
--     nobody can see or change somebody else's rows and that nobody can upgrade their own plan.
--   * It is ONE statement (a single DO block), so it behaves the same whether the editor wraps
--     the script in a transaction or runs statements one by one. All test data lives in an
--     inner sub-transaction that is rolled back on purpose: nothing is kept, pass or fail.
--
-- Result:
--   * PASS -> the script finishes and the last query shows:  result = "RLS checks passed"
--   * FAIL -> an error that names the table or check that is wrong (and nothing is kept)
--
-- Re-run it after every migration that adds a table or policy.

do $$
declare
  ua uuid; ub uuid; tb uuid;
  t text; leaked bigint; n bigint; denied boolean;
begin
  begin -- sub-transaction: everything inside is undone by the final RAISE below

    -- 1) every table in `public` must have row level security switched on
    for t in
      select tablename from pg_tables where schemaname = 'public' and not rowsecurity
    loop
      raise exception 'RLS is DISABLED on public.%', t;
    end loop;

    -- 2) two users, each with some data (inserted as postgres, which bypasses RLS)
    insert into users (line_user_id, display_name) values ('rls-test-a', 'A') returning id into ua;
    insert into users (line_user_id, display_name) values ('rls-test-b', 'B') returning id into ub;
    insert into user_settings (user_id) values (ua), (ub);
    insert into transactions (user_id, type, amount, title) values (ua, 'expense', 10, 'a-secret');
    insert into transactions (user_id, type, amount, title) values (ub, 'expense', 20, 'b-secret')
      returning id into tb;
    insert into budgets (user_id, amount) values (ub, 100);
    insert into point_ledger (user_id, delta, reason) values (ub, 1, 'daily');

    -- 3) act as user A (a signed-in Supabase user whose JWT subject is A)
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- A sees their own transaction but none of B's
    select count(*) into n from transactions where title = 'a-secret';
    if n <> 1 then raise exception 'A cannot read their own transaction (got %)', n; end if;
    select count(*) into n from transactions where title = 'b-secret';
    if n <> 0 then raise exception 'A can READ another user''s transaction'; end if;

    -- no table with a user_id column may expose rows of anyone else
    for t in
      select c.table_name from information_schema.columns c
      join information_schema.tables tt
        on tt.table_schema = c.table_schema and tt.table_name = c.table_name and tt.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'user_id'
    loop
      execute format(
        'select count(*) from public.%I where user_id is not null and user_id <> %L', t, ua
      ) into leaked;
      if leaked <> 0 then raise exception 'table public.% leaks % row(s) of other users', t, leaked; end if;
    end loop;

    -- A cannot change or delete B's data
    update transactions set title = 'hacked' where id = tb;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A can UPDATE another user''s transaction'; end if;
    delete from transactions where id = tb;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A can DELETE another user''s transaction'; end if;

    -- A cannot write rows on behalf of B
    denied := false;
    begin
      insert into transactions (user_id, type, amount, title) values (ub, 'expense', 1, 'forged');
    exception when others then denied := true;
    end;
    if not denied then raise exception 'A can INSERT a transaction for another user'; end if;

    -- A cannot upgrade their own plan or hand themselves points (server-only columns)
    update users set plan = 'plus', points = 999 where id = ua;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A can UPDATE their own users row (plan / points)'; end if;

    -- A cannot call the server-only functions
    denied := false;
    begin
      perform award_points(ua, 100, 'cheat', null);
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'A can call award_points()'; end if;

    denied := false;
    begin
      perform redeem_points(ua, 1, 1);
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'A can call redeem_points()'; end if;

    denied := false;
    begin
      perform check_rate_limit('x', 1, 60);
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'A can call check_rate_limit()'; end if;

    -- server-only tables stay invisible
    select count(*) into n from line_events;
    if n <> 0 then raise exception 'A can read line_events'; end if;
    select count(*) into n from rate_limits;
    if n <> 0 then raise exception 'A can read rate_limits'; end if;

    reset role;

    -- 4) anonymous visitors (anon key, no login) get nothing
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from transactions;
    if n <> 0 then raise exception 'anon can read transactions'; end if;
    select count(*) into n from users;
    if n <> 0 then raise exception 'anon can read users'; end if;
    reset role;

    -- all checks passed: abort the sub-transaction on purpose so the test data is discarded
    raise exception '__RLS_CHECKS_PASSED__' using errcode = 'P0001';

  exception when others then
    if sqlerrm <> '__RLS_CHECKS_PASSED__' then
      raise; -- a real failure: re-raise the original error (data is rolled back as well)
    end if;
  end;
end $$;

-- Only reached when the block above did not raise, i.e. every check passed.
select 'RLS checks passed' as result;
