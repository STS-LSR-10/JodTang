# คู่มือ Deploy, Rollback และแก้ปัญหา (JodTang)

เอกสารนี้ไม่มีความลับใด ๆ ค่า secret อยู่ใน Vercel / GitHub Secrets / `.env.local` เท่านั้น

## 1) ภาพรวมระบบ

```
LINE ──► Vercel (Next.js: /api/line/webhook, LIFF pages, /api/*) ──► Supabase (Postgres + Storage)
                      │                                         ▲
                      ├──► ผู้ให้บริการอ่านสลิป (EasySlip → AI)  │
Vercel Cron (รายวัน) ─┴──► /api/cron/recurring                  │
GitHub Actions (รายชั่วโมง) ──► /api/cron/reminders ─────────────┘
```

## 2) Environment variables

| ตัวแปร | ที่ตั้ง | ลับ? | หมายเหตุ |
|---|---|---|---|
| `LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | Vercel | ใช่ (secret/token) | Messaging API channel |
| `LINE_LOGIN_CHANNEL_ID` | Vercel | ไม่ | LINE Login channel ที่เป็นเจ้าของ LIFF |
| `NEXT_PUBLIC_LIFF_ID` | Vercel | ไม่ | ตั้งเป็น Sensitive ไม่ได้ (prefix `NEXT_PUBLIC_`) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | ไม่ | |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | **ใช่ (สูงมาก)** | ฝั่ง server เท่านั้น |
| `SESSION_JWT_SECRET` | Vercel | ใช่ | ≥ 32 ตัวอักษร ใช้เซ็น session และลิงก์ส่งออก |
| `CRON_SECRET` | Vercel **และ** GitHub Secrets | ใช่ | ค่าเดียวกัน 2 ที่ |
| `APP_BASE_URL` | Vercel **และ** GitHub Secrets | ไม่ | เช่น `https://jod-tang.vercel.app` |
| `AI_PROVIDER` (+ `AI_MODEL`) และ key ของค่าย | Vercel | key = ใช่ | `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `EASYSLIP_API_KEY`, `SLIP_READERS` | Vercel | key = ใช่ | ไม่บังคับ |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Vercel | ไม่ | แสดงในหน้า Privacy/Terms |

ตัวแปรใหม่หรือแก้ค่า **ต้อง Redeploy** ถึงมีผล · อย่าตั้ง `NEXT_PUBLIC_E2E` ใน production (ใช้เฉพาะชุด e2e)

## 3) ติดตั้งครั้งแรก (เรียงตามลำดับ)

1. **Supabase:** รัน migration ตามลำดับใน SQL Editor หรือ `supabase db push`
   `0001_schema` → `0002_rls` → `0003_seed_and_functions` → `0004_budget_mode_overrides_analytics` →
   `0005_slips_bucket` → `0006_points_referral_reminders` → `0007_rate_limits`
   (ทุกไฟล์รันซ้ำได้) แล้วรัน [supabase/tests/rls_check.sql](../supabase/tests/rls_check.sql) ต้องจบด้วย `RLS checks passed`
2. **LINE Developers:** Messaging API channel (ปิด Auto-reply/Greeting) + LINE Login channel + LIFF
   (Endpoint = **ราก** ของเว็บ) — ดูรายละเอียดใน [README](../README.md)
3. **Vercel:** import repo, ปิด Deployment Protection, ตั้ง env ตามตารางด้านบน, Redeploy
4. **LINE:** ตั้ง Webhook URL `https://<โดเมน>/api/line/webhook` แล้ว Verify
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
- **Migration ไม่ย้อนกลับอัตโนมัติ** กติกาของโปรเจกต์: migration ต้องเป็นแบบ *เพิ่ม* (ตาราง/คอลัมน์/ฟังก์ชันใหม่ ไม่ลบหรือเปลี่ยนชื่อของเดิม)
  เพื่อให้โค้ดรุ่นก่อนหน้ายังทำงานกับฐานข้อมูลรุ่นใหม่ได้ ถ้าจำเป็นต้องลบ/เปลี่ยนโครงสร้าง ให้ทำเป็น 2 รอบ (เพิ่มของใหม่ → ปล่อยโค้ด → ค่อยลบของเก่าใน release ถัดไป)
- **ก่อน migration ที่ทำลายข้อมูล** ให้สำรองก่อน: Supabase → Database → Backups (หรือ `pg_dump`)
- **Rich Menu:** รัน `pnpm richmenu --replace` จาก commit รุ่นที่ต้องการ หรือลบเมนูใน LINE OA Manager
- **Webhook ล้มหนัก:** ชั่วคราวปิด *Use webhook* ใน LINE Developers (ผู้ใช้จะไม่ได้คำตอบ แต่ไม่เกิดข้อมูลเสีย)

## 5.1) หมุนเวียน (rotate) secret

| Secret | วิธี | ผลกระทบ |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | Issue ใหม่ใน LINE Developers → แก้ Vercel → Redeploy | ไม่มี (token เดิมใช้ได้จนกว่าจะ revoke) |
| `SESSION_JWT_SECRET` | ตั้งค่าใหม่ → Redeploy | ผู้ใช้ที่ล็อกอินอยู่ถูกให้ล็อกอินใหม่อัตโนมัติ 1 ครั้ง |
| `CRON_SECRET` | แก้ **ทั้ง Vercel และ GitHub Secrets** → Redeploy | cron ใช้ไม่ได้ถ้าสองที่ไม่ตรงกัน |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → roll key → แก้ Vercel → Redeploy | ระบบหยุดชั่วคราวระหว่างสลับ |
| Key ของ AI / EasySlip | ออก key ใหม่ → แก้ Vercel → Redeploy | ไม่มี (chain จะข้ามเจ้าที่ล้มเอง) |

## 6) Logging และการเฝ้าระวัง

- ดู log ที่ Vercel → Project → **Logs** แต่ละบรรทัดเป็น JSON: `{"level":"error","event":"line_event_failed","message":"..."}`
- **ไม่มีข้อมูลส่วนบุคคลใน log โดยออกแบบ:** ไม่มีข้อความแชท ชื่อ จำนวนเงิน เลขบัญชี หรือ user id
  (ข้อความ error ผ่านตัวกรอง `redact` ลบ LINE id, UUID, โทเคน, อีเมล และเลขยาว) — ใช้ `log` จาก `src/lib/log.ts` เสมอ ห้ามใช้ `console.*` ตรง ๆ
- Event ที่ควรรู้จัก:

| event | ความหมาย | ทำอะไร |
|---|---|---|
| `webhook_config_error` | env ฝั่ง server ขาด/ผิด (ข้อความบอกชื่อตัวแปร) | ตรวจ env แล้ว Redeploy |
| `line_setup_failed` | เชื่อม Supabase ไม่ได้ | ตรวจ `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `line_event_failed` | ประมวลผลข้อความไม่สำเร็จ | ดู `message` (เช่น ตาราง/bucket ไม่พบ → ยังไม่รัน migration) |
| `slip_reader_skipped` | ผู้อ่านสลิปเจ้าหนึ่งล้ม → ไปเจ้าถัดไป | ถ้าเกิดบ่อย ตรวจ key/โควตาของเจ้านั้น |
| `rate_limit_unavailable` | ตัวจำกัดอัตราพัง (ระบบปล่อยผ่าน ไม่ปิดกั้น) | รัน migration `0007` |
| `budget_alert_failed` / `award_failed` | ส่วนเสริมล้ม (การจดไม่ถูกขัดขวาง) | ตรวจ migration `0004`/`0006` |
| `cron_recurring_failed` / `cron_reminders_failed` | cron ล้ม | ตรวจ `CRON_SECRET` และ DB |
| `account_deleted` | มีผู้ใช้ลบข้อมูล (นับไฟล์เท่านั้น) | ปกติ |
| `api_error` | API ตอบ 500 | ดู `message` |

- **Rate limit:** แชท 30 ข้อความ/นาที/คน, รูป 10/นาที, ปุ่ม 60/นาที (ปรับได้ที่ `LIMITS` ใน `src/lib/rate-limit.ts`)
  เกินแล้วบอทตอบเตือนครั้งเดียวต่อหน้าต่างเวลา แล้วเงียบ

## 7) แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เจอบ่อย | วิธีแก้ |
|---|---|---|
| Verify webhook ได้ 500 | env server ไม่ครบ / `SESSION_JWT_SECRET` สั้นกว่า 32 | ดู log `webhook_config_error` → แก้ env → Redeploy |
| Verify ได้ 401 จากหน้า Vercel | Deployment Protection เปิดอยู่ | ปิดที่ Settings → Deployment Protection |
| บอทเงียบ | webhook ไม่เปิด / URL ผิดโดเมน / ไม่มี event ใน log | ตรวจ Use webhook และโดเมนล่าสุด |
| เปิด LIFF แล้ว 404 | Endpoint URL ไม่ใช่ราก | ตั้งเป็น `https://<โดเมน>` (ไม่ต่อ path) |
| LIFF ขึ้น LINE 400 | LIFF ID / Endpoint / provider ไม่ตรง | ตรวจ LINE Login channel ให้อยู่ Provider เดียวกับ Messaging API |
| ส่งสลิปแล้ว "ระบบสะดุด" | bucket `slips` ไม่มี / key AI ผิด | รัน `0005`; ดู `slip_reader_skipped` |
| เตือนรายวันไม่มา | GitHub Secrets ไม่ตั้ง / ไม่ใช่ Plus / ตั้งเวลาไปแล้ว | ตรวจแท็บ Actions และสิทธิ์ Plus |
| `fetch failed` ตอนรัน `richmenu` | Node ไม่ใช้ proxy ของเครื่อง | ตั้ง `NODE_USE_ENV_PROXY=1` |

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
