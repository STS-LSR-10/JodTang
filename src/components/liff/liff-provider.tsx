"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Status = "loading" | "ready" | "error";

interface LiffContextValue {
  status: Status;
  error: string | null;
  /** Authenticated JSON fetch against our own /api (adds the session token, retries once on 401). */
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const LiffContext = createContext<LiffContextValue | null>(null);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

export function LiffProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const inflight = useRef<Promise<string> | null>(null);

  // Follow the device's light/dark preference (tokens define a `.dark` class).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const authenticate = useCallback(async (): Promise<string> => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      if (!LIFF_ID) throw new Error("ยังไม่ได้ตั้งค่า LIFF");
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return new Promise<string>(() => undefined); // page is navigating away
      }
      const idToken = liff.getIDToken();
      if (!idToken) {
        liff.login({ redirectUri: window.location.href });
        return new Promise<string>(() => undefined);
      }
      const res = await fetch("/api/auth/liff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        // An expired ID token needs a fresh login rather than a retry.
        if (res.status === 401) {
          liff.login({ redirectUri: window.location.href });
          return new Promise<string>(() => undefined);
        }
        throw new Error(body.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      }
      token.current = body.token;
      return body.token;
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    authenticate()
      .then(() => !cancelled && setStatus("ready"))
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authenticate]);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const call = async (bearer: string) => {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${bearer}`);
        if (init.body && !headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }
        return fetch(path, { ...init, headers });
      };

      let res = await call(token.current ?? (await authenticate()));
      if (res.status === 401) {
        token.current = null;
        res = await call(await authenticate());
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new ApiError(body.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ", res.status);
      return body as T;
    },
    [authenticate],
  );

  const value = useMemo(() => ({ status, error, api }), [status, error, api]);
  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}

export function useLiff(): LiffContextValue {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error("useLiff must be used inside <LiffProvider>");
  return ctx;
}

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** GET `path` once the session is ready; refetches when `path` changes or reload() is called. */
export function useApi<T>(path: string | null): ApiState<T> {
  const { status, api, error: authError } = useLiff();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status === "error") {
      setError(authError ?? "เข้าสู่ระบบไม่สำเร็จ");
      setLoading(false);
      return;
    }
    if (status !== "ready" || path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, api, path, tick, authError]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}
