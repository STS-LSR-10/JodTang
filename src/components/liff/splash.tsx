"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * How far the opening video got, kept while the app moves from one page to the next (the module stays
 * alive across in-app navigation), so the next opening screen carries on instead of starting over.
 */
let resumeAt = 0;

/**
 * Full-screen opening screen while the app signs in. The first frame of the opening video shows at
 * once (same size and place as the video, so nothing jumps); the muted video fades in over it, plays
 * once and rests on its last frame. People who asked their device for less motion keep the still
 * frame. White on purpose: the video is on white, in dark mode too.
 */
export function Splash() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // carrying on from a previous screen: no first-frame flash underneath
  const [carrying] = useState(() => resumeAt > 0);

  function onLoadedMetadata() {
    const v = video.current;
    if (!v) return;
    if (resumeAt > 0) v.currentTime = Math.min(resumeAt, v.duration);
    // already finished on the previous screen: stay on the last frame
    if (resumeAt >= v.duration - 0.1) setPlaying(true);
  }

  // Start as soon as it can play (the file is small and streams while it plays), so a slow
  // connection still sees the video, not just the still frame.
  function onCanPlay() {
    const v = video.current;
    if (!v || !v.paused || v.ended) return;
    if (resumeAt < v.duration - 0.1) void v.play().catch(() => undefined);
  }

  // the video can be ready before this page is hydrated (cached): its events are gone by then
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (v.readyState >= 1) onLoadedMetadata();
    if (v.readyState >= 3) onCanPlay();
  }, []);

  return (
    <div
      role="status"
      aria-label="กำลังเปิดแอป"
      className="fixed inset-0 z-50 flex items-center justify-center bg-white"
    >
      <div className="relative aspect-[668/720] w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/loading-poster.jpg"
          alt=""
          aria-hidden
          className={cn("absolute inset-0 h-full w-full object-contain", carrying && "opacity-0")}
        />
        <video
          ref={video}
          src="/loading.mp4"
          muted
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
          onLoadedMetadata={onLoadedMetadata}
          onCanPlay={onCanPlay}
          onPlaying={() => setPlaying(true)}
          onTimeUpdate={(e) => {
            resumeAt = e.currentTarget.currentTime;
          }}
          onEnded={(e) => {
            resumeAt = e.currentTarget.duration;
          }}
          className={cn(
            "absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-300 motion-reduce:hidden",
            playing ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
