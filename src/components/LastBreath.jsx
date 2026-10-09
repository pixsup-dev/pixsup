import React from "react";

export const LAST_BREATH_MS = 60 * 1000;

// True in a post's final minute (trending posts are safe for 24h)
export const inLastBreath = (post, remaining) =>
  !post?.is_trending && remaining > 0 && remaining <= LAST_BREATH_MS;

// The big centred countdown over a post in its final minute
export default function LastBreath({ remaining, big = false }) {
  const s = Math.ceil(remaining / 1000);
  return (
    <span className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-950/30">
      <span className={`font-mono font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ${big ? "text-6xl" : "text-2xl"}`}>
        0:{String(s).padStart(2, "0")}
      </span>
      <span className={`mt-0.5 rounded-full bg-red-600 px-2 py-0.5 font-black uppercase tracking-wider text-white ${big ? "text-xs" : "text-[9px]"}`}>
        Save me!
      </span>
    </span>
  );
}
