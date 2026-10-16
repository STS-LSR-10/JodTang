# จดตังค์ (JodTang) — สถานะโปรเจกต์และคู่มือส่งต่องาน

อัปเดตล่าสุด: 2026-10-16 · สถานะ: **Phase 0–3 เสร็จและ push แล้ว** · ถัดไป: **Phase 4 (สลิป OCR)**

เอกสารนี้ไว้ให้เซสชันใหม่ (หรือคนใหม่) อ่านแล้วทำต่อได้ทันที ไม่มีความลับใด ๆ อยู่ในไฟล์นี้
ค่า secret ทั้งหมดอยู่ใน Vercel Project Settings และ `.env.local` (ไม่ถูก commit)

---

## 1) ผลิตภัณฑ์ในประโยคเดียว

ผู้ช่วยจดรายรับรายจ่ายผ่าน **LINE Official Account**: พิมพ์ข้อความ (`กาแฟ 30`) หรือส่งสลิป
ระบบจดและจัดหมวดให้ แล้วดูสรุป/กราฟ/งบ/รายการในหน้า **LIFF** (เว็บในแอป LINE)

- ชื่อ: จดตังค์ (JodTang) — เดิมชื่อ Mee-Tang / มีตัง (เปลี่ยนชื่อแล้วเมื่อ 2026-10) · แท็กไลน์ "จดง่าย เห็นเงินชัด" · โลโก้ฟองแชท+ใบเสร็จ+เหรียญ (SVG ใน `public/logo.svg`) — ไม่มีมาสคอตตัวการ์ตูนแล้ว
- ภาษา UI/บอท: ไทย · สกุลเงิน THB · timezone Asia/Bangkok · แสดงปี พ.ศ.
- DB เก็บเวลาเป็น UTC (`timestamptz`)

### หมายเหตุการเปลี่ยนชื่อเป็น JodTang

- **เปลี่ยนในโค้ดแล้ว:** ชื่อที่แสดง (หน้าเว็บ, ข้อความส่งต่อ "จดด้วยจดตังค์"), `package.json`, `supabase/config.toml`, เอกสาร
- **ค่าภายในเปลี่ยนเป็น `jodtang` แล้ว:** `ISSUER`/`AUDIENCE` ของ session (ผู้ใช้ที่ล็อกอินอยู่จะถูกให้ล็อกอินใหม่อัตโนมัติ 1 ครั้ง ไม่มีข้อมูลหาย)
  และชื่อ Rich Menu `jodtang-main` (`pnpm richmenu --replace` ลบทั้งชื่อใหม่และ `meetang-main` เดิม — **ต้องรันใหม่ 1 ครั้ง** เพื่อให้เมนูใน LINE ใช้ชื่อใหม่)
- **ต้องเปลี่ยนเองข้างนอกโค้ด:** ชื่อ repo GitHub, ชื่อโปรเจกต์ Vercel/Supabase, ชื่อ LINE OA / channel / LIFF
  ถ้าโดเมน Vercel เปลี่ยน ต้องแก้ Webhook URL, LIFF Endpoint URL และ `APP_BASE_URL`
  (repo เปลี่ยนชื่อเป็น JodTang แล้ว)

## 2) ข้อกำหนดที่ต้องยึด (สำคัญ)

**แบรนด์/ลิขสิทธิ์** — ออกแบบใหม่ทั้งหมด ห้ามลอกบอทจดบัญชีเจ้าอื่น
- ห้ามใช้ชื่อ "ป้านวล", "หลาน", "Pro Max" หรือมาสคอต/ข้อความโปรโมตของแบรนด์อื่น
- ห้ามโทนชมพู-ส้มสด และห้ามใช้เลย์เอาต์ Rich Menu/การ์ดแบบเดียวกัน
- ภาพ/ไอคอนต้องเป็น SVG ที่สร้างเอง หรือ Lucide เท่านั้น
- ระดับสมาชิกชื่อ **Free** และ **Plus** เท่านั้น

**เงิน** — ใช้ integer สตางค์ (`src/lib/money.ts`) ห้ามใช้ float บวกลบ · DB เป็น `numeric(14,2)`

**ความปลอดภัย**
- `user_id` มาจาก session ที่ตรวจแล้วเท่านั้น ห้ามรับจาก client
- `SUPABASE_SERVICE_ROLE_KEY` ใช้ฝั่ง server เท่านั้น
- ห้ามเก็บเลขบัญชีเต็ม เก็บแค่ 4 ตัวท้าย · bucket สลิปต้อง private + signed URL
- log ต้องไม่มีข้อมูลส่วนบุคคล (ไม่ log ข้อความแชท/user id)

**แผน** — Free: จดข้อความไม่จำกัด, สลิป OCR 30 ใบ/เดือน · Plus: สลิปไม่จำกัด, กราฟเก็บออม,
จดประจำ, หลายบัญชี, จัดหมวดด้วยความจำ, แจ้งเตือนรายวัน, ส่งออกขั้นสูง
เช็คสิทธิ์จาก `src/lib/plan.ts` ที่เดียว (**ยังไม่ได้สร้าง** — Phase 5) ระบบชำระเงินเป็น stub

## 3) วิธีทำงานกับเจ้าของโปรเจกต์

- ก่อนเริ่มโค้ดแต่ละ Phase: สรุปแผนสั้น ๆ และถามเฉพาะที่จำเป็นจริง (ไม่เกิน 3 ข้อ)
- เรื่อง trade-off: เสนอ 2 ตัวเลือก พร้อมข้อแนะนำ
- commit เล็ก ๆ ข้อความภาษาอังกฤษแบบ Conventional Commits
- ห้ามสร้างฟีเจอร์นอกสโคปโดยไม่ถามก่อน
- ทำทีละ Phase แล้ว **หยุดให้รีวิว** พร้อมสรุปท้าย Phase: ทำอะไร / ยังไม่ทำ / ความเสี่ยง / สิ่งที่เจ้าของต้องตั้งค่าเอง
- ไม่ push เองโดยไม่ถาม (เจ้าของตอบ "push ได้เลย" ทุกครั้ง) และไม่กรอก secret ลงเว็บแทนเจ้าของ
- Definition of Done ทุก Phase: `pnpm lint && pnpm typecheck && pnpm test` ผ่าน, migration รันซ้ำได้,
  README อธิบายวิธีทดสอบ, UI มี loading/empty/error และใช้ดีที่ 360px, ไม่มีสิ่งที่เหมือนแบรนด์อื่น

## 4) Tech stack และโครงสร้าง

Next.js 15 (App Router) · TypeScript strict · Tailwind 3 + shadcn-style · Supabase (Postgres/RLS/Storage)
LINE Messaging API + LIFF v2 · Zod · Vitest · Recharts · Vercel · GitHub Actions
OCR/LLM ผ่าน provider interface (`AI_PROVIDER` = `gemini` (ค่าเริ่มต้น) | `anthropic` | `openai`)

```
src/app/api/line/webhook      webhook (verify, dedupe, after())
src/app/api/{auth,me,summary,transactions,categories,budgets,analytics,settings}
src/app/(liff)/{summary,analytics,budgets,transactions,settings}
src/lib/{money,thai-date,budget,budget-cycle,budget-alert,series,commands,dto,repo,env,api}.ts
src/lib/{parse,categorize,line,auth,supabase}/
src/components/{logo.tsx, liff/*}
scripts/{create-richmenu,richmenu-design}.ts   assets/richmenu.png
supabase/migrations/0001..0004
```

## 5) สถานะแต่ละ Phase

| Phase | สถานะ | เนื้อหา |
|---|---|---|
| 0 Setup | ✅ | scaffold, CI, env (Zod), design tokens, README |
| 1 Webhook + จดข้อความ | ✅ | verify signature, dedupe `webhookEventId`, follow/text/postback, parser (49 เคส), categorizer แบบกฎ, การ์ด Flex, `ลบล่าสุด`/`แก้ล่าสุด`/`สรุป…`/`ช่วยเหลือ` |
| 2 LIFF พื้นฐาน | ✅ | LIFF auth → session JWT 1 ชม., หน้า สรุป/รายการ/ตั้งค่า, แท็บล่าง 5 ปุ่ม, Rich Menu (สร้างและเผยแพร่แล้ว) |
| 3 หมวด/งบ/วิเคราะห์ | ✅ | CRUD หมวด (+ `category_overrides`), งบรวม/แยกหมวด, แจ้งเตือน 80%/100%, กราฟแท่ง/โดนัท |
| 4 สลิป OCR | ✅ (ยังไม่ทดสอบกับสลิปจริง) | LINE Content API → Storage (private) → OCR provider (gemini/anthropic/openai) → sanitize + mask → `pending_confirm` + การ์ดตรวจสลิป, กันซ้ำ hash/ref, โควตา Free 30 ใบ, เรียนรู้ผู้รับ → หมวด, ดูรูปผ่าน signed URL; `lib/plan.ts` เริ่มแล้ว (ยังไม่ gate merchant_memory) |
| 5 Plus & Extra | ⏳ | จดประจำ, แจ้งเตือนรายวัน (cron), export CSV/XLSX, ตังสะสม/referral, plan gating, payment stub |
| 6 Hardening | ⏳ | rate limit, logging, e2e (Playwright), ตรวจ RLS, a11y, Lighthouse mobile ≥ 90, เอกสาร deploy/rollback |

ทดสอบอัตโนมัติ: 180 เทสต์ (Vitest) · ตรวจแล้ว lint/typecheck/build ผ่าน

**Phase 4 — ต้องทำเองก่อนใช้:** รัน migration `0005` (bucket `slips` private) และตั้ง `AI_PROVIDER` + key
**Fallback chain (`src/lib/ocr/factory.ts`):** `easyslip` → `slip2go` → AI (`AI_PROVIDER` ก่อน แล้วตัวอื่นที่มี key)
- EasySlip v2 (`POST https://api.easyslip.com/v2/verify/bank`, multipart ฟิลด์ `image`, Bearer) — implement แล้ว
  จากเอกสารสาธารณะ (ยังไม่เคยยิงด้วย key จริง); รูปต้องไม่เกิน 4 MB และสลิปมีอายุจำกัดตามธนาคาร (7–30 วัน)
- **Slip2Go ยังไม่ implement:** เอกสาร API อยู่ในแดชบอร์ด (API Connect → วิธีใช้งาน) หลังล็อกอิน
  ผมเข้าไม่ได้และไม่เดารูปแบบคำขอ — ต้องให้เจ้าของวางเอกสาร/ตัวอย่างคำขอ-คำตอบ แล้วเพิ่ม adapter
  เป็น `src/lib/ocr/slip2go.ts` และเสียบใน `factory.ts` (ชื่อ `slip2go` ถูกจองไว้ใน `SLIP_READERS` แล้ว)
**ข้อควรรู้:** adapter ของ 3 ค่ายเขียนตามเอกสาร API และทดสอบด้วย mock เท่านั้น ยังไม่เคยยิง API จริง
(ชื่อโมเดลเริ่มต้นอยู่ใน `src/lib/ocr/provider.ts` เปลี่ยนได้ด้วย `AI_MODEL`)
`merchant_memory` ตามสเปกเป็นฟีเจอร์ Plus — ตอนนี้ยังทำงานกับทุกแผน รอ gating ใน Phase 5

## 6) สิ่งที่ตั้งค่าไว้แล้ว (ชื่อตัวแปร ไม่มีค่า)

- **Vercel (Production):** `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`,
  `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_JWT_SECRET` (≥ 32 ตัว),
  `CRON_SECRET`, `AI_PROVIDER` + key ของค่ายที่เลือก, `APP_BASE_URL`
- **LINE:** Messaging API channel (webhook → `<โดเมน>/api/line/webhook`) และ LINE Login channel
  ที่เป็นเจ้าของ LIFF (Endpoint = **ราก** `<โดเมน>` ไม่ต่อ path, scope `profile` + `openid`)
  — **ต้องอยู่ Provider เดียวกัน** · ถ้า Endpoint ต่อ `/summary` ลิงก์ `liff.line.me/<id>/budgets`
  จะกลายเป็น `/summary/budgets` และขึ้น 404 (Rich Menu พังทุกปุ่ม)
- **Supabase:** ต้องรัน migrations ตามลำดับ `0001` → `0004` (รันซ้ำได้) ผ่าน SQL Editor หรือ `supabase db push`
  - `0004` เพิ่ม `user_settings.budget_mode`, ตาราง `category_overrides`, RPC `analytics_series`
- **Rich Menu:** `pnpm richmenu --replace` (อ่าน `.env.local`) — เผยแพร่แล้ว 1 ชุดชื่อ `meetang-main` (แบบ 6 ช่องเดิม)
  ดีไซน์ใหม่ 9 ช่อง (พาสเทลมิ้นต์: จดตังค์/สรุป/วิเคราะห์/หมวด-งบ/รายการ/ตั้งค่า/วิธีใช้งาน/สแกนสลิป/ชวนเพื่อน)
  อยู่ใน repo แล้ว **แต่ต้องรัน `--replace` ใหม่** ถึงจะขึ้นใน LINE (ชื่อเมนูใหม่ `jodtang-main`)
  หมายเหตุ: Node หลัง proxy ต้องตั้ง `NODE_USE_ENV_PROXY=1`
- Repo: `stsmcp101-source/JodTang` (branch `main`) · Vercel deploy อัตโนมัติจาก push

## 7) บทเรียน / ข้อควรรู้ (เจอมาแล้ว)

- **Vercel Deployment Protection** ต้องปิด ไม่งั้น LINE เรียก webhook ได้ 401 (ตอบเป็นหน้า SSO)
  และอย่าใช้ URL เฉพาะ deployment เป็น Webhook URL ให้ใช้โดเมน Production
- **`NEXT_PUBLIC_*` ตั้งเป็น Sensitive ไม่ได้** (Vercel จะ Save ไม่ได้) — LIFF ID ไม่ใช่ความลับ
- ตัวแปรใหม่หรือแก้ค่าแล้ว **ต้อง Redeploy** ถึงมีผล
- **LIFF deep link:** `liff.line.me/<id>/budgets` เปิด Endpoint พร้อม `?liff.state=%2Fbudgets` และ
  ต้องมีหน้าที่เรียก `liff.init()` ถึงจะพาไปหน้านั้น หน้าแรก (`src/app/page.tsx`) จึงเป็น client page
  ที่ init LIFF แล้วไป deep link หรือ `/summary` — **อย่าเปลี่ยนเป็น server redirect** (ทิ้ง query)
  และ Endpoint URL ต้องเป็นราก ไม่ใช่ `/summary`
- LIFF สร้างได้เฉพาะใน **LINE Login channel** (Messaging API channel เพิ่ม LIFF ไม่ได้แล้ว)
  ตรวจ ID token ด้วย `LINE_LOGIN_CHANNEL_ID`
- Supabase project เคยมีตาราง `transactions` ของแอปอื่น ทำให้ migration `0001` ล้ม — ตรวจก่อนรันเสมอ
  (`create table if not exists` ไม่แก้ตารางชื่อซ้ำที่โครงสร้างต่างกัน)
- LINE ไม่รับ `fillInText` ว่างใน Rich Menu postback (ใช้ "ชื่อรายการ จำนวนเงิน")
- ข้อความที่มีลิงก์ถูกข้ามใน parser (เคยถูกจดเป็นรายจ่าย ฿5)
- Webhook ตอบ 200 ทันทีแล้วประมวลผลใน `after()`; ถ้าล้มจะคืน claim เพื่อให้ LINE redelivery ลองใหม่
- `loadCategories` ทนต่อกรณียังไม่ได้รัน `0004` (ไม่พัง) แต่โหมดงบ/กราฟต้องการ migration นี้
- Push message (แจ้งเตือนงบจากรายการที่จดบนเว็บ) นับโควตา OA

### สภาพแวดล้อมเครื่องพัฒนา (Windows)

- ยังไม่ได้ติดตั้ง `pnpm` แบบ global → ใช้ `npx --yes pnpm@10.34.7 <คำสั่ง>`
- Node 24 ใน proxy ของเครื่อง: `fetch` ต้องตั้ง `NODE_USE_ENV_PROXY=1` (เช่นตอนรัน `pnpm richmenu`)
- ถ้า `git` ไม่พบใน shell ใหม่ ให้โหลด PATH ใหม่ (ติดตั้งผ่าน `winget install Git.Git`)
- git identity ตั้งเฉพาะ repo นี้

## 8) ข้อจำกัดที่ยังค้าง

- ยังไม่ได้ทดสอบ LIFF ทุกหน้าที่ 360px ด้วยตาจริง/Lighthouse (หน้า วิเคราะห์ ~229 kB เพราะ Recharts)
- ปุ่ม "แก้ไข" ในการ์ดแชทแก้ได้เฉพาะรายการล่าสุดผ่านข้อความ; หน้า รายการ ยังไม่มีแก้ไขรายการ/เลือกหลายรายการ/ย้ายหมวด
- ยังไม่มี: ลบข้อมูลทั้งหมด (2 ขั้น), Privacy Policy/Terms, `lib/plan.ts`, rate limit, e2e,
  LLM categorizer (ชั้นที่ 3 ของ chain), ตังสะสม/streak, จดประจำ, ส่งออก
- แท็บ "เก็บออม" ในหน้า วิเคราะห์ เป็นหน้าล็อก Plus เท่านั้น
- Keyword แบบ substring อาจจัดผิดบ้าง (เช่น "ชา" ใน "ชาร์จ")

## 9) Phase 4 — สิ่งที่ต้องตัดสินใจ/เตรียมก่อนเริ่ม

1. **ค่ายโมเดลอ่านสลิป** (`AI_PROVIDER`): ค่าเริ่มต้น Gemini; ควรทำชุดสลิปทดสอบเล็ก ๆ เทียบคุณภาพภาษาไทย
2. **Supabase Storage:** ต้องสร้าง bucket `slips` แบบ **private** (เจ้าของสร้างเองหรือผ่าน migration/SQL)
3. **โควตา Free 30 ใบ/เดือน:** นับเฉพาะสลิปที่ OCR สำเร็จ (ที่ล้มไม่นับ) รีเซ็ตตามเดือนปฏิทิน Asia/Bangkok
4. flow ที่วางไว้: LINE Content API → Storage (private) → OCR (structured output + Zod, ตรวจ amount > 0 /
   วันที่ไม่อยู่อนาคต, mask เลขบัญชีเหลือ 4 ตัวท้ายทั้งใน `ocr_json`) → `pending_confirm` + การ์ด
   ยืนยัน/แก้ไข/ยกเลิก → กันซ้ำด้วย `slip_ref` + `image_sha256` (unique ต่อผู้ใช้) → เรียนรู้ผู้รับ → หมวด

## 10) คำสั่งที่ใช้บ่อย

```bash
npx --yes pnpm@10.34.7 install
npx --yes pnpm@10.34.7 lint
npx --yes pnpm@10.34.7 typecheck
npx --yes pnpm@10.34.7 test
npx --yes pnpm@10.34.7 build
npx --yes pnpm@10.34.7 dev            # http://localhost:3000
npx --yes pnpm@10.34.7 richmenu --dry-run
```
