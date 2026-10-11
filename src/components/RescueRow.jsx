import React, { useEffect, useState } from "react";
import { Siren, Zap } from "lucide-react";
import { Image } from "@/components/ui/image";
import { formatRemaining } from "@/lib/time";
import LastBreath, { inLastBreath } from "@/components/LastBreath";
import RowArrows, { useRowScroll } from "@/components/RowArrows";
import useGameRules from "@/hooks/useGameRules";

const hoursLabel = (m) => (m % 60 === 0 ? (m === 60 ? "a full hour" : `${m / 60} hours`) : `${m} minutes`);

const DYING_MS = 10 * 60 * 1000;
const CRITICAL_MS = 2 * 60 * 1000;

// "About to die": posts with under 10 minutes left, soonest first. One tap
// rescues them: the timer goes back to a full hour (Admin setting) and the
// post shows "Saved by @you".
export default function RescueRow({ posts, user, onVote, onOpen, onSignIn }) {
  const [now, setNow] = useState(() => Date.now());
  const rules = useGameRules();
  const [rescuedIds, setRescuedIds] = useState(() => new Set());
  const row = useRowScroll();

  useEffect(() => {
    const t = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const dying = posts
    .map((p) => ({ post: p, remaining: new Date(p.expires_at).getTime() - now }))
    .filter(({ post, remaining }) => !post.is_trending && remaining > 0 && remaining < DYING_MS)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 8);

  if (!dying.length) return null;

  const rescue = async (e, post) => {
    e.stopPropagation();
    if (!user) return onSignIn();
    if (rescuedIds.has(post.id)) return;
    if (await onVote(post)) setRescuedIds((prev) => new Set(prev).add(post.id));
  };

  return (
    <section id="rescue-row" className="mb-6 scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
            <Siren className="h-3.5 w-3.5" /> About to die
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            These vanish in minutes. Save one and it gets {hoursLabel(rules.rescue_minutes)} back, with your name on it.
          </p>
        </div>
        <RowArrows row={row} />
      </div>

      <div ref={row.ref} className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 py-1">
        {dying.map(({ post, remaining }) => {
          const critical = remaining < CRITICAL_MS;
          const rescued = rescuedIds.has(post.id);
          return (
            <button
              key={post.id}
              onClick={() => onOpen(post)}
              className={`relative w-36 shrink-0 snap-start overflow-hidden rounded-xl border bg-[#151c28] text-left sm:w-40 ${
                critical ? "border-red-500/70" : "border-red-500/30"
              } ${inLastBreath(post, remaining) ? "last-breath" : ""}`}
            >
              <div className="relative aspect-square">
                {inLastBreath(post, remaining) && <LastBreath remaining={remaining} />}
                <Image
                  src={post.thumbnail_url || post.media_url}
                  alt={post.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/40" />
                <span
                  className={`absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-red-600 px-2.5 py-0.5 font-mono text-sm font-black text-white ${
                    critical ? "animate-pulse" : ""
                  }`}
                >
                  {formatRemaining(remaining)}
                </span>
                {post.saved_by_name && (
                  <span className="absolute left-1.5 top-9 max-w-[90%] truncate rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">
                    🦸 Saved by @{post.saved_by_name}
                  </span>
                )}
                <p className="absolute bottom-1.5 left-2 right-2 line-clamp-2 text-[11px] font-semibold leading-snug text-white">
                  {post.title || "Untitled"}
                </p>
              </div>
              <div className="p-1.5">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => rescue(e, post)}
                  onKeyDown={(e) => e.key === "Enter" && rescue(e, post)}
                  className={`flex w-full items-center justify-center gap-1 rounded-full py-1.5 text-[11px] font-extrabold transition ${
                    rescued
                      ? "bg-white/10 text-gray-400"
                      : "bg-red-600 text-white hover:bg-red-500 active:scale-95"
                  }`}
                >
                  <Zap className="h-3 w-3" /> {rescued ? "Rescued!" : "Rescue"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
