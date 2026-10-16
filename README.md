# จดตังค์ (JodTang)

จดง่าย เห็นเงินชัด — ผู้ช่วยจดรายรับรายจ่ายผ่าน LINE Official Account + LIFF

Stack: Next.js 15 · TypeScript (strict) · Tailwind · shadcn/ui · Supabase · LINE Messaging API + LIFF · Vercel

## เริ่มใช้งาน (local)

ต้องมี Node 20+ และ pnpm (`corepack enable` หรือ `npm i -g pnpm`)

```bash
pnpm install
cp .env.example .env.local   # แล้วกรอกค่า (ห้าม commit)
pnpm dev                     # http://localhost:3000
```

ตรวจคุณภาพ (ต้องผ่านก่อนทุก PR):

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## ตั้งค่า LINE Developers (ทีละขั้น)

1. เข้า <https://developers.line.biz/console/> แล้วล็อกอินด้วยบัญชี LINE
2. สร้าง **Provider** (เช่น `JodTang`)
3. สร้าง channel ชนิด **Messaging API** (ผูกกับ LINE Official Account)
   - คัดลอก **Channel ID** → `LINE_CHANNEL_ID`
   - แท็บ *Basic settings* → **Channel secret** → `LINE_CHANNEL_SECRET`
   - แท็บ *Messaging API* → ออก **Channel access token (long-lived)** → `LINE_CHANNEL_ACCESS_TOKEN`
   - ปิด *Auto-reply messages* และ *Greeting messages* ใน LINE Official Account Manager (บอทตอบเอง)
4. สร้าง channel ชนิด **LINE Login** ใน Provider เดียวกัน → แท็บ *LIFF* → **Add**
   - Size: `Full`, Endpoint URL: `https://<โดเมนของคุณ>` (ราก ไม่ต่อ path — ดูหมายเหตุด้านล่าง)
   - Scope: `profile`, `openid`
   - คัดลอก **LIFF ID** → `NEXT_PUBLIC_LIFF_ID`
5. ตั้ง **Webhook URL** ที่แท็บ *Messaging API* เป็น `https://<โดเมน>/api/line/webhook` แล้วเปิด *Use webhook* และกด *Verify*

## ทดสอบ webhook

- **Vercel preview:** ทุก PR ได้ URL preview ใส่เป็น Webhook URL ชั่วคราว
- **ngrok:** `ngrok http 3000` แล้วใช้ `https://<id>.ngrok-free.app/api/line/webhook`
  (ตั้ง `APP_BASE_URL` ให้ตรง)

## LIFF (หน้าเว็บในแอป LINE)

1. ใน LINE Login channel → แท็บ **LIFF** → **Add**
   - Endpoint URL: `https://<โดเมน>` (ราก)
     LIFF จะต่อ path จาก `liff.line.me/<LIFF_ID>/<path>` ไปท้าย Endpoint URL
     ถ้าตั้ง Endpoint เป็น `/summary` ลิงก์ `/budgets` จะกลายเป็น `/summary/budgets` และขึ้น 404
   - Scope: `profile`, `openid` · Size: `Full`
2. ตั้งค่าใน Vercel (แล้ว Redeploy):
   - `NEXT_PUBLIC_LIFF_ID` = LIFF ID
   - `LINE_LOGIN_CHANNEL_ID` = Channel ID ของ **LINE Login channel** (ใช้ตรวจ ID token)
   - `APP_BASE_URL` = โดเมน production
3. Provider เดียวกัน: LINE Login channel และ Messaging API channel ต้องอยู่ใน Provider เดียวกัน
   ไม่งั้น LINE user id จะไม่ตรงกับที่ webhook เห็น
4. เปิดทดสอบในแอป LINE ที่ `https://liff.line.me/<LIFF_ID>/summary`
   (เปิดนอกแอปก็ได้ จะเด้งไปหน้า LINE Login)

หน้าที่พร้อมใช้: **สรุป**, **รายการ** (กรอง/ค้นหา/เพิ่ม/ลบ), **หมวด/งบ**
(เพิ่ม/แก้/ซ่อน/เรียงหมวด, ตั้งคำค้น, งบรวมหรือแยกหมวด + แจ้งเตือน 80%/100%),
**วิเคราะห์** (กราฟแท่ง 6 เดือน/สัปดาห์/วัน และโดนัทตามหมวด), **ตั้งค่า**

> ต้องรัน migration `supabase/migrations/0004_budget_mode_overrides_analytics.sql`
> ก่อนใช้โหมดงบ ปรับหมวดมาตรฐาน และกราฟ (ไฟล์รันซ้ำได้)

## สลิป / ใบเสร็จ (OCR)

ส่งรูปสลิปเข้าแชท → บอทอ่านจำนวนเงิน วันที่ ผู้รับ → ส่งการ์ด **ตรวจสลิป** ให้กด
`ยืนยัน` / `แก้ไขหมวด` / `ยกเลิก` (ยังไม่จดจนกว่าจะยืนยัน)

ตั้งค่า (ครั้งเดียว):
1. รัน migration `supabase/migrations/0005_slips_bucket.sql` ใน Supabase SQL Editor
   (สร้าง bucket `slips` แบบ **private** — ผู้ใช้ดูรูปผ่าน signed URL อายุ 60 วินาทีเท่านั้น)
2. ตั้ง `AI_PROVIDER` (`gemini` | `anthropic` | `openai`) และ API key ของค่ายนั้นใน Vercel
   (ไม่บังคับ: `AI_MODEL` เพื่อเปลี่ยนโมเดลเริ่มต้น) แล้ว Redeploy
3. (แนะนำ) ตั้ง `EASYSLIP_API_KEY` เพื่อให้ตรวจสลิปโอนเงินผ่าน EasySlip ก่อน

**ลำดับการอ่านสลิป (fallback chain)** — ลองทีละเจ้า เจ้าไหนล้ม/โควตาหมด/อ่าน QR ไม่ได้ ก็ไปเจ้าถัดไป:
`easyslip` → `slip2go` (ช่องสำรอง ยังไม่เปิดใช้) → AI ที่เลือกใน `AI_PROVIDER` → AI ตัวอื่นที่มี key
- เจ้าที่ไม่มี key จะถูกข้ามเอง; เปลี่ยนลำดับได้ด้วย `SLIP_READERS=easyslip,gemini,anthropic`
- EasySlip ใช้ได้กับ **สลิปโอนเงินที่มี QR** (ได้ค่าที่ธนาคารยืนยันและกันสลิปปลอม) ส่วนใบเสร็จร้านค้า
  หรือรูปที่ QR ไม่ชัด จะตกไปให้ AI อ่าน
- ถ้า AI ตอบชัดเจนว่า "ไม่ใช่สลิป" จะหยุดทันที ไม่ไล่เรียกเจ้าที่เหลือ (ไม่เสียค่าเรียกซ้ำ)
- ดูว่าเจ้าไหนถูกข้ามได้ใน Vercel Logs: event `slip_reader_skipped` (มีชื่อเจ้าและสถานะ ไม่มีข้อมูลสลิป)

พฤติกรรม:
- Free อ่านสลิปได้ **30 ใบ/เดือน** (นับตามเดือนปฏิทิน Asia/Bangkok, สลิปที่อ่านไม่ได้ไม่นับ) · Plus ไม่จำกัด
- กันซ้ำ 2 ชั้น: hash ของรูป (ก่อนเรียก AI จึงไม่เสียค่าใช้จ่าย) และเลขอ้างอิงของสลิป
- เก็บเลขบัญชีผู้รับแค่ **4 ตัวท้าย** (ทั้งในคอลัมน์และ `ocr_json`)
- กด `แก้ไขหมวด` แล้วเลือกหมวด → บอทจำ "ผู้รับ → หมวด" ไว้ใช้ครั้งต่อไป (`merchant_memory`)
- รูปถูกส่งไปยังผู้ให้บริการ AI ที่เลือกเพื่ออ่านข้อความ (ควรระบุใน Privacy Policy)

## แผน Free / Plus, ตังสะสม, จดประจำ, เตือน, ส่งออก (Phase 5)

> ต้องรัน migration `supabase/migrations/0006_points_referral_reminders.sql` ใน Supabase ก่อน (รันซ้ำได้)

| ฟีเจอร์ | Free | Plus |
|---|---|---|
| จดข้อความ, สรุป, รายการ, หมวด/งบ, กราฟรายรับรายจ่าย | ✅ | ✅ |
| อ่านสลิป | 30 ใบ/เดือน | ไม่จำกัด |
| ส่งออก CSV และ Excel | ✅ | ✅ + ชีตสรุปตามหมวด/รายเดือน |
| กราฟเก็บออม, รายการประจำ, เตือนจดประจำวัน, จำผู้รับ → หมวด | – | ✅ |

- **เช็คสิทธิ์จากที่เดียว:** `src/lib/plan.ts` (ฝั่ง API ใช้ `requireFeature` ใน `src/lib/plan-server.ts` จึงบังคับจริง ไม่ใช่แค่ซ่อนปุ่ม)
- **ชำระเงินเป็น stub:** `src/lib/payments/` มี interface (`PaymentProvider`) พร้อมต่อ Stripe/PromptPay แต่ตอนนี้ปุ่มอัปเกรดตอบว่า "ยังไม่เปิดให้ชำระเงิน"
- **ทดสอบแผน Plus:** ให้ตัวเองเป็น Plus ชั่วคราวใน Supabase SQL Editor
  ```sql
  update users set plan_expires_at = now() + interval '7 days'
  where line_user_id = '<LINE user id ของคุณ>';
  ```
  (หรือสะสมแต้มแล้วแลกที่หน้าตั้งค่า)

**ตังสะสม / ชวนเพื่อน** — อัตราทั้งหมดอยู่ที่ `src/lib/config.ts`
- ได้ 1 แต้มต่อวันที่จดอย่างน้อย 1 รายการ (วันละครั้ง กันปั่นแต้ม) · 10 แต้มแลก Plus ได้ 1 วัน
- ชวนเพื่อน: เพื่อนพิมพ์ `ใช้รหัส <รหัส>` (หรือกรอกที่หน้าตั้งค่า) ภายใน 14 วันแรก
  พอเพื่อนจดรายการแรก ทั้งสองฝ่ายได้ +10 แต้ม
- คำสั่งในแชท: `ตังสะสม` · `รหัสชวน` · `ใช้รหัส ABCD1234`

**รายการประจำ (Plus)** — รายวัน/สัปดาห์/เดือน (วันที่ 29–31 ใช้วันสุดท้ายของเดือนสั้น)
สร้างรายการให้ทุกวัน 00:00 เวลาไทย ถ้าระบบหยุดไปหลายวันจะจดย้อนให้ครบ (สูงสุด 12 ครั้งต่อกฎ)
ถ้า Plus หมด กฎจะหยุดรอ (ไม่ลบ) และกลับมาทำงานเมื่อได้ Plus อีก

**เตือนจดประจำวัน (Plus)** — ส่งข้อความเตือนถ้าวันนั้นยังไม่จด ตามเวลาที่ผู้ใช้ตั้ง วันละครั้ง
(ใช้โควตา push ของ OA)

**ตั้งเวลา (cron)** — endpoint ป้องกันด้วย `Authorization: Bearer <CRON_SECRET>`
| งาน | endpoint | ตัวเรียก |
|---|---|---|
| จดรายการประจำ | `/api/cron/recurring` | Vercel Cron วันละครั้ง (`vercel.json`) |
| เตือนรายวัน | `/api/cron/reminders` | GitHub Actions ทุกชั่วโมง (`.github/workflows/cron.yml`) |

Vercel แผน Hobby รัน cron ได้วันละครั้งเท่านั้น (ตั้งรายชั่วโมงแล้ว deploy จะล้ม) จึงให้ GitHub Actions เรียกตัวเตือน
ตั้งที่ GitHub → Settings → Secrets and variables → Actions: `APP_BASE_URL` (เช่น `https://jod-tang.vercel.app`) และ `CRON_SECRET` (ค่าเดียวกับใน Vercel)
ถ้าใช้แผน Pro สามารถย้ายตัวเตือนเข้า `vercel.json` แล้วลบ workflow ได้

**ส่งออก** — ที่หน้ารายการ กดไอคอนดาวน์โหลด เลือก CSV หรือ Excel ตามตัวกรองที่เลือกอยู่ (สูงสุด 5,000 แถว)
ลิงก์ดาวน์โหลดมีอายุ 2 นาทีและเปิดในเบราว์เซอร์ของเครื่อง (เบราว์เซอร์ในแอป LINE ดาวน์โหลดไฟล์ไม่ได้)
CSV ใส่ BOM ให้ Excel อ่านภาษาไทยถูกต้อง และกัน formula injection

## ความปลอดภัยและคุณภาพ (Phase 6)

> ต้องรัน migration `supabase/migrations/0007_rate_limits.sql` (ถ้ายังไม่รัน ตัวจำกัดอัตราจะ "ปล่อยผ่าน" และบันทึก `rate_limit_unavailable`)

- **Rate limit** (ตาราง Postgres): แชท 30 ข้อความ/นาที/คน, รูป 10/นาที, ปุ่ม 60/นาที, ล็อกอินต่อ IP 30/นาที, ส่งออก/แลกแต้ม/ลบข้อมูลจำกัดแยก — ปรับที่ `LIMITS` ใน `src/lib/rate-limit.ts`
- **Logging ปลอดข้อมูลส่วนบุคคล:** ใช้ `log` จาก `src/lib/log.ts` (ไม่มีข้อความแชท/ชื่อ/จำนวนเงิน/เลขบัญชี/user id)
- **ลบข้อมูลทั้งหมด:** หน้าตั้งค่า → 2 ขั้น + พิมพ์ข้อความยืนยัน ลบทั้งฐานข้อมูลและรูปสลิป
- **Privacy Policy / Terms:** `/privacy`, `/terms` (ฉบับร่าง ควรให้ผู้เชี่ยวชาญตรวจ; ตั้ง `NEXT_PUBLIC_CONTACT_EMAIL` ให้แสดงช่องทางติดต่อ)
- **Security headers:** nosniff, frame deny, referrer policy, HSTS, permissions policy (CSP ยังไม่เปิด — ดู [docs/DEPLOY.md](docs/DEPLOY.md))
- **ทดสอบ:** `pnpm test` (รวมทดสอบ migration + RLS + ฟังก์ชัน SQL บน Postgres จริง), `pnpm e2e` (Playwright + axe ที่ 360px)
  และ `supabase/tests/rls_check.sql` ให้รันใน Supabase SQL Editor หลังรัน migration ทุกครั้ง
- **Deploy / Rollback / แก้ปัญหา:** [docs/DEPLOY.md](docs/DEPLOY.md)

## Rich Menu

```bash
pnpm richmenu --dry-run   # สร้างภาพ assets/richmenu.png อย่างเดียว (ไม่ยิงเครือข่าย)
pnpm richmenu --replace   # สร้างเมนู อัปโหลดภาพ ตั้งเป็นค่าเริ่มต้น (ลบเมนู jodtang-main และ meetang-main เดิมก่อน)
```

สคริปต์อ่าน `LINE_CHANNEL_ACCESS_TOKEN` และ `NEXT_PUBLIC_LIFF_ID` จาก `.env.local`
(ไฟล์นี้ไม่ถูก commit) ภาพเมนู 2500×1686 สไตล์พาสเทลมิ้นต์ อยู่ใน `scripts/richmenu-design.ts`
(SVG วาดเอง — แก้ภาพ/ตำแหน่งที่ไฟล์นี้แล้วรันใหม่ ตำแหน่งปุ่มใช้ค่าเดียวกับพื้นที่กด)

| ช่อง | เมื่อกด |
|---|---|
| จดตังค์ (ช่องใหญ่) | เปิดคีย์บอร์ดพร้อมข้อความตั้งต้น + คำแนะนำสั้น ๆ จากบอท |
| สรุป / วิเคราะห์ / หมวด/งบ / รายการ / ตั้งค่า | เปิดหน้า LIFF ตามชื่อ |
| วิธีใช้งาน | ส่งข้อความ "ช่วยเหลือ" ให้บอทตอบวิธีใช้ |
| อัปเกรด | เปิดหน้า `/upgrade` (แผน Free / Professional / Ultimate) — ส่งรูปสลิปเข้าแชทได้ตามปกติ |
| ชวนเพื่อน | เปิดหน้าแชร์ของ LINE พร้อมข้อความ + ลิงก์ LIFF (ระบบ referral/โค้ดชวนจริงอยู่ Phase 5) |

## API (ต้องแนบ `Authorization: Bearer <session>`)

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/auth/liff` | แลก LIFF ID token เป็น session (1 ชม.) |
| GET | `/api/me` | โปรไฟล์/แผน/ตังสะสม |
| GET | `/api/summary?scope=cycle\|month\|day` | สรุปรายรับ/จ่าย + รายการล่าสุด |
| GET/POST | `/api/transactions` | รายการ (กรอง `type,q,from,to,categoryId`) / เพิ่มด้วยมือ |
| PATCH | `/api/transactions/:id` | แก้ไขรายการ (ชื่อ/จำนวน/ประเภท/หมวด/วันเวลา/โน้ต) ส่งเฉพาะที่เปลี่ยน; เปลี่ยนหมวดของรายการจากสลิป (Plus) จะสอนความจำร้านค้า |
| DELETE | `/api/transactions/:id` | ลบ (soft delete) |
| POST | `/api/transactions/bulk` | `{action:"delete"\|"move", ids≤100, categoryId?}` → `{updated, skipped}` (ย้ายหมวดข้ามรายการต่างประเภท) |
| GET | `/api/transactions/:id/slip` | signed URL (60 วินาที) ของรูปสลิปที่แนบ |
| GET | `/api/me` | แผนที่ใช้อยู่, สิทธิ์แต่ละฟีเจอร์, โควตาสลิป, ตังสะสม, streak, รหัสชวน |
| POST | `/api/plan/checkout` | เริ่มอัปเกรด (stub: ตอบว่ายังไม่เปิด) |
| POST | `/api/points/redeem` | แลกตังสะสมเป็นวันใช้ Plus |
| POST | `/api/referral` | ใช้รหัสชวนเพื่อน |
| GET/POST | `/api/recurring` · PATCH/DELETE `/api/recurring/:id` | รายการประจำ (สร้าง/เริ่มต่อ = Plus) |
| GET/DELETE | `/api/memory` · `/api/memory/:id` | ที่บอทจำไว้ ผู้รับ → หมวด (Plus) |
| POST | `/api/export/link` | ขอลิงก์ดาวน์โหลด CSV/XLSX (2 นาที) |
| GET | `/api/export/download?t=` | ไฟล์ส่งออก (ยืนยันด้วย token ในลิงก์) |
| GET | `/api/cron/recurring` · `/api/cron/reminders` | cron (ต้องมี `Authorization: Bearer <CRON_SECRET>`) |
| GET/PATCH | `/api/settings` | รูปแบบการ์ด, รอบงบ |
| GET/POST | `/api/categories` | หมวดที่ใช้ได้ (`?all=1` รวมที่ซ่อน) / เพิ่มหมวดของตัวเอง |
| PATCH/DELETE | `/api/categories/:id` | แก้/ซ่อน/ลบ (หมวดมาตรฐานแก้ได้เฉพาะคำค้น/ซ่อน/ลำดับ) |
| POST | `/api/categories/reorder` | เรียงลำดับหมวด |
| GET/PUT | `/api/budgets` | โหมดงบ (รวม/แยกหมวด), งบ และยอดใช้ในรอบนี้ |
| GET | `/api/analytics?view=month\|week\|day&scope=cycle\|all` | ข้อมูลกราฟแท่งและโดนัท |

`user_id` มาจาก session ที่ตรวจแล้วเท่านั้น ไม่รับจาก client

## Supabase

1. สร้างโปรเจกต์ที่ <https://supabase.com/dashboard>
2. คัดลอก URL / anon key / service role key ลง `.env.local`
   (`SUPABASE_SERVICE_ROLE_KEY` ใช้ฝั่ง server เท่านั้น)
3. ผูกและ push migration ด้วย Supabase CLI:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Migration ใน `supabase/migrations/` รันซ้ำได้ (idempotent) ทดสอบในเครื่องด้วย `supabase start` + `supabase db reset`

## Vercel

1. Import repo จาก GitHub ใน Vercel (preview ถูกสร้างให้ทุก PR อัตโนมัติ)
2. ตั้ง environment variables ทั้งหมดใน *Project Settings → Environment Variables* ตาม `.env.example`
3. `APP_BASE_URL` = โดเมน production

## โครงสร้าง

```
src/app        Next.js routes (LIFF pages + API)
src/lib        logic: env, plan, money, parse, ocr, categorize, line, supabase
src/styles     design tokens (ต้องตรงกับ docs/design-tokens.md)
supabase       config + migrations
docs           design tokens, เอกสารอื่น ๆ
```

## Roadmap

Phase 0 Setup (✓) → 1 Webhook + จดข้อความ (✓) → 2 LIFF พื้นฐาน (✓) → 3 หมวด/งบ/วิเคราะห์ (✓) →
4 สลิป OCR (✓) → 5 Plus & Extra (✓) → 6 Hardening (✓)
