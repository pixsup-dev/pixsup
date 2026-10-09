import React from "react";
import { Image } from "@/components/ui/image";
import { Bookmark, Hourglass, Zap } from "lucide-react";
import useSavedPosts from "@/hooks/useSavedPosts";
import EmojiBurst from "@/components/EmojiBurst";
import LastBreath, { inLastBreath } from "@/components/LastBreath";
import { formatRemaining } from "@/lib/time";

const DYING_MS = 10 * 60 * 1000;

// One Explore mosaic tile; `big` tiles span 2×2 and show the title larger
export default function ExploreTile({ post, now, big = false, onOpen }) {
  const { isSaved, toggleSave } = useSavedPosts();
  const media = post.thumbnail_url || post.media_url;
  const remaining = post.expires_at ? Math.max(0, new Date(post.expires_at).getTime() - now) : 0;
  const dying = !post.is_trending && remaining < DYING_MS;

  return (
    <div
      onClick={() => onOpen(post)}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-[#151c28] ${
        big ? "col-span-2 row-span-2" : "aspect-square"
      } ${dying ? "border-red-500/60" : post.isNews ? "news-tile" : "border-white/5"} ${
        inLastBreath(post, remaining) ? "last-breath" : ""
      }`}
    >
      <Image
        src={media}
        alt={post.title}
        fittingType="fill"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30" />
      <EmojiBurst post={post} size={big ? "text-3xl" : "text-xl"} />
      {inLastBreath(post, remaining) && <LastBreath remaining={remaining} big={big} />}

      <span className="absolute left-1.5 top-1.5 flex items-center gap-1">
        <span
          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
            dying ? "animate-pulse bg-red-600 text-white" : "bg-black/70 text-orange-300"
          }`}
        >
          <Hourglass className="h-2.5 w-2.5" /> {formatRemaining(remaining)}
        </span>
        {post.is_trending && (
          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black text-black">🔥</span>
        )}
      </span>
      <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold text-yellow-400">
        <Zap className="h-2.5 w-2.5" /> {post.hits || 0}
      </span>

      <span className="absolute bottom-1.5 left-2 right-8 text-left">
        <span
          className={`block font-bold text-white ${
            big ? "line-clamp-2 text-sm leading-snug" : "truncate text-[10px]"
          }`}
        >
          {post.title || "Untitled"}
        </span>
        {big && (
          <span className="mt-0.5 block truncate text-[10px] text-gray-300">
            {post.isNews ? post.guest_author_id : "Community post"}
          </span>
        )}
      </span>
      <button
        aria-label="Save post"
        onClick={(e) => {
          e.stopPropagation();
          toggleSave(post.id);
        }}
        className="absolute bottom-1.5 right-1.5 z-30 rounded-full bg-black/70 p-1 text-gray-300 transition hover:text-cyan-300 active:scale-95"
      >
        <Bookmark className={`h-3 w-3 ${isSaved(post.id) ? "fill-cyan-400 text-cyan-400" : ""}`} />
      </button>
    </div>
  );
}
