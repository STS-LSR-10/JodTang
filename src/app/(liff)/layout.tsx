import type { ReactNode } from "react";
import { BottomNav } from "@/components/liff/bottom-nav";
import { LiffProvider } from "@/components/liff/liff-provider";

export default function LiffLayout({ children }: { children: ReactNode }) {
  return (
    <LiffProvider>
      <div className="mx-auto min-h-screen max-w-md pb-24">{children}</div>
      <BottomNav />
    </LiffProvider>
  );
}
