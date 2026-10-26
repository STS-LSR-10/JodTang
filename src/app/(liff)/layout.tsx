import type { ReactNode } from "react";
import { BottomNav } from "@/components/liff/bottom-nav";
import { LiffProvider } from "@/components/liff/liff-provider";
import { ThemeScope } from "@/components/liff/theme-scope";

export default function LiffLayout({ children }: { children: ReactNode }) {
  return (
    <LiffProvider>
      <ThemeScope />
      <div className="mx-auto min-h-screen max-w-md pb-24">{children}</div>
      <BottomNav />
    </LiffProvider>
  );
}
