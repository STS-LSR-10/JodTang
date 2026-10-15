-- System default categories (user_id null). icon = Lucide icon name.

insert into categories (user_id, type, name, icon, color, keywords, sort_order) values
  (null, 'expense', 'อาหาร',        'utensils',        '#0F766E', '{ข้าว,กาแฟ,อาหาร,ก๋วยเตี๋ยว,ชา,ขนม,น้ำ,ส้มตำ,หมูกระทะ,กับข้าว,เครื่องดื่ม,ร้านอาหาร}', 1),
  (null, 'expense', 'เดินทาง',      'bus',             '#0369A1', '{น้ำมัน,รถเมล์,bts,mrt,แท็กซี่,taxi,grab,วิน,ทางด่วน,ที่จอดรถ,ค่ารถ,รถไฟ}', 2),
  (null, 'expense', 'ที่พัก',        'home',            '#7C3AED', '{ค่าเช่า,ค่าห้อง,หอ,คอนโด,ค่าส่วนกลาง}', 3),
  (null, 'expense', 'ค่าโทรศัพท์',   'smartphone',      '#0891B2', '{ค่าโทร,เน็ต,อินเทอร์เน็ต,ais,true,dtac,เติมเงิน,ซิม}', 4),
  (null, 'expense', 'ช้อปปิ้ง',      'shopping-bag',    '#DB2777', '{เสื้อ,กางเกง,รองเท้า,shopee,lazada,ช้อป,ซื้อของ,ของใช้}', 5),
  (null, 'expense', 'สุขภาพ',       'heart-pulse',     '#E11D48', '{หมอ,ยา,โรงพยาบาล,คลินิก,ฟิตเนส,ทำฟัน,วิตามิน}', 6),
  (null, 'expense', 'บันเทิง',      'popcorn',         '#D97706', '{หนัง,เกม,netflix,spotify,คอนเสิร์ต,เที่ยว,ปาร์ตี้}', 7),
  (null, 'expense', 'การศึกษา',     'graduation-cap',  '#4F46E5', '{ค่าเทอม,คอร์ส,หนังสือ,เรียน,ติว,อบรม}', 8),
  (null, 'expense', 'ค่าน้ำ-ไฟ',     'zap',             '#CA8A04', '{ค่าน้ำ,ค่าไฟ,ประปา,ไฟฟ้า,การไฟฟ้า}', 9),
  (null, 'expense', 'ผ่อน/หนี้',     'credit-card',     '#475569', '{ผ่อน,หนี้,บัตรเครดิต,ดอกเบี้ยจ่าย,งวด,กยศ}', 10),
  (null, 'expense', 'ออม/ลงทุน',    'piggy-bank',      '#059669', '{ออม,ลงทุน,กองทุน,หุ้น,ฝากประจำ,ทอง}', 11),
  (null, 'expense', 'อื่นๆ',         'ellipsis',        '#64748B', '{}', 99),
  (null, 'income',  'เงินเดือน',     'wallet',          '#059669', '{เงินเดือน,salary,โบนัส}', 1),
  (null, 'income',  'ธุรกิจส่วนตัว',  'store',           '#0F766E', '{กำไร,รายได้ร้าน,ธุรกิจ}', 2),
  (null, 'income',  'งานพิเศษ',      'briefcase',       '#0369A1', '{งานพิเศษ,ฟรีแลนซ์,freelance,รับจ้าง,พาร์ทไทม์}', 3),
  (null, 'income',  'ค่าคอมมิชชั่น',  'badge-percent',   '#7C3AED', '{ค่าคอม,คอมมิชชั่น,commission}', 4),
  (null, 'income',  'ขายของ',        'package',         '#D97706', '{ขายของ,ขาย,ค่าสินค้า}', 5),
  (null, 'income',  'ปันผล/ดอกเบี้ย', 'trending-up',     '#0891B2', '{ปันผล,ดอกเบี้ย,dividend}', 6),
  (null, 'income',  'อื่นๆ',          'ellipsis',        '#64748B', '{}', 99)
on conflict (type, name) where user_id is null do nothing;

-- ───── summary_by_period ─────
-- security invoker: RLS applies when called as a user; service role passes p_user explicitly.
create or replace function summary_by_period(
  p_user uuid, p_from timestamptz, p_to timestamptz
) returns table (income numeric, expense numeric, balance numeric, tx_count bigint)
language sql stable security invoker as $$
  select
    coalesce(sum(amount) filter (where type = 'income'), 0),
    coalesce(sum(amount) filter (where type = 'expense'), 0),
    coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type = 'expense'), 0),
    count(*)
  from transactions
  where user_id = p_user
    and status = 'confirmed'
    and occurred_at >= p_from
    and occurred_at <  p_to;
$$;

-- ───── spend_by_category ─────
create or replace function spend_by_category(
  p_user uuid, p_from timestamptz, p_to timestamptz, p_type tx_type default 'expense'
) returns table (category_id uuid, name text, icon text, color text, total numeric, tx_count bigint)
language sql stable security invoker as $$
  select
    c.id,
    coalesce(c.name, 'ไม่ระบุหมวด'),
    c.icon,
    c.color,
    sum(t.amount),
    count(*)
  from transactions t
  left join categories c on c.id = t.category_id
  where t.user_id = p_user
    and t.status = 'confirmed'
    and t.type = p_type
    and t.occurred_at >= p_from
    and t.occurred_at <  p_to
  group by c.id, c.name, c.icon, c.color
  order by sum(t.amount) desc;
$$;
