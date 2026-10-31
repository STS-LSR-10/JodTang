# แผนย้ายโฮสติ้งจาก Vercel ไป Cloudflare (เตรียมไว้ ยังไม่ย้าย)

**สถานะ (ต.ค. 2569):** ยังอยู่ Vercel · ระบบยังพัฒนาอยู่ จึงยังไม่ย้าย · โค้ดถูกเตรียมให้ย้ายได้โดยไม่ต้องแก้แอป

## 0) ตัดสินใจเมื่อไหร่

- **ก่อนเปิดรับเงินจริง (สลับ Stripe เป็น live) อย่างน้อย 2–3 สัปดาห์** ต้องเลือกอย่างใดอย่างหนึ่ง เพราะ Vercel Hobby ใช้ได้เฉพาะงานที่ไม่ใช่เชิงพาณิชย์
  - **ทาง A — Vercel Pro** ($20/เดือน): ไม่ต้องย้าย ไม่ต้องแก้โค้ด เสี่ยงต่ำสุด
  - **ทาง B — Cloudflare Workers Paid** ($5/เดือน): ถูกกว่า ต้องย้ายตามแผนข้างล่าง
- ถ้าถึงวันตัดสินใจแล้วยังไม่แน่ใจ ใช้ทาง A เดือนแรกไปก่อน แล้วย้ายทีหลังได้ (โค้ดพร้อมย้ายอยู่แล้ว)
- ไม่แนะนำ Netlify: ไม่ถูกกว่า Cloudflare, ใช้เครดิตรายเดือนและเว็บอาจถูกพักเมื่อเครดิตหมด, เงื่อนไขใช้เชิงพาณิชย์ในแผนฟรียังไม่ยืนยัน

## 1) สิ่งที่เตรียมไว้แล้ว

| เรื่อง                       | สถานะ                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ตัวตั้งเวลา (cron)           | ✅ อยู่ที่ GitHub Actions ทั้งหมด (`.github/workflows/cron.yml`, ทุกชั่วโมง: จดรายการประจำ + เตือน/สรุป) ไม่มี Vercel Cron แล้ว ย้ายโฮสต์ได้โดยแก้แค่ secret `APP_BASE_URL`                                                                                       |
| ไม่ผูกกับ Vercel             | ✅ ไม่มี `@vercel/*`, ไม่อ่าน `VERCEL_*`, ไม่มี route แบบ edge-only (มีเทสต์ `src/portability.test.ts` กันไม่ให้หลุดเข้ามา)                                                                                                                                       |
| โมดูล Node ที่ใช้            | ✅ ใช้เฉพาะ `node:crypto` (ลายเซ็น LINE/Stripe, rate limit) เทสต์เดียวกันกัน import `fs`/`path`/`zlib`/ฯลฯ ที่ Workers ไม่รองรับ                                                                                                                                  |
| ทดลองบน workerd จริง (local) | ✅ ผ่านบน Cloudflare Workers runtime ในเครื่อง (`wrangler dev --local`, `nodejs_compat`): `createHash`, `createHmac`, `timingSafeEqual`, `randomBytes`, **`scrypt` (N=16384, r=8, p=1)**, สร้างไฟล์ Excel ด้วย `exceljs`, `jose` (HS256), `@supabase/supabase-js` |
| endpoint ตั้งเวลา            | ✅ เรียกซ้ำได้ปลอดภัย (จดประจำถูกจองครั้งเดียวต่อวันครบกำหนด และตามให้ครบถ้าพลาดรอบ)                                                                                                                                                                              |

## 2) สิ่งที่ยังไม่รู้ (ต้องวัดตอนย้ายจริง)

- **เวลา CPU ต่อคำขอ:** แผนฟรีจำกัด 10 ms (แผน Paid ให้ 30 วินาที) เดิมตัวที่เสี่ยงคือ scrypt ของ PIN ซึ่งลบออกแล้ว เหลือส่งออก Excel และการอ่านไฟล์ PDF/ภาพ ที่ต้องวัดตอนทดลองจริง
- **ขนาดโค้ดหลังบิลด์ด้วย OpenNext:** Next 15 + `exceljs` มักเกินลิมิตแผนฟรี (3 MB บีบอัด) แผน Paid ให้ราว 15 MB (เช็กหน้า Limits ล่าสุดก่อน)
- **ความเข้ากันของ OpenNext กับเวอร์ชัน Next ที่ใช้อยู่** ตอนบิลด์จริง (ทดสอบตอนย้าย ไม่ใช่ตอนนี้)

## 3) ขั้นตอนย้าย (ทำตอนตัดสินใจเลือกทาง B)

**ผมทำให้ (โค้ด):**

1. เพิ่ม `@opennextjs/cloudflare` + `wrangler`, `wrangler.jsonc` (`nodejs_compat`, compatibility date ล่าสุด), `open-next.config.ts`, สคริปต์ `cf:preview` / `cf:deploy`, `.dev.vars.example`
2. รัน `opennextjs-cloudflare preview` ในเครื่อง ทดสอบ: บิลด์ผ่าน ขนาดไม่เกินลิมิต, LINE/Stripe webhook ลายเซ็นผ่าน, ส่งออก Excel
3. ปรับ CI ให้ตรวจว่าบิลด์สำหรับ Cloudflare ผ่านทุกครั้ง · อัปเดต `docs/DEPLOY.md`
4. (ถ้าต้องการ) ย้ายตัวตั้งเวลาไป Cloudflare Cron Triggers แทน GitHub Actions

**คุณทำเอง (ผมทำแทนไม่ได้):**

1. สมัคร Cloudflare + **Workers Paid** · (ถ้ามีโดเมน ผูกโดเมนกับ Cloudflare)
2. ผูก GitHub repo ใน Workers Builds (หรือสร้าง API token ถ้าใช้ GitHub Actions deploy)
3. ใส่ secrets ทั้งหมดเอง (ชื่อด้านล่าง) ด้วย `wrangler secret put` หรือแดชบอร์ด — **อย่าส่งค่าในแชท**
4. ตอนสลับ: เปลี่ยน URL ที่ LINE (Webhook + LIFF Endpoint), Stripe (Webhook), env `APP_BASE_URL` และ GitHub secret `APP_BASE_URL`

**ชื่อ secrets/ตัวแปรที่ต้องย้ายไปด้วย:** `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_JWT_SECRET`, `CRON_SECRET`, `APP_BASE_URL`, `AI_PROVIDER` (+ `AI_MODEL`) และ key ของค่าย AI, `EASYSLIP_API_KEY`, `SLIP_READERS`, `NEXT_PUBLIC_CONTACT_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` · ตัวแปร `NEXT_PUBLIC_*` ต้องมีตอน **บิลด์** ด้วย (ไม่ใช่แค่ตอนรัน)

**ลำดับสลับ (ไม่หยุดบริการ):**

1. deploy ขึ้น Cloudflare ที่ URL ชั่วคราว (`*.workers.dev`) ใส่ secrets ตรวจตาม `docs/LINE-TEST-CHECKLIST.md`
2. เปลี่ยน URL ที่ LINE → Stripe → GitHub secret `APP_BASE_URL` → ทดสอบบนมือถือ
3. เก็บ Vercel ไว้อย่างน้อย 1 สัปดาห์เป็นทางย้อนกลับ (ย้อน = เปลี่ยน URL กลับ) แล้วค่อยปิด

**หมายเหตุ:** ระบบ PIN ถูกลบออกแล้ว (migration 0045) จึงไม่มี scrypt ที่กิน CPU อีก ส่วน `SESSION_JWT_SECRET` ยังต้องใช้ค่าเดิมเพื่อให้ session และลิงก์ส่งออกที่ออกไปแล้วยังใช้ได้

## 4) ผลทดลองบิลด์จริง (31 ต.ค. 2569, branch `cloudflare-trial`)

- `pnpm cf:build` ผ่าน (OpenNext 1.20.15 + Next 15.5.28) · ขนาดที่ wrangler รายงาน: **13.2 MB ไม่บีบอัด / 2.6 MB บีบอัด** (ลิมิตแผนฟรี 3 MB บีบอัด)
- ทดสอบ `cf:preview` บน workerd ในเครื่อง: หน้าเว็บ/ไฟล์ static ตอบ 200 · LINE webhook ลายเซ็นผิด 401 / ถูก 200 · cron ไม่มี secret 401 · PDF และ Excel สร้างได้
- ต้องมี `cf-polyfill.mjs` (ตอบ `process.umask()`) เพราะไลบรารีส่งออกเรียกตอนโหลดแล้ว Workers ตอบ not implemented · `wrangler.jsonc` ชี้ `main` ไปที่ `cf-worker.mjs` ซึ่งโหลด polyfill ก่อน
- รัน `pnpm cf:build` ต้องมี `pnpm` อยู่ใน PATH (OpenNext เรียก `pnpm build` เอง)
