import React from "react";
import { Image } from "@/components/ui/image";
import { Bookmark, Zap } from "lucide-react";
import useSavedPosts from "@/hooks/useSavedPosts";

export default function ExploreTile({ post, onOpen }) {
  const { isSaved, toggleSave } = useSavedPosts();
  const media = post.thumbnail_url || post.media_url;
  return (
    <div
      onClick={() => onOpen(post)}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-white/5 bg-[#151c28] transition-transform duration-300 hover:scale-[1.03] active:scale-95"
    >
      <Image
        src={media}
        alt={post.title}
        fittingType="fill"
        className="h-full w-full"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-extrabold text-yellow-400 backdrop-blur-sm">
        <Zap className="h-2 w-2" /> {post.hits || 0}
      </span>
      <button
        aria-label="Save post"
        onClick={(e) => {
          e.stopPropagation();
          toggleSave(post.id);
        }}
        className="absolute bottom-1 right-1.5 z-10 rounded-full bg-black/60 p-1 text-gray-300 backdrop-blur-sm transition hover:text-cyan-300 active:scale-95"
      >
        <Bookmark
          className={`h-3 w-3 ${
            isSaved(post.id) ? "fill-cyan-400 text-cyan-400" : ""
          }`}
        />
      </button>
      <span className="absolute bottom-1 left-1.5 right-7 truncate text-left text-[8px] font-semibold text-gray-200">
        {post.title || "Untitled"}
      </span>
    </div>
  );
}