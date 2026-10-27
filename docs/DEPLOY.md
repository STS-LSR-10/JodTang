# คู่มือ Deploy, Rollback และแก้ปัญหา (JodTang)

เอกสารนี้ไม่มีความลับใด ๆ ค่า secret อยู่ใน Vercel / GitHub Secrets / `.env.local` เท่านั้น

> วางแผนย้ายโฮสต์ไป Cloudflare ไว้แล้ว (ยังไม่ย้าย): ดู [CLOUDFLARE-MIGRATION.md](CLOUDFLARE-MIGRATION.md)

> หารบิลในกลุ่มต้องใช้หน้า LIFF ส่งข้อความเข้ากลุ่มในนามผู้ใช้: ที่ LINE Developers Console → LIFF app → เปิด scope **`chat_message.write`** (ถ้ายังไม่เปิด ปุ่ม "📣 ส่ง QR เข้ากลุ่ม" บนการ์ดบิลเป็นทางสำรอง) · เมื่อ OA ได้รับ verified รายชื่อสมาชิกกลุ่มจะครบเองโดยไม่ต้องแก้โค้ด

## 1) ภาพรวมระบบ

```
LINE ──► Vercel (Next.js: /api/line/webhook, LIFF pages, /api/*) ──► Supabase (Postgres + Storage)
                      │                                         ▲
                      ├──► ผู้ให้บริการอ่านสลิป (EasySlip → AI)  │
GitHub Actions (รายชั่วโมง) ──► /api/cron/recurring + /api/cron/reminders ─┘
```

## 2) Environment variables

| ตัวแปร                                                                  | ที่ตั้ง                       | ลับ?               | หมายเหตุ                                                                     |
| ----------------------------------------------------------------------- | ----------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | Vercel                        | ใช่ (secret/token) | Messaging API channel                                                        |
| `LINE_LOGIN_CHANNEL_ID`                                                 | Vercel                        | ไม่                | LINE Login channel ที่เป็นเจ้าของ LIFF                                       |
| `NEXT_PUBLIC_LIFF_ID`                                                   | Vercel                        | ไม่                | ตั้งเป็น Sensitive ไม่ได้ (prefix `NEXT_PUBLIC_`)                            |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | Vercel                        | ไม่                |                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`                                             | Vercel                        | **ใช่ (สูงมาก)**   | ฝั่ง server เท่านั้น                                                         |
| `SESSION_JWT_SECRET`                                                    | Vercel                        | ใช่                | ≥ 32 ตัวอักษร ใช้เซ็น session และลิงก์ส่งออก                                 |
| `CRON_SECRET`                                                           | Vercel **และ** GitHub Secrets | ใช่                | ค่าเดียวกัน 2 ที่                                                            |
| `APP_BASE_URL`                                                          | Vercel **และ** GitHub Secrets | ไม่                | เช่น `https://jod-tang.vercel.app`                                           |
| `AI_PROVIDER` (+ `AI_MODEL`) และ key ของค่าย                            | Vercel                        | key = ใช่          | `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`                    |
| `EASYSLIP_API_KEY`, `SLIP_READERS`                                      | Vercel                        | key = ใช่          | ไม่บังคับ                                                                    |
| `NEXT_PUBLIC_CONTACT_EMAIL`                                             | Vercel                        | ไม่                | แสดงในหน้า Privacy/Terms                                                     |
| `NEXT_PUBLIC_LINE_OA_BASIC_ID`                                          | Vercel                        | ไม่                | Basic ID ของ OA (ขึ้นต้นด้วย @) ใช้ทำลิงก์เพิ่มเพื่อน; ไม่ตั้ง = `@964jamyy` |

ตัวแปรใหม่หรือแก้ค่า **ต้อง Redeploy** ถึงมีผล · อย่าตั้ง `NEXT_PUBLIC_E2E` ใน production (ใช้เฉพาะชุด e2e)

## 3) ติดตั้งครั้งแรก (เรียงตามลำดับ)

1. **Supabase:** รัน migration ตามลำดับใน SQL Editor หรือ `supabase db push`
   `0001_schema` → `0002_rls` → `0003_seed_and_functions` → `0004_budget_mode_overrides_analytics` →
   `0005_slips_bucket` → `0006_points_referral_reminders` → `0007_rate_limits`
   (ทุกไฟล์รันซ้ำได้) แล้วรัน [supabase/tests/rls_check.sql](../supabase/tests/rls_check.sql) (คัดลอกทั้งไฟล์ไปวางแล้ว Run) ผ่านเมื่อผลลัพธ์สุดท้ายขึ้นคอลัมน์ `result` = `RLS checks passed` (ถ้าล้มจะขึ้น error ที่ระบุตาราง/ข้อที่ผิด; ไม่ทิ้งข้อมูลทดสอบไม่ว่าผลเป็นอย่างไร)
2. **LINE Developers:** Messaging API channel (ปิด Auto-reply/Greeting) + LINE Login channel + LIFF
   (Endpoint = **ราก** ของเว็บ) — ดูรายละเอียดใน [README](../README.md)
3. **Vercel:** import repo, ปิด Deployment Protection, ตั้ง env ตามตารางด้านบน, Redeploy
4. **LINE:** ตั้ง Webhook URL `https://<โดเมน>/api/line/webhook` แล้ว Verify
   - **สมุดกลุ่ม (Elite, ไม่บังคับ):** ที่ LINE Official Account Manager → การตั้งค่า → _การตอบกลับ_ (Response settings) เปิด **"อนุญาตให้บัญชีเข้าร่วมแชทกลุ่มและแชทหลายคน"** (Allow bot to join group chats) แล้วลองดึงบอทเข้ากลุ่มทดสอบ บอทต้องทักทายกลับ ถ้าเงียบ ตรวจว่าเปิด _Use webhook_ และ event ถูกส่งมา (log `line_event_failed` ถ้ามี) · ผู้ใช้ที่ไม่ได้ยอมรับข้อกำหนด LINE OA จะไม่มี userId ในข้อความกลุ่ม บอทจึงแยกคนจ่ายไม่ได้ ให้เขาเพิ่มบอทเป็นเพื่อนก่อน
5. **Rich Menu:** `pnpm richmenu --replace` (ใส่ `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env.local`)
6. **GitHub Secrets:** `APP_BASE_URL`, `CRON_SECRET` (ให้ตัวเตือนรายชั่วโมงทำงาน)

## 4) ขั้นตอนปล่อยงาน

1. เปิด PR → CI ต้องผ่าน: `lint`, `typecheck`, `test` (รวมทดสอบ migration/RLS บน Postgres จริง) และ `e2e` (Playwright + a11y)
2. Merge เข้า `main` → Vercel build และ deploy อัตโนมัติ
3. **ถ้ามี migration ใหม่:** รันบน Supabase **ก่อน** merge (migration ต้องเข้ากับโค้ดรุ่นเก่าได้ — ดูข้อ 5)
4. **Smoke test หลัง deploy** (≈ 3 นาที):
   - `curl -i -X POST https://<โดเมน>/api/line/webhook -d '{"events":[]}' -H 'Content-Type: application/json'` ต้องได้ `401 invalid signature`
   - พิมพ์ `กาแฟ 30` ในแชท ได้การ์ดตอบกลับ
   - เปิด `liff.line.me/<LIFF_ID>` เห็นหน้าสรุป
   - Vercel → Logs ไม่มี `"level":"error"` ใหม่

## 5) Rollback

**โค้ด (ทันที):** Vercel → Deployments → เลือก deployment ล่าสุดที่ปกติ → ⋯ → **Promote to Production** (หรือ Instant Rollback)
ไม่ต้อง revert commit ก่อน ค่อยแก้บน `main` แล้วปล่อยใหม่ทีหลัง

**ข้อควรรู้:**

- การ rollback **ไม่ย้อนค่า env** (ถ้าเพิ่งแก้ env ให้แก้กลับเองแล้ว Redeploy)
- **Migration ไม่ย้อนกลับอัตโนมัติ** กติกาของโปรเจกต์: migration ต้องเป็นแบบ _เพิ่ม_ (ตาราง/คอลัมน์/ฟังก์ชันใหม่ ไม่ลบหรือเปลี่ยนชื่อของเดิม)
  เพื่อให้โค้ดรุ่นก่อนหน้ายังทำงานกับฐานข้อมูลรุ่นใหม่ได้ ถ้าจำเป็นต้องลบ/เปลี่ยนโครงสร้าง ให้ทำเป็น 2 รอบ (เพิ่มของใหม่ → ปล่อยโค้ด → ค่อยลบของเก่าใน release ถัดไป)
- **ก่อน migration ที่ทำลายข้อมูล** ให้สำรองก่อน: Supabase → Database → Backups (หรือ `pg_dump`)
- **Rich Menu:** รัน `pnpm richmenu --replace` จาก commit รุ่นที่ต้องการ หรือลบเมนูใน LINE OA Manager
- **Webhook ล้มหนัก:** ชั่วคราวปิด _Use webhook_ ใน LINE Developers (ผู้ใช้จะไม่ได้คำตอบ แต่ไม่เกิดข้อมูลเสีย)

## 5.1) หมุนเวียน (rotate) secret

| Secret                      | วิธี                                                         | ผลกระทบ                                                |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `LINE_CHANNEL_ACCESS_TOKEN` | Issue ใหม่ใน LINE Developers → แก้ Vercel → Redeploy         | ไม่มี (token เดิมใช้ได้จนกว่าจะ revoke)                |
| `SESSION_JWT_SECRET`        | ตั้งค่าใหม่ → Redeploy                                       | ผู้ใช้ที่ล็อกอินอยู่ถูกให้ล็อกอินใหม่อัตโนมัติ 1 ครั้ง |
| `CRON_SECRET`               | แก้ **ทั้ง Vercel และ GitHub Secrets** → Redeploy            | cron ใช้ไม่ได้ถ้าสองที่ไม่ตรงกัน                       |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → roll key → แก้ Vercel → Redeploy | ระบบหยุดชั่วคราวระหว่างสลับ                            |
| Key ของ AI / EasySlip       | ออก key ใหม่ → แก้ Vercel → Redeploy                         | ไม่มี (chain จะข้ามเจ้าที่ล้มเอง)                      |

## 5.2) ตั้งค่า Stripe (ชำระเงิน / subscription)

ทำใน **Test mode** ก่อนเสมอ แล้วค่อยทำซ้ำกับ Live mode

1. รัน migration `0009_payments.sql` ใน Supabase SQL Editor แล้วรันสคริปต์ตรวจ RLS ซ้ำ (ต้องขึ้น `RLS checks passed`)
2. Stripe Dashboard → **Settings → Payment methods**: เปิด **Cards** และ **PromptPay** (บัญชี Stripe ต้องเป็นประเทศไทยจึงจะเปิดพร้อมเพย์ได้)
3. Stripe Dashboard → **Settings → Billing → Customer portal**: กด Activate แล้วเปิด "Cancel subscriptions" และ "Update payment method" (ไม่ต้องเปิดเปลี่ยนแผน เพราะแผนกำหนดราคาในโค้ด)
4. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
   - URL: `https://<โดเมนของคุณ>/api/stripe/webhook`
   - Events ที่ต้องเลือก: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `invoice.paid`
   - คัดลอก **Signing secret** (ขึ้นต้น `whsec_`)
5. ใส่ใน Vercel → Environment Variables (Production): `STRIPE_SECRET_KEY` (ขึ้นต้น `sk_test_` / `sk_live_`) และ `STRIPE_WEBHOOK_SECRET` แล้ว Redeploy **อย่าส่งค่าทั้งสองในแชทหรือ commit**
6. ทดสอบ: หน้าอัปเกรด → เลือกบัตรทดสอบ `4242 4242 4242 4242` (วันหมดอายุในอนาคต, CVC อะไรก็ได้) → กลับมาดูแผนในหน้าตั้งค่า

วิธีทำงาน

- บัตร → `mode=subscription`: เมื่อ Stripe ส่ง `customer.subscription.created/updated` (สถานะ active) ระบบตั้ง `plan` และ `plan_expires_at` = สิ้นรอบบิลปัจจุบัน ต่ออายุเองทุกรอบ
- พร้อมเพย์ → `mode=payment`: เมื่อจ่ายสำเร็จ ระบบต่อ `plan_expires_at` ตามรอบ (1 หรือ 12 เดือน) ต่อท้ายเวลาที่เหลือ ผ่าน `apply_prepaid_purchase` (กันซ้ำด้วย `payments.provider_ref`)
- ยกเลิก subscription: ผู้ใช้ยังใช้ได้จนสิ้นรอบที่จ่ายแล้ว (ไม่มีการคืนเงินอัตโนมัติ ถ้าต้องการคืนให้ทำใน Stripe เอง แล้วลด `plan_expires_at` ด้วยมือ)
- **กันจ่ายซ้อน** (`src/lib/payments/policy.ts`, ใช้ทั้งฝั่ง server และปุ่มในหน้าอัปเกรด): มีบัตร subscription ที่กำลังทำงาน → ห้ามจ่ายซ้ำทุกแบบ (ให้ไปที่ปุ่มจัดการการชำระเงิน), มีเวลาพร้อมเพย์เหลือ → ต่อ/อัปเกรดด้วยพร้อมเพย์ได้ แต่สมัครบัตรไม่ได้จนกว่าจะหมด, ห้ามซื้อแผนต่ำกว่าที่ใช้อยู่ ส่วนวันที่ได้จากแลกตังสะสมไม่นับเป็นพร้อมเพย์ จึงสมัครบัตรทับได้
- **ช่องทางที่ขึ้นในหน้าจ่ายเงิน** กำหนดที่ Stripe Dashboard → Settings → Payment methods เท่านั้น (Stripe เวอร์ชันใหม่ไม่รับ `payment_method_types` แล้ว): โหมดบัตร (subscription) จะโชว์เฉพาะช่องทางที่ตัดซ้ำได้, โหมดพร้อมเพย์ (จ่ายครั้งเดียว) โชว์ช่องทางที่เปิดไว้ทั้งหมดรวมพร้อมเพย์ ถ้าไม่เห็นพร้อมเพย์ในหน้าจ่ายเงิน ให้ตรวจว่าเปิด PromptPay ในบัญชีแล้ว
- **เปลี่ยนแผนระหว่างทาง** (ต้องรัน migration `0010_billing_period.sql`): คนที่สมัครบัตรอยู่ อัปเกรดไปแผนที่สูงกว่า หรือเปลี่ยนรายเดือน→รายปีในแผนเดิมได้ที่หน้าอัปเกรด (`POST /api/plan/change`) ระบบสลับ subscription เดิมเป็นราคาใหม่ด้วย `proration_behavior=always_invoice` Stripe หักเวลาที่ยังไม่ได้ใช้แล้วคิดแผนใหม่ ตัดจากบัตรเดิมทันที ถ้าบัตรถูกปฏิเสธ แผนเดิมไม่เปลี่ยน (`payment_behavior=error_if_incomplete`) ลดแผนหรือรายปี→รายเดือนกลางรอบไม่ได้ (ให้ยกเลิกที่ portal) ส่วนผู้ใช้พร้อมเพย์ยังซื้อรอบใหม่แบบเต็มราคาและต่อท้ายเวลาที่เหลือ (ยังไม่คิดส่วนต่าง)
- **ทดลองใช้ฟรี 7 วัน** (`POST /api/plan/trial`, ต้องรัน migration `0011_trials_and_upgrades.sql`): ได้ครั้งเดียวต่อแผน (Pro 1 ครั้ง, Elite 1 ครั้ง) ไม่ต้องใช้บัตร และเริ่มได้เฉพาะตอนที่ยังไม่มีแผนใช้งานอยู่ (รวมวันที่แลกด้วยตังสะสม) ครบ 7 วันแผนกลับเป็น Free เอง ใช้ฟังก์ชัน SQL `start_plan_trial` (กดซ้ำ/แข่งกันก็ได้ครั้งเดียว) จำนวนวันตั้งที่ `TRIAL_DAYS` ใน `src/lib/pricing.ts`
- **อัปเกรดแผนพร้อมเพย์ จ่ายเฉพาะส่วนต่าง**: ผู้ใช้ที่มีเวลาพร้อมเพย์เหลือกด 'อัปเกรดส่วนที่เหลือ' ราคา = (ราคาต่อวันแผนใหม่ − แผนเดิม) × วันที่เหลือ ตามรอบที่ซื้อไว้ (รายเดือน ÷30, รายปี ÷365) ปัดขึ้นเป็นบาท ขั้นต่ำ ฿10 และไม่เกินราคาเต็มของรอบใหม่ วันหมดอายุไม่เปลี่ยน ราคาคำนวณที่ server เท่านั้น ถ้าจ่ายเสร็จแต่เวลาพร้อมเพย์หมดไปแล้วระหว่างจ่าย ระบบบันทึกการจ่ายไว้แต่ไม่เปลี่ยนแผน (`payments.kind='upgrade'`) ต้องคืนเงินเองใน Stripe
- **สรุปอัตโนมัติในแชท** (Pro ขึ้นไป, ปิดไว้เป็นค่าเริ่มต้น, ต้องรัน migration `0012_auto_summary.sql`): ผู้ใช้เปิดเองที่หน้าตั้งค่า สรุปรายสัปดาห์ส่งทุกวันจันทร์ 09:00 (สัปดาห์จันทร์–อาทิตย์ที่ผ่านมา) สรุปรายเดือนส่งวันเริ่มรอบงบ 09:00 (รอบงบแบบสัปดาห์ใช้วันที่ 1) ใช้ cron รายชั่วโมงตัวเดียวกับเตือนจดประจำวัน (`/api/cron/reminders` ทำทั้งสองอย่าง) ส่งครั้งเดียวต่อช่วง ถ้าช่วงนั้นไม่มีรายการเลยจะไม่ส่ง (แต่ถือว่าส่งแล้ว) ทุกข้อความ push นับโควตาข้อความของ LINE OA ถ้าผู้ใช้เปิดเยอะ ตรวจโควตาที่ LINE Official Account Manager
- **จดด้วยเสียง** (เฉพาะ Elite, ต้องรัน migration `0013_voice_source.sql`): ผู้ใช้ส่งข้อความเสียง (ไม่เกิน 30 วินาที) ในแชท บอทดาวน์โหลดเสียงจาก LINE ถอดเป็นข้อความด้วย Gemini (หรือ OpenAI ถ้า `AI_PROVIDER=openai`; Anthropic ไม่มีเสียงเข้า) แล้วแยกรายการเหมือนข้อความพิมพ์ **ถามยืนยันก่อนจดเสมอ**: การ์ด 'ตรวจรายการจากเสียง' มีปุ่ม จดเลย / เปลี่ยนหมวด / ยกเลิก (รายการรอยืนยันเป็น `pending_confirm` `source=voice` ไม่ปรากฏในสรุปจนกดจดเลย) ไม่เก็บไฟล์เสียง จำกัด 5 ครั้ง/นาที และ 60 ครั้ง/วันต่อคน (`LIMITS.chatVoice` / `voiceDay`) ถ้าไม่มี key ของ Gemini/OpenAI บอทจะตอบว่ายังไม่เปิดให้จดด้วยเสียง ต้นทุน AI ต่อครั้ง ตรวจที่ Google AI Studio / OpenAI usage
- ราคาอยู่ที่ `src/lib/pricing.ts` และส่งเป็น `price_data` ทุกครั้ง จึงไม่ต้องสร้าง Product/Price ใน Stripe

ปัญหาที่พบบ่อย

- Webhook ขึ้น 400 ใน Stripe: `STRIPE_WEBHOOK_SECRET` ไม่ตรงกับ endpoint นั้น (test กับ live คนละค่า)
- จ่ายแล้วแผนไม่เปลี่ยน: ดู Stripe → Webhooks → ประวัติการส่ง ถ้าเป็น 5xx ดู log event `stripe_webhook_failed` ใน Vercel ส่วน Stripe จะส่งซ้ำให้เอง
- ปุ่มยังตอบ "ยังไม่เปิดให้ชำระเงิน": ยังไม่ได้ตั้ง env ทั้งสองตัว หรือรูปแบบไม่ถูก (`sk_...`/`rk_...` และ `whsec_...`) หรือยังไม่ได้ Redeploy

## 6) Logging และการเฝ้าระวัง

- ดู log ที่ Vercel → Project → **Logs** แต่ละบรรทัดเป็น JSON: `{"level":"error","event":"line_event_failed","message":"..."}`
- **ไม่มีข้อมูลส่วนบุคคลใน log โดยออกแบบ:** ไม่มีข้อความแชท ชื่อ จำนวนเงิน เลขบัญชี หรือ user id
  (ข้อความ error ผ่านตัวกรอง `redact` ลบ LINE id, UUID, โทเคน, อีเมล และเลขยาว) — ใช้ `log` จาก `src/lib/log.ts` เสมอ ห้ามใช้ `console.*` ตรง ๆ
- Event ที่ควรรู้จัก:

| event                                                                      | ความหมาย                                                                                                              | ทำอะไร                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook_config_error`                                                     | env ฝั่ง server ขาด/ผิด (ข้อความบอกชื่อตัวแปร)                                                                        | ตรวจ env แล้ว Redeploy                                                                                                                       |
| `line_setup_failed`                                                        | เชื่อม Supabase ไม่ได้                                                                                                | ตรวจ `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                 |
| `line_event_failed`                                                        | ประมวลผลข้อความไม่สำเร็จ                                                                                              | ดู `message` (เช่น ตาราง/bucket ไม่พบ → ยังไม่รัน migration)                                                                                 |
| `slip_reader_skipped`                                                      | ผู้อ่านสลิปเจ้าหนึ่งล้ม → ไปเจ้าถัดไป                                                                                 | ถ้าเกิดบ่อย ตรวจ key/โควตาของเจ้านั้น                                                                                                        |
| `insight_failed` / `insight_attach_failed`                                 | AI Insight ล้ม → ระบบใช้ข้อสังเกตที่โค้ดสร้างเองแทน / โหลดข้อมูลวิเคราะห์ท้ายสรุปรายเดือนไม่ได้ (สรุปยังถูกส่ง)       | ถ้าเกิดบ่อย ตรวจ key/โควตาของ AI_PROVIDER และ migration 0018                                                                                 |
| `smart_parse_failed`                                                       | AI อ่านประโยคยาว (Elite) ล้ม → ระบบถอยไปใช้กติกาเดิมให้เอง ผู้ใช้ไม่เห็นข้อผิดพลาด                                    | ถ้าเกิดบ่อย ตรวจ key/โควตาของ AI_PROVIDER                                                                                                    |
| `rate_limit_unavailable`                                                   | ตัวจำกัดอัตราพัง (ระบบปล่อยผ่าน ไม่ปิดกั้น)                                                                           | รัน migration `0007`                                                                                                                         |
| `budget_alert_failed` / `award_failed`                                     | ส่วนเสริมล้ม (การจดไม่ถูกขัดขวาง)                                                                                     | ตรวจ migration `0004`/`0006`                                                                                                                 |
| `cron_recurring_failed` / `cron_reminders_failed`                          | cron ล้ม                                                                                                              | ตรวจ `CRON_SECRET` และ DB                                                                                                                    |
| `cron_bills_failed` / `bill_reminder_failed` / `bill_reminder_push_failed` | เตือนจ่ายบิล (Elite) ล้ม / push หาผู้ใช้ไม่สำเร็จ (บัญชีบล็อกบอท) ระบบบันทึกว่าส่งแล้วก่อน จึงไม่ retry ซ้ำทุกชั่วโมง | ตรวจ migration `0026_bills.sql` และว่า GitHub Actions รายชั่วโมงยิง `/api/cron/reminders` ได้ (เตือนบิลใช้ endpoint เดียวกับเตือนจดประจำวัน) |
| `account_deleted`                                                          | มีผู้ใช้ลบข้อมูล (นับไฟล์เท่านั้น)                                                                                    | ปกติ                                                                                                                                         |
| `api_error`                                                                | API ตอบ 500                                                                                                           | ดู `message`                                                                                                                                 |

- **Rate limit:** แชท 30 ข้อความ/นาที/คน, รูป 10/นาที, ปุ่ม 60/นาที (ปรับได้ที่ `LIMITS` ใน `src/lib/rate-limit.ts`)
  เกินแล้วบอทตอบเตือนครั้งเดียวต่อหน้าต่างเวลา แล้วเงียบ

## 7) แก้ปัญหาที่พบบ่อย

| อาการ                            | สาเหตุที่เจอบ่อย                                      | วิธีแก้                                                         |
| -------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Verify webhook ได้ 500           | env server ไม่ครบ / `SESSION_JWT_SECRET` สั้นกว่า 32  | ดู log `webhook_config_error` → แก้ env → Redeploy              |
| Verify ได้ 401 จากหน้า Vercel    | Deployment Protection เปิดอยู่                        | ปิดที่ Settings → Deployment Protection                         |
| บอทเงียบ                         | webhook ไม่เปิด / URL ผิดโดเมน / ไม่มี event ใน log   | ตรวจ Use webhook และโดเมนล่าสุด                                 |
| เปิด LIFF แล้ว 404               | Endpoint URL ไม่ใช่ราก                                | ตั้งเป็น `https://<โดเมน>` (ไม่ต่อ path)                        |
| LIFF ขึ้น LINE 400               | LIFF ID / Endpoint / provider ไม่ตรง                  | ตรวจ LINE Login channel ให้อยู่ Provider เดียวกับ Messaging API |
| ส่งสลิปแล้ว "ระบบสะดุด"          | bucket `slips` ไม่มี / key AI ผิด                     | รัน `0005`; ดู `slip_reader_skipped`                            |
| เตือนรายวันไม่มา                 | GitHub Secrets ไม่ตั้ง / ไม่ใช่ Plus / ตั้งเวลาไปแล้ว | ตรวจแท็บ Actions และสิทธิ์ Plus                                 |
| `fetch failed` ตอนรัน `richmenu` | Node ไม่ใช้ proxy ของเครื่อง                          | ตั้ง `NODE_USE_ENV_PROXY=1`                                     |

## 8) การทดสอบ

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit + ทดสอบ migration/RLS/ฟังก์ชัน SQL บน Postgres จริง (PGlite)
pnpm e2e                                   # Playwright + axe ที่ 360px (ต้อง `pnpm exec playwright install chromium` ครั้งแรก)
```

- ชุด `tests/db` รันทุก migration (สองรอบ) บน Postgres จริงที่จำลอง role/`auth.uid()` ของ Supabase และรัน `rls_check.sql`
  จึงจับกรณีลืมเปิด RLS, policy รั่ว, ฟังก์ชันที่ผู้ใช้ไม่ควรเรียก ฯลฯ ได้ก่อนขึ้น production
  **แต่เป็นตัวจำลอง** — หลังรัน migration บนโปรเจกต์จริง ให้รัน `supabase/tests/rls_check.sql` ใน SQL Editor ซ้ำอีกครั้ง
- Lighthouse (mobile): หน้าสาธารณะ `/privacy`, `/terms` วัดแล้ว Performance/Accessibility/Best Practices/SEO = 99–100
  หน้า LIFF ต้องล็อกอิน LINE จึงวัดอัตโนมัติไม่ได้ — ตรวจด้วยมือถือจริง (First Load JS ราว 117 kB; กราฟโหลดแบบ lazy)

## 9) ที่ยังไม่ได้ทำ (ความเสี่ยงที่ยอมรับอยู่)

- **CSP (Content-Security-Policy)** ยังไม่เปิด เพราะต้องใช้ nonce ให้เข้ากับสคริปต์ของ Next และ LIFF SDK มีความเสี่ยงทำหน้าพัง — แนะนำทำเป็นงานแยกแล้วทดสอบกับ LINE จริง
- ไม่มีระบบแจ้งเตือนอัตโนมัติเมื่อ error (ดู Vercel Logs ด้วยตนเอง) — ถ้าต้องการให้ต่อ Vercel Log Drain / Sentry
- Privacy Policy และ Terms เป็น **ฉบับร่าง** ควรให้ผู้เชี่ยวชาญกฎหมายตรวจก่อนเปิดใช้จริง
- ไม่มีสำรองข้อมูลอัตโนมัติของโปรเจกต์ (ขึ้นกับแผน Supabase)
