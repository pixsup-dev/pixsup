import React from "react";
import { moreEmojis } from "@/lib/reactions";

// Every other emoji, opened with "+" next to a post's usual ones. Emojis other
// people already used on this post come first, with their counts.
export default function MoreEmojis({ post, shown, onPick, className = "" }) {
  const counts = post?.reactions || {};
  return (
    <div className={`grid grid-cols-8 gap-0.5 ${className}`}>
      {moreEmojis(post, shown).map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          aria-label={`React ${e}`}
          className="relative flex h-10 items-center justify-center rounded-xl text-2xl leading-none transition hover:bg-white/10 active:scale-90 active:bg-white/10"
        >
          {e}
          {counts[e] > 0 && (
            <span className="absolute -bottom-0.5 right-0 text-[9px] font-bold tabular-nums text-gray-300">{counts[e]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
