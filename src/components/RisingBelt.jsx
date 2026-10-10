import React, { useRef, useState } from "react";
import { Image } from "@/components/ui/image";
import { Zap, ChevronLeft, ChevronRight } from "lucide-react";

const hitsLabel = (n) => (n === 1 ? "1 hit" : `${n} hits`);

// 🚀 Almost trending: posts in the top half of the way to the 24-hour belt
// (with trending at 10 points, posts at 5-9), so people can push them over
export default function RisingBelt({ posts, onVote, onOpen, from, to }) {
  const ref = useRef(null);
  const [votedIds, setVotedIds] = useState(() => new Set());

  const scrollBy = (dir) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });

  const vote = async (post) => {
    if (votedIds.has(post.id)) return;
    const updates = await onVote(post);
    if (updates) {
      setVotedIds((prev) => new Set(prev).add(post.id));
    }
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
            🚀 Almost trending
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {from}–{to - 1} points. {to} gets them onto the 24-hour belt. Push one over!
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => scrollBy(-1)}
            className="spring-tap rounded-full border border-cyan-400/40 bg-cyan-400/10 p-1 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)] transition hover:bg-cyan-400/20 active:scale-95"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="spring-tap rounded-full border border-cyan-400/40 bg-cyan-400/10 p-1 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)] transition hover:bg-cyan-400/20 active:scale-95"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
          Nothing close yet. Posts with {from}+ points appear here.
        </p>
      ) : (
        <div className="relative">
          <div
            ref={ref}
            className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 py-1"
          >
            {posts.map((post) => (
              <div
                key={post.id}
                className="relative w-44 shrink-0 snap-start overflow-hidden rounded-xl border border-cyan-400/20 bg-[#151c28] sm:w-56"
              >
                <span className="absolute left-2 top-2 z-10 rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-black text-black">
                  RISING
                </span>
                <button onClick={() => onOpen(post)} className="block w-full text-left">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={post.thumbnail_url || post.media_url}
                      alt={post.title}
                      fittingType="fill"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                    <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-extrabold text-cyan-300 backdrop-blur-sm">
                      <Zap className="h-2.5 w-2.5" /> {post.hits || 0}
                    </span>
                  </div>
                  <div className="p-2">
                    <span className="block truncate text-[10px] font-semibold text-gray-200">
                      {post.title || "Untitled"}
                    </span>
                  </div>
                </button>
                <div className="px-2 pb-2">
                  <button
                    onClick={() => vote(post)}
                    disabled={votedIds.has(post.id)}
                    className="spring-tap w-full rounded-lg border border-cyan-400/30 bg-cyan-400/10 py-1 text-[10px] font-extrabold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95 disabled:opacity-50"
                  >
                    ⚡ {hitsLabel(post.hits || 0)}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-[#0b0f17] to-transparent" />
          <div className="pointer-events-none absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-[#0b0f17] to-transparent" />
        </div>
      )}
    </section>
  );
}