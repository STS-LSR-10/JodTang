# Mee-Tang (มีตัง)

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
2. สร้าง **Provider** (เช่น `Mee-Tang`)
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
- ดูว่าเจ้าไหนถูกข้ามได้ใน Vercel Logs: `slip reader skipped: <ชื่อ>: <สถานะ>`

พฤติกรรม:
- Free อ่านสลิปได้ **30 ใบ/เดือน** (นับตามเดือนปฏิทิน Asia/Bangkok, สลิปที่อ่านไม่ได้ไม่นับ) · Plus ไม่จำกัด
- กันซ้ำ 2 ชั้น: hash ของรูป (ก่อนเรียก AI จึงไม่เสียค่าใช้จ่าย) และเลขอ้างอิงของสลิป
- เก็บเลขบัญชีผู้รับแค่ **4 ตัวท้าย** (ทั้งในคอลัมน์และ `ocr_json`)
- กด `แก้ไขหมวด` แล้วเลือกหมวด → บอทจำ "ผู้รับ → หมวด" ไว้ใช้ครั้งต่อไป (`merchant_memory`)
- รูปถูกส่งไปยังผู้ให้บริการ AI ที่เลือกเพื่ออ่านข้อความ (ควรระบุใน Privacy Policy)

## Rich Menu

```bash
pnpm richmenu --dry-run   # สร้างภาพ assets/richmenu.png อย่างเดียว (ไม่ยิงเครือข่าย)
pnpm richmenu --replace   # สร้างเมนู อัปโหลดภาพ ตั้งเป็นค่าเริ่มต้น (ลบเมนู meetang-main เดิมก่อน)
```

สคริปต์อ่าน `LINE_CHANNEL_ACCESS_TOKEN` และ `NEXT_PUBLIC_LIFF_ID` จาก `.env.local`
(ไฟล์นี้ไม่ถูก commit) ช่อง `จดรายการ` เปิดคีย์บอร์ด ส่วนที่เหลือเปิด LIFF ตามหน้า

## API (ต้องแนบ `Authorization: Bearer <session>`)

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/auth/liff` | แลก LIFF ID token เป็น session (1 ชม.) |
| GET | `/api/me` | โปรไฟล์/แผน/ตังสะสม |
| GET | `/api/summary?scope=cycle\|month\|day` | สรุปรายรับ/จ่าย + รายการล่าสุด |
| GET/POST | `/api/transactions` | รายการ (กรอง `type,q,from,to,categoryId`) / เพิ่มด้วยมือ |
| DELETE | `/api/transactions/:id` | ลบ (soft delete) |
| GET | `/api/transactions/:id/slip` | signed URL (60 วินาที) ของรูปสลิปที่แนบ |
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
4 สลิป OCR (✓) → 5 Plus & Extra → 6 Hardening
