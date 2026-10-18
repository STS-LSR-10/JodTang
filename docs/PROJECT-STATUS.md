# จดตังค์ (JodTang) — สถานะโปรเจกต์และคู่มือส่งต่องาน

อัปเดตล่าสุด: 2026-10-17 · สถานะ: **ระบบทำงานบนบัญชีใหม่ทั้งหมด (Stripe ยังเป็น Test mode)** · ฟีเจอร์ที่ทำล่าสุด: จดด้วยเสียง
· ถัดไป: เจ้าของขอหยุดเพิ่มฟีเจอร์ก่อน → ทดสอบจริง → เปิด Stripe Live เป็นขั้นสุดท้าย

เอกสารนี้ไว้ให้เซสชันใหม่ (หรือคนใหม่) อ่านแล้วทำต่อได้ทันที **ไม่มีความลับใด ๆ อยู่ในไฟล์นี้**
ค่า secret ทั้งหมดอยู่ใน Vercel Environment Variables และ `.env.local` (ไม่ถูก commit)

---

## 1) ผลิตภัณฑ์ในประโยคเดียว

ผู้ช่วยจดรายรับรายจ่ายผ่าน **LINE Official Account**: พิมพ์ข้อความ (`กาแฟ 30`), ส่งสลิป หรือส่งข้อความเสียง
ระบบจดและจัดหมวดให้ แล้วดูสรุป/กราฟ/งบ/รายการในหน้า **LIFF** (เว็บในแอป LINE)

- ชื่อ: จดตังค์ (JodTang) · แท็กไลน์ "จดง่าย เห็นเงินชัด" · โลโก้ `public/logo.svg` (+ `public/logo.png` สำหรับการ์ด LINE)
- ภาษา UI/บอท: ไทย · สกุลเงิน THB · timezone Asia/Bangkok · แสดงปี พ.ศ. · DB เก็บเวลาเป็น UTC

## 2) บัญชีและโครงสร้างพื้นฐาน (หลังย้ายบัญชีเมื่อ 2026-10-17)

| ส่วน | ที่อยู่ |
|---|---|
| โค้ด | GitHub `STS-LSR-10/JodTang` (private) branch `main` · remote `origin` = repo ใหม่, `old-origin` = repo เก่า (ไม่ใช้แล้ว) |
| เว็บ + API | Vercel (บัญชีใหม่) โดเมนผลิต **`https://jodtang-th.vercel.app`** · deploy อัตโนมัติจาก push |
| ฐานข้อมูล | Supabase โปรเจกต์ใหม่ (Singapore) เริ่มข้อมูลใหม่ ไม่ได้คัดลอกข้อมูลจากของเก่า |
| LINE | ช่อง Messaging API + LINE Login (LIFF) **ใช้ช่องเดิม** ไม่ได้ย้าย · Webhook และ LIFF Endpoint ชี้โดเมนใหม่แล้ว |
| ชำระเงิน | Stripe **Sandbox (Test mode)** ชื่อ JodTang · Live ยังไม่เปิด |
| Cron | Vercel Cron (รายวัน: จดประจำ) + GitHub Actions `cron.yml` (รายชั่วโมง: เตือนจดประจำวัน + สรุปอัตโนมัติ) ต้องมี secrets `APP_BASE_URL`, `CRON_SECRET` ใน repo ใหม่ (ตั้งแล้ว) |

ข้อมูลในระบบตอนนี้เป็น **ข้อมูลทดสอบของเจ้าของเท่านั้น** ยังไม่มีผู้ใช้จริง

## 3) ข้อกำหนดที่ต้องยึด (สำคัญ)

**แบรนด์/ลิขสิทธิ์** — ออกแบบใหม่ทั้งหมด ห้ามลอกบอทจดบัญชีเจ้าอื่น
- ห้ามใช้ชื่อ/มาสคอต/ข้อความโปรโมตของแบรนด์อื่น (เจ้าของเคยแนบตัวอย่างแอปอื่นให้ดูเป็นแนวทาง ให้ออกแบบเองเสมอ)
- ภาพ/ไอคอนต้องเป็น SVG ที่สร้างเอง หรือ Lucide เท่านั้น

**เงิน** — ใช้ integer สตางค์ (`src/lib/money.ts`) ห้ามใช้ float บวกลบ · DB เป็น `numeric(14,2)` · ราคาแผนเป็นบาทเต็มใน `src/lib/pricing.ts`

**ความปลอดภัย**
- `user_id` มาจาก session ที่ตรวจแล้วเท่านั้น ห้ามรับจาก client
- `SUPABASE_SERVICE_ROLE_KEY` และ Stripe key ใช้ฝั่ง server เท่านั้น · ฟังก์ชัน SQL ที่เปลี่ยนแผน/ยอด เรียกได้เฉพาะ service role
- ห้ามเก็บเลขบัญชีเต็ม (4 ตัวท้ายเท่านั้น) · bucket สลิป private + signed URL · **ไม่เก็บไฟล์เสียง**
- log ต้องไม่มีข้อมูลส่วนบุคคล (ใช้ `src/lib/log.ts` ไม่ใช้ `console.*`)
- ห้ามกรอก/ถามรหัสผ่านและ secret ในแชท เจ้าของใส่ค่าลับใน Vercel เอง

## 4) แผนและราคา

ชื่อที่ผู้ใช้เห็น: **Free / Professional / Ultimate** · id ในโค้ด/DB: `free` / `plus` / `ultimate` (`plus` = Professional ไม่ต้อง migrate ข้อมูล) · ชื่อและสิทธิ์เช็คจาก `src/lib/plan.ts` ที่เดียว

| แผน | รายเดือน | รายปี |
|---|---|---|
| Free | ฿0 | — |
| Professional | ฿59 | ฿299 |
| Ultimate | ฿139 | ฿799 |

- Free: จดข้อความไม่จำกัด (อ่านสลิปไม่ได้)
- Professional ขึ้นไป: แนบรูปประกอบรายการ (ปุ่ม "📷 แนบรูป" บนการ์ดจดสำเร็จ → ส่งรูปภายใน 10 นาที เก็บใน bucket `slips` ไม่ผ่าน OCR ไม่นับโควตาสลิป เพดาน 100 รูป/เดือน `PHOTOS_PER_MONTH`), ติดแท็ก `#คำ` (เช่น `หมูกระทะ 500 #ปาร์ตี้` — Free พิมพ์แล้วบอทไม่จดและชวนอัปเกรด ค้นหา/กรองด้วยแท็กในหน้ารายการ), จดย้อนหลังด้วยปฏิทิน (ปุ่ม "📅 จดย้อนหลัง" ใต้การ์ดจดตังค์ → เลือกวัน → คีย์บอร์ดเติม `DD/MM/YYYY ` ให้ พิมพ์แค่รายการ ไม่เก็บสถานะ), จดหลายรายการในข้อความเดียว (Free ส่งหลายบรรทัดแล้วบอทไม่จดและชวนอัปเกรด), จดย้อนหลัง (เช่น "เมื่อวาน กาแฟ 60" — Free พิมพ์แล้วบอทไม่จดและชวนอัปเกรด), อ่านสลิป 5 ใบ/เดือน (Ultimate ไม่จำกัด), จดประจำ (20 รายการ), เตือนจดประจำวัน, สรุปอัตโนมัติในแชท, จำผู้รับ→หมวด, Excel สรุป, กราฟเก็บออม
- Ultimate: ได้ทุกอย่างของ Professional + อ่านสลิปไม่จำกัด + **แยกรายการจากใบเสร็จ** (ส่งรูปใบเสร็จ → การ์ดโชว์รายการสินค้า → ปุ่ม "แยก n รายการ" สร้างรายการละสินค้า ส่วนต่างภาษี/ค่าบริการเป็นอีกรายการ ไม่มี migration เก็บรายการใน `slips.ocr_json.items`) + **พิมพ์ประโยคยาวๆ ให้ AI ช่วยอ่าน** (ข้อความยาวเกิน 40 ตัวอักษรต่อส่วน/อ่านไม่ออก/ไม่แน่ใจ → AI แยกเป็นรายการแล้ว **ถามยืนยันก่อนจดเสมอ**; ข้อความสั้นไม่เรียก AI; ล้ม/ไม่มี key/เกิน 60 ครั้งต่อวัน → ใช้กติกาเดิม; ยังไม่แยกกระเป๋าเงิน) + **จดด้วยเสียง** (เฉพาะ Ultimate; ประโยคยาวจากเสียงใช้ AI ตัวเดียวกัน) · ที่โชว์ "เร็วๆ นี้" = จดในกลุ่ม/หลายบัญชี, จดด้วย PDF, แนบสลิป/หลักฐาน, จดประจำ 100 รายการ
- **ทดลองฟรี 7 วัน** (`TRIAL_DAYS`): Professional 1 ครั้ง และ Ultimate 1 ครั้งต่อคน ไม่ต้องใช้บัตร เริ่มได้เฉพาะตอนที่ยังไม่มีแผนใช้งาน
- ตังสะสม: +1 แต้ม/วันที่จด, 10 แต้ม = 1 วัน Professional, ชวนเพื่อน +10 ทั้งสองฝ่าย (`src/lib/config.ts`)

## 5) ระบบชำระเงิน (Stripe)

โค้ดอยู่ใน `src/lib/payments/` · คู่มือตั้งค่าและกฎทั้งหมดอยู่ใน **`docs/DEPLOY.md` หัวข้อ 5.2**
- **บัตร** (ในประเทศ+ต่างประเทศ) = Stripe Billing subscription ต่ออายุอัตโนมัติ · **พร้อมเพย์** = จ่ายครั้งเดียวต่อรอบ (ตัดซ้ำอัตโนมัติไม่ได้)
- ปุ่ม "จัดการการชำระเงิน" เปิด Stripe Billing portal (ต้อง Activate ใน Dashboard ของแต่ละบัญชี/โหมด)
- Webhook `POST /api/stripe/webhook` ตรวจลายเซ็น ทุกขั้นกันซ้ำได้ (idempotent) 5 อีเวนต์: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `invoice.paid`
- กฎกันจ่ายซ้อน/ลดแผน: `src/lib/payments/policy.ts` (ใช้ทั้งฝั่ง server และหน้าอัปเกรด)
  - มีบัตรที่ยังทำงาน → อัปเกรดแผนสูงขึ้น หรือรายเดือน→รายปี = เปลี่ยน subscription เดิม Stripe คิดเฉพาะส่วนต่าง (`proration_behavior=always_invoice`) ลดแผน/รายปี→รายเดือนกลางรอบไม่ได้
  - มีเวลาพร้อมเพย์เหลือ → ต่อเวลาเต็มราคาได้ หรือ **อัปเกรดส่วนที่เหลือจ่ายเฉพาะส่วนต่าง** (วันหมดอายุไม่เปลี่ยน คำนวณที่ server, ขั้นต่ำ ฿10) ห้ามผสมกับบัตร
- ช่องทางที่ขึ้นในหน้าจ่ายเงินกำหนดที่ Stripe Dashboard → Payment methods (API เวอร์ชันใหม่ไม่รับ `payment_method_types`)
- ไม่มีคืนเงินอัตโนมัติ: คืนเงินใน Stripe เองแล้วลด `plan_expires_at` ด้วยมือ

## 6) ตัวแปร environment (ชื่อเท่านั้น ไม่มีค่า)

Vercel (Production) · ตัวที่ขึ้นต้น `NEXT_PUBLIC_*` และ `APP_BASE_URL` **ห้ามติ๊ก Sensitive**
- LINE: `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- ระบบ: `SESSION_JWT_SECRET` (≥ 32 ตัว), `CRON_SECRET`, `APP_BASE_URL` (`https://…` ไม่มี `/` ท้าย), `NEXT_PUBLIC_CONTACT_EMAIL`
- AI: `AI_PROVIDER` (`gemini` ค่าเริ่มต้น | `anthropic` | `openai` — **ต้องไม่ว่าง**) + key ของค่ายที่เลือก (`GEMINI_API_KEY` …), ตัวเสริม `AI_MODEL`, `EASYSLIP_API_KEY`, `SLIP_READERS` (อย่าสร้างตัวแปรเสริมแบบค่าว่าง)
- Stripe: `STRIPE_SECRET_KEY` (`sk_test_`/`sk_live_`), `STRIPE_WEBHOOK_SECRET` (`whsec_`) — ถ้าไม่ตั้ง ปุ่มชำระเงินตอบ "ยังไม่เปิดให้ชำระเงิน"

## 7) ฐานข้อมูล: migrations `supabase/migrations/0001…0015` (รันตามลำดับ รันซ้ำได้)

| ไฟล์ | ทำอะไร |
|---|---|
| 0001–0003 | schema, RLS, seed หมวด + ฟังก์ชัน |
| 0004 | โหมดงบ, `category_overrides`, RPC `analytics_series` |
| 0005 | bucket `slips` (private) |
| 0006 | ตังสะสม/ชวนเพื่อน/แลกวัน/เตือน (ฟังก์ชัน service-role เท่านั้น) |
| 0007 | rate limit (Postgres) |
| 0008 | enum แผน `ultimate` |
| 0009 | ตาราง `payments`, คอลัมน์ Stripe บน `users`, `apply_prepaid_purchase`, `set_plan_until`, `record_payment` |
| 0010 | `users.billing_period` + `set_plan_until` รุ่นมีรอบบิล |
| 0011 | `plan_trials` + `start_plan_trial`, `payments.kind`, `apply_prepaid_upgrade` |
| 0012 | คอลัมน์สรุปอัตโนมัติใน `user_settings` |
| 0013 | `tx_source` เพิ่มค่า `voice` |
| 0014 | `transactions.tags text[]` + ดัชนี GIN (แท็ก #Tag) |
| 0015 | `transactions.photo_path/photo_at` + ตาราง `photo_waits` (รอรูปแนบ, เฉพาะ server) |

- **ทุกครั้งที่เพิ่ม migration: รันใน Supabase SQL Editor ก่อน push** (โค้ดใหม่อ้างคอลัมน์/ฟังก์ชันใหม่ ถ้ายังไม่รันบางหน้าจะ 500)
- โปรเจกต์ใหม่: ใช้ไฟล์รวม `supabase/_all-migrations.sql` (สร้างจาก migrations, ไม่ถูก commit — สร้างใหม่ด้วยการต่อไฟล์ตามลำดับ) แล้วรัน `supabase/tests/rls_check.sql` ต้องได้ `RLS checks passed`

## 8) ฟีเจอร์และสถานะ

| ฟีเจอร์ | สถานะ |
|---|---|
| จดข้อความ + parser (ตัดสินรายรับ/รายจ่ายจากคำสัญญาณที่มาก่อน เช่น ได้/รับ vs ซื้อ/จ่าย), หมวดอัตโนมัติ, การ์ด "จดสำเร็จ" | ✅ |
| อ่านสลิป (EasySlip → AI) + การ์ดตรวจ, โควตา Free 0 / Professional 5 / Ultimate ไม่จำกัด | ✅ ยังไม่เคยทดสอบกับสลิปจริงครบทุกค่าย |
| หน้า LIFF: สรุป/วิเคราะห์/หมวด-งบ/รายการ/ตั้งค่า/อัปเกรด | ✅ |
| แก้ไขรายการ (PATCH) + เลือกหลายรายการลบ/ย้ายหมวด (`/api/transactions/bulk`) | ✅ |
| Rich Menu 9 ช่อง (ช่อง "อัปเกรด" แทนสแกนสลิป; "จดตังค์" ตอบการ์ดวิธีพิมพ์) | ✅ ลิงก์ผูก LIFF ID จึงไม่ต้องสร้างใหม่เมื่อเปลี่ยนโดเมน |
| ปุ่มเลือกหมวดจาก Rich Menu "จดตังค์" (Quick Reply เติมชื่อหมวดในช่องพิมพ์ ไม่เก็บสถานะ) + ข้อความที่ขึ้นต้นด้วยชื่อหมวดเข้าหมวดและประเภทนั้นทันที | ✅ **ยังไม่ได้ลองบนมือถือจริง** (LINE ตรวจรูปแบบข้อความผ่านแล้ว แต่ต้องดูว่าแอปเติมข้อความให้จริง) |
| จดประจำ, เตือนจดประจำวัน, ส่งออก CSV/XLSX, ตังสะสม, ชวนเพื่อน | ✅ |
| หน้าอัปเกรด 3 แผน + เปรียบเทียบ + Stripe + ทดลองฟรี + อัปเกรดจ่ายส่วนต่าง | ✅ ทดสอบใน Test mode |
| สรุปอัตโนมัติรายสัปดาห์ (จันทร์ 09:00) / รายเดือน (วันเริ่มรอบงบ 09:00) ส่งในแชท (Professional+, ปิดไว้เป็นค่าเริ่มต้น) | ✅ **ยังไม่ได้ลองส่งจริง** |
| จดด้วยเสียง (เฉพาะ Ultimate): ถอดด้วย Gemini/OpenAI → **ถามยืนยันก่อนจดเสมอ** (จดเลย/เปลี่ยนหมวด/ยกเลิก) | ✅ **ยังไม่ได้ลองถอดเสียงจริง** (ส่งเสียง m4a ของ LINE ไป Gemini เป็น `audio/mp4` — ถ้าพังดู log `voice_transcribe_failed`) |
| Rate limit, logger ปลอด PII, ลบข้อมูลทั้งหมด, Privacy/Terms (ร่าง), security headers | ✅ |

ทดสอบอัตโนมัติ: **522 เทสต์** (Vitest: unit + DB บน Postgres จริงที่จำลอง Supabase + RLS) + **46 เคส e2e** (Playwright + axe ที่ 360px)

## 9) ฟีเจอร์ที่ยังไม่ทำ (backlog)

เจ้าของเลือกทั้งหมดไว้แล้วแต่ขอหยุดก่อน ถ้ากลับมาทำ:
- **หลายบัญชี/กระเป๋าเงิน (Ultimate)** — ตัวเลือกที่เจ้าของเลือกไว้: **แท็กกระเป๋าบนรายการ + กรอง/ดูยอดแยก** (ไม่ทำยอดตั้งต้น/โอนระหว่างกระเป๋า) จำนวนกระเป๋าสูงสุดยังไม่ได้กำหนด (เสนอ 10) ต้องแก้ DB หน้าจด และสรุปหลายจุด
- **แนบสลิป/ใบเสร็จ/หลักฐาน + จดด้วย PDF (Ultimate)** — ต้องมีพื้นที่เก็บไฟล์เพิ่มและตรวจความปลอดภัย
- Slip2Go adapter (รอเอกสาร API), LLM categorizer, CSP, ระบบ alert อัตโนมัติ, `Privacy/Terms` ฉบับจริง
- Keyword แบบ substring อาจจัดผิดบ้าง (เช่น "ชา" ใน "ชาร์จ")

## 10) งานค้างก่อนเปิดรับเงินจริง

1. ทดสอบบนมือถือจริงให้ครบ: จดด้วยเสียง, สรุปอัตโนมัติ (รอวันจันทร์หลัง 09:00 หรือกด Run workflow), ทดลองฟรี, อัปเกรดส่วนต่างพร้อมเพย์
2. **เปิด Stripe Live** (เจ้าของบอกว่าเป็นขั้นสุดท้าย): ใช้บัญชี Stripe ที่ยืนยันธุรกิจและผูกธนาคารแล้ว → ใส่ `sk_live_` + `whsec_` ของ Live ใน Vercel → สร้าง webhook 5 อีเวนต์ใน Live → เปิด Cards + PromptPay + Customer portal ใน Live → ทดสอบจ่ายจริงจำนวนน้อยแล้วคืนเงิน → ตั้ง Public business name + โลโก้ + `NEXT_PUBLIC_CONTACT_EMAIL`
3. ตรวจโควตา push ของ LINE OA (สรุปอัตโนมัติและเตือนใช้โควตา)
4. ปิด/ลบบริการบัญชีเก่า (Vercel เก่าปิดแล้ว) และหมุน (rotate) secret ที่เคยอยู่ในบัญชีเก่า

## 11) วิธีทำงานกับเจ้าของโปรเจกต์

- ก่อนเริ่มงานใหม่: สรุปแผนสั้น ๆ และถามเฉพาะที่จำเป็นจริง (ไม่เกิน 3 ข้อ) · เรื่อง trade-off เสนอ 2 ตัวเลือกพร้อมข้อแนะนำ
- commit เล็ก ๆ ข้อความภาษาอังกฤษแบบ Conventional Commits และ **ท้ายทุก commit ต้องมี** `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- ห้ามสร้างฟีเจอร์นอกสโคปโดยไม่ถาม · ทำทีละหน่วยแล้วหยุดสรุป (ทำอะไร / ยังไม่ทำ / ความเสี่ยง / สิ่งที่เจ้าของต้องตั้งค่าเอง)
- **ไม่ push เองโดยไม่ถาม** (เจ้าของตอบ "push ได้เลย") · **ตรวจ `typecheck` + `lint` + `test` (+ `build` ถ้าแตะ route) ให้ผ่านก่อน push เสมอ** (เคย push ทั้งที่ typecheck ล้ม)
- migration ใหม่: บอกเจ้าของให้รัน **ก่อน** push
- UI ทุกจุดต้องมี loading/empty/error ใช้ดีที่ 360px, สีผ่าน WCAG AA, ข้อความ UI เป็นไทย
- Definition of Done: lint/typecheck/test ผ่าน, migration รันซ้ำได้ + ผ่าน `rls_check.sql`, e2e ผ่าน, เอกสารอัปเดต

## 12) บทเรียน / ข้อควรรู้ (เจอมาแล้ว)

**Vercel / env**
- ตัวแปรใหม่หรือแก้ค่าแล้ว **ต้อง Redeploy** · ตัวแปร `NEXT_PUBLIC_*` ฝังตอน build → Redeploy แบบ **ปิด build cache** · อย่าติ๊ก Sensitive (ไม่ถูกฝัง ทำให้ขึ้น "ยังไม่ได้ตั้งค่า LIFF")
- `AI_PROVIDER` ค่าว่างทำให้ทุก route ที่อ่าน env พัง 500 "server misconfigured" (ตรวจจาก Logs ค้น `Invalid server environment`)
- Deployment Protection ต้องปิด ไม่งั้น LINE เรียก webhook ได้ 401 · อย่าใช้ URL เฉพาะ deployment เป็น Webhook URL
- ลบโดเมน `.vercel.app` ออกโดยพลาดได้ → Settings → Domains → Add กลับ

**LINE / LIFF**
- LIFF สร้างได้เฉพาะใน LINE Login channel · ตรวจ ID token ด้วย `LINE_LOGIN_CHANNEL_ID` (ผิด/ว่าง = 401 แล้วเว็บวน login) — โค้ดจำกัดให้ login ซ้ำได้แค่ 1 ครั้งต่อ 30 วินาที แล้วขึ้นข้อความแทนวนไม่จบ · ดู log `liff_verify_failed`
- Endpoint URL ของ LIFF ต้องเป็น **ราก** ของโดเมน หน้าแรกเป็น client page ที่ `liff.init()` (อย่าเปลี่ยนเป็น server redirect)
- Rich Menu ผูก LIFF ID ไม่ผูกโดเมน · `pnpm richmenu --replace` สร้างใหม่ · LINE ไม่รับ `fillInText` ว่าง (เมนู "จดตังค์" จึงเป็น postback เงียบ ๆ ที่บอทตอบเป็นการ์ด)
- ตรวจรูปแบบ Flex message ได้โดยไม่ส่งจริงที่ `POST /v2/bot/message/validate/reply`
- Flex `image` ต้องเป็น https · ข้อความที่มีลิงก์ถูกข้ามใน parser

**Stripe**
- API เวอร์ชันใหม่ (`2026-08-26.dahlia`) ไม่รับ `payment_method_types` ใน Checkout Session
- Customer portal ต้อง Activate/Save ครั้งแรกแยกในแต่ละบัญชีและแต่ละโหมด (Test/Live)
- ข้อความ error ตอนเปิดหน้าจ่ายเงินมีรหัสต่อท้าย (เช่น `(รหัส: 401 api_key_invalid)`) · log ชื่อ `stripe_checkout_failed` / `stripe_portal_failed` / `stripe_change_failed` / `stripe_webhook_failed`
- ลิงก์สั้น `dashboard.stripe.com/test/...` อาจพาไปบัญชีอื่นที่เคยล็อกอิน ให้ตรวจชื่อบัญชีมุมซ้ายบนก่อนแก้อะไร

**ฐานข้อมูล**
- Supabase เก่าเคยมีตาราง `transactions` ของแอปอื่นทำให้ `0001` ล้ม — ตรวจก่อนรัน
- Postgres: `alter type … add value` ใช้ค่าใหม่ใน transaction เดียวกันไม่ได้ (migration 0008/0013 ไม่ใช้ค่าใหม่ในไฟล์เดียวกัน)
- คำนวณเงินส่วนต่างด้วยจำนวนเต็มก่อนหาร (ลอยตัวเคยทำ 40 กลายเป็น 41)

**เครื่องพัฒนา (Windows / PowerShell)**
- ใช้ `npx --yes pnpm@10.34.7 <คำสั่ง>` · Node หลังพร็อกซีบริษัท: ตั้ง `NODE_USE_ENV_PROXY=1` สำหรับสคริปต์ Node และ `git -c http.proxy=<พร็อกซี> push` ใน terminal ที่ไม่ได้ตั้ง `HTTPS_PROXY`
- push ไป GitHub บัญชีอื่น: Git Credential Manager จะเด้งหน้าล็อกอินเอง ให้ใส่ username ใน URL ของ remote
- แก้ไฟล์ไทยด้วย .NET UTF-8 (ไม่มี BOM) อย่าใช้ `Get-Content/Set-Content` ตรงๆ (ตัวอักษรเพี้ยน) · `R` ใน PowerShell คือ alias ของ Invoke-History ห้ามตั้งชื่อฟังก์ชันซ้ำ
- Playwright e2e build ด้วย `NEXT_PUBLIC_E2E=1` เฉพาะตอนทดสอบ ห้ามตั้งใน production

## 13) ย้ายเครื่องทำงานต่อ

1. ติดตั้ง Git, Node 22 (ใช้ pnpm ผ่าน `npx` ได้) แล้ว `git clone https://github.com/STS-LSR-10/JodTang.git` → `npx --yes pnpm@10.34.7 install`
2. สร้าง `.env.local` เอง (แม่แบบ `.env.example`) โดยคัดลอกจากเครื่องเก่าผ่านช่องทางปลอดภัย หรือเอาค่าจาก Vercel/Supabase/LINE/Stripe
3. ถ้าจะรัน e2e: `npx --yes pnpm@10.34.7 exec playwright install chromium`
4. ประวัติแชทกับ AI ไม่ตามไปด้วย — ให้เซสชันใหม่อ่านไฟล์นี้ + `README.md` + `docs/DEPLOY.md` ก่อนเริ่ม

## 14) คำสั่งที่ใช้บ่อย

```bash
npx --yes pnpm@10.34.7 install
npx --yes pnpm@10.34.7 lint
npx --yes pnpm@10.34.7 typecheck
npx --yes pnpm@10.34.7 test          # unit + tests/db (Postgres จำลอง) + RLS
npx --yes pnpm@10.34.7 e2e           # Playwright + axe ที่ 360px
npx --yes pnpm@10.34.7 build
npx --yes pnpm@10.34.7 dev           # http://localhost:3000
npx --yes pnpm@10.34.7 richmenu --dry-run
```

ขั้นตอน deploy / rollback / rotate secret / ตั้งค่า Stripe / แก้ปัญหา: [DEPLOY.md](DEPLOY.md) · token การออกแบบ: [design-tokens.md](design-tokens.md)
