"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Full-screen opening screen while the app signs in. The still logo shows at once; the muted,
 * looping logo video fades in over it as soon as it can play (and not at all for people who asked
 * their device for less motion). White on purpose: the video is on white, in dark mode too.
 */
export function Splash() {
  const [playing, setPlaying] = useState(false);
  return (
    <div
      role="status"
      aria-label="กำลังเปิดแอป"
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
    >
      <div className="relative aspect-video w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 object-contain"
        />
        <video
          src="/loading.mp4"
          poster="/logo.png"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          onCanPlay={() => setPlaying(true)}
          className={cn(
            "absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-300 motion-reduce:hidden",
            playing ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
