import type { Metadata } from "next";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "ผลการชำระเงิน" };

const COPY: Record<string, { title: string; body: string }> = {
  success: {
    title: "ชำระเงินเรียบร้อย",
    body: "ขอบคุณที่สนับสนุนจดตังค์ แผนของคุณจะอัปเดตภายในไม่กี่วินาที (พร้อมเพย์อาจใช้เวลาสักครู่) กลับไปที่ LINE แล้วเปิดหน้าอัปเกรดหรือตั้งค่าเพื่อดูสถานะได้เลย",
  },
  cancel: {
    title: "ยกเลิกการชำระเงิน",
    body: "ยังไม่มีการตัดเงิน กลับไปที่ LINE แล้วลองเลือกแผนอีกครั้งเมื่อพร้อมได้เลย",
  },
  portal: {
    title: "บันทึกการตั้งค่าแล้ว",
    body: "กลับไปที่ LINE แล้วเปิดหน้าตั้งค่าเพื่อดูสถานะแผนล่าสุด",
  },
};

export default async function PayResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const copy = COPY[status ?? ""] ?? COPY.cancel!;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size={96} />
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="text-sm text-muted">{copy.body}</p>
    </main>
  );
}
