import React, { useRef, useState } from "react";
import { Image } from "@/components/ui/image";
import { Flame, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import useGameRules from "@/hooks/useGameRules";
import { engagementScore } from "@/lib/engagement";

const hitsLabel = (n) => (n === 1 ? "1 hit" : `${n} hits`);

// Score a post needs to make the belt (matches the server's promotion rule)
const TRENDING_SCORE = 20;

// The 24-Hour Trending Belt. Until something has trended (race), it shows the
// posts closest to getting in, each with its progress toward 20 points.
export default function TrendingBelt({ posts, onVote, onOpen, race = false }) {
  const ref = useRef(null);
  const rules = useGameRules();
  const [votedIds, setVotedIds] = useState(() => new Set());

  const scrollBy = (dir) =>
    // one full row at a time; scroll-snap lands it exactly on a card
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });

  const vote = async (post) => {
    if (votedIds.has(post.id)) return;
    const updates = await onVote(post);
    if (updates) {
      setVotedIds((prev) => new Set(prev).add(post.id));
    }
  };

  const sorted = [...(posts || [])].sort(
    (a, b) =>
      (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0) ||
      engagementScore(b) - engagementScore(a)
  );

  return (
    <section className="mb-6" data-tour="belt">
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-orange-400">
            <Flame className="h-3.5 w-3.5" /> 24-Hour Trending Belt
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {race
              ? `Nothing has made it yet. ${rules.trending_points} points gets a post in for ${rules.trending_hours} hours. Closest so far:`
              : `The crowd pushed these past ${rules.trending_points} points, so they live for ${rules.trending_hours} hours.`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => scrollBy(-1)}
            className="spring-tap rounded-full border border-cyan-400/40 bg-cyan-400/10 p-1 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)] transition hover:bg-cyan-400/20 active:scale-95"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="spring-tap rounded-full border border-amber-400/40 bg-amber-400/10 p-1 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)] transition hover:bg-amber-400/20 active:scale-95"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
          Nothing trending yet — hits promote posts here.
        </p>
      ) : (
        <div className="relative">
          <div
            ref={ref}
            className="belt-row no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 py-1"
          >
            {sorted.map((post) => (
              <div
                key={post.id}
                className={`belt-card relative w-44 shrink-0 snap-start overflow-hidden rounded-xl border-2 ${
                  post.isPromoted
                    ? "border-yellow-400/80 shadow-[0_0_18px_rgba(250,204,21,0.55)]"
                    : "border-white/5"
                }`}
              >
                {post.isPromoted && (
                  <span className="absolute left-2 top-2 z-10 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black text-black">
                    PROMOTED
                  </span>
                )}
                <button onClick={() => onOpen(post)} className="block w-full text-left">
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={post.thumbnail_url || post.media_url}
                      alt={post.title}
                      fittingType="fill"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                    <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-extrabold text-yellow-400 backdrop-blur-sm">
                      <Zap className="h-2.5 w-2.5" /> {post.hits || 0}
                    </span>
                  </div>
                  <div className="p-2">
                    <span className="block truncate text-[10px] font-semibold text-gray-200">
                      {post.title || "Untitled"}
                    </span>
                    {race && (
                      <span className="mt-1.5 block">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400"
                            style={{
                              width: `${Math.min(100, (engagementScore(post) * 100) / TRENDING_SCORE)}%`,
                            }}
                          />
                        </span>
                        <span className="mt-0.5 block text-[10px] font-bold text-orange-300">
                          {Math.min(engagementScore(post), TRENDING_SCORE)}/{TRENDING_SCORE} pts to trend
                        </span>
                      </span>
                    )}
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