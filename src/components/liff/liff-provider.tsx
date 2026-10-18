"use client";

import { PinLock } from "@/components/liff/pin-lock";
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

type Status = "loading" | "ready" | "error" | "locked";

/** What the lock screen shows (from /api/pin/status). */
export interface PinInfo {
  lockedUntil: string | null;
  triesLeft: number;
  resetAt: string | null;
}

export type UnlockResult =
  { ok: true } | { ok: false; error: string; triesLeft?: number; lockedUntil?: string };

interface LiffContextValue {
  status: Status;
  error: string | null;
  /** Authenticated JSON fetch against our own /api (adds the session token, retries once on 401). */
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Open a URL in the phone's own browser (the LINE in-app browser cannot download files). */
  openExternal: (url: string) => Promise<void>;
  /** With a PIN set and not yet typed (status "locked"): what to show. */
  pin: PinInfo | null;
  /** Try the PIN; the right one opens the app for 15 minutes of use. */
  unlock: (pin: string) => Promise<UnlockResult>;
  /** Ask to remove a forgotten PIN (takes 24 hours, the owner is told in the chat). */
  requestPinReset: () => Promise<string | null>;
  cancelPinReset: () => Promise<void>;
  /** A new unlock token from setting/changing the PIN, or null after turning it off. */
  adoptUnlock: (token: string | null) => void;
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

const RELOGIN_KEY = "jodtang-liff-login-at";
const RELOGIN_WINDOW_MS = 30_000;

/**
 * Send the person to LINE to sign in again, but only once per 30 seconds. If signing in does not
 * produce a session (a server-side configuration problem, for example), looping through the login
 * redirect forever shows only a flickering page, so give up with a clear message instead.
 */
function loginOnce(liff: { login: (o: { redirectUri: string }) => void }): Promise<string> {
  try {
    const last = Number(window.sessionStorage.getItem(RELOGIN_KEY) ?? 0);
    if (Date.now() - last < RELOGIN_WINDOW_MS) {
      throw new Error(
        "เข้าสู่ระบบไม่สำเร็จ ลองปิดแล้วเปิดใหม่อีกครั้งนะ (ถ้ายังไม่ได้ แจ้งผู้ดูแล)",
      );
    }
    window.sessionStorage.setItem(RELOGIN_KEY, String(Date.now()));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("เข้าสู่ระบบ")) throw e;
    // sessionStorage unavailable: fall through to a single normal redirect
  }
  liff.login({ redirectUri: window.location.href });
  return new Promise<string>(() => undefined); // page is navigating away
}

// Test-only switch for the Playwright suite (set at build time, never in production).
// It only skips the LINE sign-in screen on the client: every /api call still needs a valid
// server-issued session, so enabling it by mistake grants no access to anything.
const E2E_MODE = process.env.NEXT_PUBLIC_E2E === "1";

export function LiffProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const inflight = useRef<Promise<string> | null>(null);
  // The PIN's unlock token lives in memory only: closing and reopening the page asks for the PIN again.
  const unlockToken = useRef<string | null>(null);
  const pinOn = useRef(false);
  const lastTouch = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const [pin, setPin] = useState<PinInfo | null>(null);

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
      if (E2E_MODE) {
        token.current = "e2e-token";
        return token.current;
      }
      if (!LIFF_ID) throw new Error("ยังไม่ได้ตั้งค่า LIFF");
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) return loginOnce(liff);
      const idToken = liff.getIDToken();
      if (!idToken) return loginOnce(liff);
      const res = await fetch("/api/auth/liff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!res.ok || !body.token) {
        // An expired ID token needs a fresh login rather than a retry.
        if (res.status === 401) return loginOnce(liff);
        throw new Error(body.error ?? "เข้าสู่ระบบไม่สำเร็จ");
      }
      token.current = body.token;
      try {
        window.sessionStorage.removeItem(RELOGIN_KEY);
      } catch {
        // ignore
      }
      return body.token;
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, []);

  /** Swap the unlock token for a fresh one. A refusal means it ran out: the next request asks for the PIN. */
  const touchUnlock = useCallback(async () => {
    const current = unlockToken.current;
    if (!current) return;
    try {
      const bearer = token.current ?? (await authenticate());
      const res = await fetch("/api/pin/touch", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "X-Unlock": current },
      });
      if (res.ok) {
        const body = (await res.json()) as { token?: string };
        if (body.token) unlockToken.current = body.token;
      }
    } catch {
      // keep what we have; the server decides
    }
  }, [authenticate]);

  /** Ask the server about the PIN. True when the app must show the lock screen. Never throws. */
  const readPinStatus = useCallback(async (): Promise<boolean> => {
    try {
      const bearer = token.current ?? (await authenticate());
      const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
      if (unlockToken.current) headers["X-Unlock"] = unlockToken.current;
      const res = await fetch("/api/pin/status", { headers });
      if (!res.ok) return false; // the server enforces the lock anyway: a failed 423 puts the screen up
      const s = (await res.json()) as {
        required?: boolean;
        unlocked?: boolean;
        lockedUntil?: string | null;
        triesLeft?: number;
        resetAt?: string | null;
      };
      pinOn.current = s.required === true;
      if (s.required && !s.unlocked) {
        unlockToken.current = null;
        setPin({
          lockedUntil: s.lockedUntil ?? null,
          triesLeft: s.triesLeft ?? 5,
          resetAt: s.resetAt ?? null,
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [authenticate]);

  useEffect(() => {
    let cancelled = false;
    authenticate()
      .then(async () => {
        if (cancelled) return;
        setStatus((await readPinStatus()) ? "locked" : "ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authenticate, readPinStatus]);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const call = async (bearer: string) => {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${bearer}`);
        if (unlockToken.current) headers.set("X-Unlock", unlockToken.current);
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
      // The server wants the PIN: forget the old unlock and put the lock screen up.
      if (res.status === 423 && !path.startsWith("/api/pin/")) {
        unlockToken.current = null;
        pinOn.current = true;
        void readPinStatus().then(() => setStatus("locked"));
      }
      if (!res.ok) throw new ApiError(body.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้งนะ", res.status);
      // Still using the app: every few minutes swap the unlock token for a fresh one (15 minutes from last use).
      if (unlockToken.current && Date.now() - lastTouch.current > 5 * 60_000) {
        lastTouch.current = Date.now();
        void touchUnlock();
      }
      return body as T;
    },
    [authenticate, readPinStatus, touchUnlock],
  );

  const unlock = useCallback(
    async (typed: string): Promise<UnlockResult> => {
      try {
        const bearer = token.current ?? (await authenticate());
        const res = await fetch("/api/pin/unlock", {
          method: "POST",
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
          body: JSON.stringify({ pin: typed }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          token?: string | null;
          error?: string;
          triesLeft?: number;
          lockedUntil?: string;
        };
        if (res.ok) {
          unlockToken.current = body.token ?? null;
          lastTouch.current = Date.now();
          setPin(null);
          setStatus("ready");
          return { ok: true };
        }
        if (body.lockedUntil || body.triesLeft !== undefined) {
          setPin((p) => ({
            lockedUntil: body.lockedUntil ?? null,
            triesLeft: body.triesLeft ?? 0,
            resetAt: p?.resetAt ?? null,
          }));
        }
        return {
          ok: false,
          error: body.error ?? "PIN ไม่ถูกต้อง",
          triesLeft: body.triesLeft,
          lockedUntil: body.lockedUntil,
        };
      } catch {
        return { ok: false, error: "ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้งนะ" };
      }
    },
    [authenticate],
  );

  const requestPinReset = useCallback(async (): Promise<string | null> => {
    const bearer = token.current ?? (await authenticate());
    const res = await fetch("/api/pin/reset", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      resetAt?: string | null;
      error?: string;
    };
    if (!res.ok) throw new Error(body.error ?? "ส่งคำขอไม่สำเร็จ");
    setPin((p) => (p ? { ...p, resetAt: body.resetAt ?? null } : p));
    return body.resetAt ?? null;
  }, [authenticate]);

  const cancelPinReset = useCallback(async () => {
    const bearer = token.current ?? (await authenticate());
    await fetch("/api/pin/reset", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bearer}` },
    });
    setPin((p) => (p ? { ...p, resetAt: null } : p));
  }, [authenticate]);

  const adoptUnlock = useCallback((fresh: string | null) => {
    unlockToken.current = fresh;
    pinOn.current = fresh !== null;
    lastTouch.current = Date.now();
  }, []);

  // Coming back after a while away asks for the PIN again (short trips to another app do not).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (pinOn.current && unlockToken.current && away > 2 * 60_000) {
        unlockToken.current = null;
        void readPinStatus().then((locked) => locked && setStatus("locked"));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [readPinStatus]);

  const openExternal = useCallback(async (url: string) => {
    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) {
        liff.openWindow({ url, external: true });
        return;
      }
    } catch {
      // fall through to a normal window
    }
    window.open(url, "_blank", "noopener");
  }, []);

  const value = useMemo(
    () => ({
      status,
      error,
      api,
      openExternal,
      pin,
      unlock,
      requestPinReset,
      cancelPinReset,
      adoptUnlock,
    }),
    [status, error, api, openExternal, pin, unlock, requestPinReset, cancelPinReset, adoptUnlock],
  );
  return (
    <LiffContext.Provider value={value}>
      {status === "locked" ? (
        <PinLock
          pin={pin}
          unlock={unlock}
          requestReset={requestPinReset}
          cancelReset={cancelPinReset}
        />
      ) : (
        children
      )}
    </LiffContext.Provider>
  );
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
    if (path === null) {
      // nothing to fetch (e.g. a locked section): not loading, no data
      setData(null);
      setLoading(false);
      return;
    }
    if (status !== "ready") return;
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
