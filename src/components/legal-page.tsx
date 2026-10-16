import Link from "next/link";
import type { ReactNode } from "react";

/** Public, login-free page shell for the policy documents. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <nav aria-label="นำทาง" className="mb-4 text-sm">
        <Link href="/" className="font-medium text-primary underline">
          กลับหน้าแรก
        </Link>
      </nav>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">อัปเดตล่าสุด {updated}</p>
      <p
        role="note"
        className="mt-4 rounded-2xl border border-accent bg-accent/10 px-4 py-3 text-sm text-foreground"
      >
        เอกสารฉบับร่างสำหรับระยะทดลองใช้
        ผู้ให้บริการควรให้ผู้เชี่ยวชาญด้านกฎหมายตรวจก่อนเปิดให้บุคคลทั่วไปใช้งานจริง
      </p>
      <div className="mt-6 space-y-6 text-base leading-relaxed">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-[15px]">{children}</div>
    </section>
  );
}

export function contactText(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL
    ? process.env.NEXT_PUBLIC_CONTACT_EMAIL
    : "[ผู้ให้บริการระบุอีเมลหรือช่องทางติดต่อที่นี่]";
}
