"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mascot } from "@/components/mascot";

/**
 * LIFF entry point (the LIFF Endpoint URL is the site root).
 *
 * `liff.line.me/<id>/budgets` opens `/?liff.state=%2Fbudgets`, and only `liff.init()` turns that
 * into the real page. So this page must initialise LIFF, then go to the deep link (or /summary
 * when there is none). A plain server redirect would drop the query string.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      const state = new URLSearchParams(window.location.search).get("liff.state");

      if (liffId) {
        try {
          const liff = (await import("@line/liff")).default;
          await liff.init({ liffId });
        } catch {
          // Not fatal: fall through to the manual redirect below.
        }
      }
      if (cancelled) return;

      // The SDK may already have rewritten the URL (without a navigation).
      const { pathname, search } = window.location;
      if (pathname !== "/") {
        window.location.replace(`${pathname}${search}`);
        return;
      }

      // Same-origin relative deep link only (guards against open redirects).
      if (state && state.startsWith("/") && !state.startsWith("//")) {
        router.replace(state);
        return;
      }
      router.replace("/summary");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <Mascot mood="smile" size={96} />
      <h1 className="text-2xl font-bold text-primary">จดตังค์ (JodTang)</h1>
      <p className="text-muted">จดง่าย เห็นเงินชัด</p>
      <p role="status" className="text-sm text-muted">
        กำลังเปิด...
      </p>
    </main>
  );
}
