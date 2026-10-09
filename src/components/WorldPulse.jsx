import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Globe2, Hourglass, Zap } from "lucide-react";
import { Image } from "@/components/ui/image";
import { formatRemaining } from "@/lib/time";
import { moodSummary } from "@/lib/reactions";
import TopComment from "@/components/TopComment";
import EmojiBurst from "@/components/EmojiBurst";

const JUST_IN_MS = 60 * 60 * 1000;
// From this many stories, wider screens show two rows (top half on the first)
const TWO_ROWS_FROM = 6;

const arrowClass =
  "spring-tap rounded-full border border-cyan-400/40 bg-cyan-400/10 p-1 text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95";

// "The people's front page": the biggest world stories right now, ranked by
// how hard people are keeping them alive. Every story dies when its timer
// runs out unless someone hits it.
export default function WorldPulse({
  posts,
  title = "World Pulse",
  topics = [],
  topic,
  onTopic,
  onVote,
  onOpen,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [votedIds, setVotedIds] = useState(() => new Set());
  const scroller = useRef(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // Arrows only when there's more to see than fits
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setCanScroll(el.scrollWidth > el.clientWidth + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.scrollLeft = 0; // a new topic starts at #1
    return () => ro.disconnect();
  }, [posts.length, topic]);

  if (!posts.length) return null;

  const scrollBy = (dir) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.8, behavior: "smooth" });
  const half = Math.ceil(posts.length / 2);
  const rows =
    posts.length >= TWO_ROWS_FROM
      ? [posts.slice(0, half).map((p, i) => [p, i]), posts.slice(half).map((p, i) => [p, half + i])]
      : [posts.map((p, i) => [p, i])];
  // Wider screens fit 2/3/4 cards across. With only a few stories the cards
  // grow to fill the row, but never wider than a third of it.
  const columns = rows[0].length;

  const vote = async (e, post) => {
    e.stopPropagation();
    if (votedIds.has(post.id)) return;
    if (await onVote(post)) setVotedIds((prev) => new Set(prev).add(post.id));
  };

  const renderCard = (post, i, wide = false) => {
    const remaining = post.expires_at ? new Date(post.expires_at).getTime() - now : 0;
    const justIn = now - new Date(post.created_date).getTime() < JUST_IN_MS;
    const mood = moodSummary(post.reactions, 1)?.[0];
    const voted = votedIds.has(post.id);
    return (
      <button
        key={post.id}
        onClick={() => onOpen(post)}
        className={`relative shrink-0 snap-start overflow-hidden rounded-xl border border-cyan-400/20 bg-[#151c28] text-left ${
          wide ? "" : "w-64"
        }`}
        style={
          wide
            ? {
                width:
                  "calc((100% - (var(--k) - 1) * 0.75rem) / var(--k))",
              }
            : undefined
        }
      >
        <div className="relative aspect-video">
          <EmojiBurst post={post} />
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
        <TopComment post={post} className="px-2 pt-2 text-[11px] text-gray-300" />
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="truncate text-[11px] text-gray-400">
            {post.guest_author_id}
            {post.poll && <span className="ml-1.5 font-bold text-violet-300">· 📊 Poll</span>}
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
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between px-1">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-cyan-300">
            <Globe2 className="h-3.5 w-3.5" /> {title}
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Today's biggest stories, ranked by you. Hit one to keep it alive.
          </p>
        </div>
        <div className={`flex shrink-0 gap-1.5 ${canScroll ? "" : "invisible"}`}>
          <button aria-label="Scroll left" onClick={() => scrollBy(-1)} className={arrowClass}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button aria-label="Scroll right" onClick={() => scrollBy(1)} className={arrowClass}>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {topics.length > 1 && (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto px-1">
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => onTopic?.(t.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                t.id === topic
                  ? "bg-cyan-400 text-black"
                  : "border border-white/10 bg-white/5 text-gray-300 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Phones: one swipeable row. Wider screens: two rows that scroll together. */}
      <div ref={scroller} className="no-scrollbar snap-x snap-mandatory overflow-x-auto px-1 py-1">
        <div
          className="hidden flex-col gap-3 [--fit:2] [--k:min(var(--fit),max(var(--cols),3))] sm:flex lg:[--fit:3] xl:[--fit:4]"
          style={{ "--cols": columns }}
        >
          {rows.map((row, r) => (
            <div key={r} className="flex gap-3">
              {row.map(([post, i]) => renderCard(post, i, true))}
            </div>
          ))}
        </div>
        <div className="flex w-max gap-3 sm:hidden">
          {posts.map((post, i) => renderCard(post, i))}
        </div>
      </div>
    </section>
  );
}
