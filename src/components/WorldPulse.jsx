import React, { useEffect, useState } from "react";
import { Globe2, Hourglass, Zap } from "lucide-react";
import { Image } from "@/components/ui/image";
import { formatRemaining } from "@/lib/time";
import { moodSummary } from "@/lib/reactions";

const JUST_IN_MS = 60 * 60 * 1000;

// "The people's front page": the biggest world stories right now, ranked by
// how hard people are keeping them alive. Every story dies when its timer
// runs out unless someone hits it.
export default function WorldPulse({ posts, onVote, onOpen }) {
  const [now, setNow] = useState(() => Date.now());
  const [votedIds, setVotedIds] = useState(() => new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!posts.length) return null;

  const vote = async (e, post) => {
    e.stopPropagation();
    if (votedIds.has(post.id)) return;
    if (await onVote(post)) setVotedIds((prev) => new Set(prev).add(post.id));
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-cyan-300">
            <Globe2 className="h-3.5 w-3.5" /> World Pulse
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Today's biggest stories, ranked by you. Hit one to keep it alive.
          </p>
        </div>
      </div>

      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 py-1">
        {posts.map((post, i) => {
          const remaining = post.expires_at ? new Date(post.expires_at).getTime() - now : 0;
          const justIn = now - new Date(post.created_date).getTime() < JUST_IN_MS;
          const mood = moodSummary(post.reactions, 1)?.[0];
          const voted = votedIds.has(post.id);
          return (
            <button
              key={post.id}
              onClick={() => onOpen(post)}
              className="relative w-64 shrink-0 snap-start overflow-hidden rounded-xl border border-cyan-400/20 bg-[#151c28] text-left sm:w-72"
            >
              <div className="relative aspect-video">
                <Image
                  src={post.thumbnail_url || post.media_url}
                  alt={post.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
                <span className="absolute left-2 top-2 flex items-center gap-1.5">
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-black text-black">
                    #{i + 1}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wide ${
                      justIn ? "bg-red-500 text-white" : "bg-cyan-400 text-black"
                    }`}
                  >
                    {justIn ? "JUST IN" : "TOP STORY"}
                  </span>
                </span>
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-300">
                  <Hourglass className="h-3 w-3" /> {formatRemaining(remaining)}
                </span>
                <p className="absolute bottom-2 left-2 right-2 line-clamp-2 text-sm font-bold leading-snug text-white">
                  {post.title}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-[11px] text-gray-400">
                  {post.guest_author_id}
                  {mood && (
                    <span className="ml-1.5 text-gray-300">
                      · {mood.pct}% {mood.emoji}
                    </span>
                  )}
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => vote(e, post)}
                  onKeyDown={(e) => e.key === "Enter" && vote(e, post)}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition ${
                    voted
                      ? "bg-white/10 text-gray-400"
                      : "bg-gradient-to-r from-cyan-500 to-orange-500 text-black hover:brightness-110"
                  }`}
                >
                  <Zap className="h-3 w-3" /> {voted ? "Kept alive" : "Keep alive"} · {post.hits || 0}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
