import { Lock } from "lucide-react";

/** Shown inside a section whose feature needs Plus. */
export function PlusLock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-primary-soft px-3 py-2 text-sm text-primary">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">สำหรับแผน Plus</span> · {children} (แลกวัน Plus
        ด้วยตังสะสมได้ที่การ์ดแผนด้านบน)
      </p>
    </div>
  );
}
