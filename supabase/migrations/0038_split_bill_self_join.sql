-- Friends can tap "ร่วมหารด้วย" while the payer is still choosing (a bill in 'setup'), not only on the
-- older 'joining' bills. Those who tapped are ticked in advance on the payer's people-picker page; when
-- the payer confirms (split_bill_confirm) the list is whatever the payer chose. Additive and idempotent.
create or replace function split_bill_join(p_bill uuid, p_user text)
returns text
language plpgsql security invoker as $$
declare st text; n int;
begin
  select status into st from split_bills where id = p_bill for update;
  if st is null or st not in ('setup', 'joining') then return 'closed'; end if;
  if exists (select 1 from split_bill_members where bill_id = p_bill and line_user_id = p_user) then
    return 'ok';
  end if;
  select count(*) into n from split_bill_members where bill_id = p_bill;
  if n >= 30 then return 'full'; end if;
  insert into split_bill_members (bill_id, line_user_id) values (p_bill, p_user);
  return 'ok';
end $$;

revoke execute on function split_bill_join(uuid, text) from public, anon, authenticated;
