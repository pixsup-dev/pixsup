import React, { useState, useEffect, useRef } from "react";
import { Image } from "@/components/ui/image";
import { Bookmark, Zap, Hourglass } from "lucide-react";
import useSavedPosts from "@/hooks/useSavedPosts";
import PostActionMenu from "@/components/PostActionMenu";
import ShareButton from "@/components/ShareButton";
import { formatRemaining } from "@/lib/time";

function heatClass(hits) {
  if (hits >= 15) return "heatmap-gold";
  if (hits >= 8) return "heatmap-orange";
  return "";
}

function Tile({ post, index, now, flipped, onOpen, onReact, isSaved, onToggleSave }) {
  const palette = [
    "🔥",
    "😂",
    ...(post.emojis && post.emojis.length ? post.emojis : ["🤯", "💀"]),
  ];
  const media = post.thumbnail_url || post.media_url;
  const remaining = post.expires_at
    ? Math.max(0, new Date(post.expires_at) - now)
    : 0;
  const timer = formatRemaining(remaining);

  const [radial, setRadial] = useState(false);
  const pressTimer = useRef(null);
  const longFired = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const startPress = (e) => {
    longFired.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longFired.current = true;
      setRadial(true);
    }, 450);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const movePress = (e) => {
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (dx * dx + dy * dy > 100) clearTimeout(pressTimer.current);
  };
  const react = (emoji) => {
    setRadial(false);
    onReact(post, emoji);
  };

  const angles = [-75, -25, 25, 75];
  const reactionEntries = post.reactions
    ? Object.entries(post.reactions).filter(([, c]) => c > 0)
    : [];

  return (
    <div
      className={`flip-card rolling-tile relative aspect-square ${heatClass(
        post.hits || 0
      )} ${flipped ? "flipped" : ""}`}
      style={{ animationDelay: `${(index % 6) * 1}s` }}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerMove={movePress}
    >
      <div className="flip-card-inner">
        <div className="flip-card-front border border-white/5 bg-[#151c28]">
          <button
            onClick={() => !longFired.current && onOpen(post)}
            className="block h-full w-full text-left"
          >
            <div className="relative h-full w-full">
              <Image
                src={media}
                alt={post.title}
                fittingType="fill"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1">
                <span className="flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold text-yellow-400">
                  <Zap className="h-2.5 w-2.5" /> {post.hits || 0}
                </span>
                <span className="flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-400">
                  <Hourglass className="h-2.5 w-2.5" /> {timer}
                </span>
                {post.isPromoted && (
                  <span className="rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-black shadow-md">
                    PROMOTED
                  </span>
                )}
              </span>
              <span className="absolute bottom-1 left-1.5 right-8 truncate text-[11px] font-semibold text-gray-200">
                {post.title || "Untitled"}
              </span>
              {reactionEntries.length > 0 && (
                <span className="absolute bottom-1 right-1.5 flex gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px]">
                  {reactionEntries.slice(0, 3).map(([em, c]) => (
                    <span key={em}>
                      {em}
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </button>
          <div className="absolute right-1.5 top-1.5 z-30">
            <PostActionMenu post={post} />
          </div>
          <ShareButton
            post={post}
            className="absolute bottom-7 right-1.5 z-20 rounded-full bg-black/70 p-1 text-gray-300 transition hover:text-cyan-300 active:scale-95"
          />
          <button
            aria-label="Save post"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(post.id);
            }}
            className="absolute bottom-[3.25rem] right-1.5 z-20 rounded-full bg-black/70 p-1 text-gray-300 transition hover:text-cyan-300 active:scale-95"
          >
            <Bookmark
              className={`h-3 w-3 ${
                isSaved ? "fill-cyan-400 text-cyan-400" : ""
              }`}
            />
          </button>
        </div>
        <div className="flip-card-back border border-cyan-400/30 bg-[#1e293b]">
          <button
            onClick={() => !longFired.current && onOpen(post)}
            className="block h-full w-full text-left"
          >
            <div className="relative h-full w-full">
              <Image
                src={media}
                alt={post.title}
                fittingType="fill"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              <span className="absolute bottom-1 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-extrabold text-cyan-300">
                ⚡ {post.hits || 0} hits
              </span>
            </div>
          </button>
        </div>
      </div>

      {radial && (
        <div
          className="absolute inset-0 z-30"
          onPointerDown={(e) => {
            e.stopPropagation();
            setRadial(false);
          }}
        >
          {palette.map((emoji, i) => {
            const rad = (angles[i] * Math.PI) / 180;
            const x = Math.sin(rad) * 52;
            const y = Math.cos(rad) * 44;
            return (
              <button
                key={emoji}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  react(emoji);
                }}
                className="spring-tap absolute bottom-3 left-1/2 z-30 rounded-full border border-cyan-400/40 bg-[#151c28]/95 p-1.5 text-sm shadow-[0_0_10px_rgba(34,211,238,0.5)] active:scale-95"
                style={{ transform: `translate(calc(-50% + ${x}px), ${-y}px)` }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PostGrid({ posts, loading, onOpen, onReact }) {
  const { isSaved, toggleSave } = useSavedPosts();
  const [now, setNow] = useState(() => Date.now());
  const [flippedIds, setFlippedIds] = useState(() => new Set());
  const [visible, setVisible] = useState(12);
  const postsRef = useRef(posts);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-flip a random tile every 4 seconds
  useEffect(() => {
    const t = setInterval(() => {
      const list = postsRef.current;
      if (!list || list.length === 0) return;
      const post = list[Math.floor(Math.random() * list.length)];
      setFlippedIds((prev) => {
        const next = new Set(prev);
        if (next.has(post.id)) next.delete(post.id);
        else next.add(post.id);
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const shown = posts.slice(0, visible);
  const tiles = shown.map((p, i) => (
    <Tile
      key={p.id}
      post={p}
      index={i}
      now={now}
      flipped={flippedIds.has(p.id)}
      onOpen={onOpen}
      onReact={onReact}
      isSaved={isSaved(p.id)}
      onToggleSave={toggleSave}
    />
  ));

  return (
    <section className="pb-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
          <Hourglass className="h-3.5 w-3.5" /> Live Rolling Feed
        </h2>
        <span className="text-[10px] text-gray-400">
          Long-press a tile to react
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="shimmer-box aspect-square rounded-xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex justify-center py-20">
          <p className="text-sm text-gray-400">No matching posts yet</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5">
            {tiles}
          </div>
          {posts.length > visible && (
            <button
              onClick={() => setVisible((v) => v + 12)}
              className="spring-tap mx-auto mt-4 block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-6 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
            >
              Load More
            </button>
          )}
        </>
      )}
    </section>
  );
}