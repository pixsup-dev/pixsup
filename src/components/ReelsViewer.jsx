import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, MessageCircle, Share2, ExternalLink, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { useMembers } from "@/hooks/useUsernames";
import Avatar from "@/components/Avatar";
import ShareButton from "@/components/ShareButton";
import WatchButton from "@/components/WatchButton";
import { PostCard } from "@/components/PostDetail";
import { reactionPalette } from "@/lib/reactions";
import { isBreaking } from "@/lib/breaking";

// Reels mode (phones): one post per screen, swiped like a feed. The browser's
// own scroll-snap does the swiping, so a post follows your finger and glides
// into place. A life bar across the top drains as the post runs out of time.

const HOUR = 60 * 60 * 1000;
const HINT_KEY = "pixsup_swipe_hint";
const WINDOW = 2; // photos kept loaded either side of the one on screen

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

// How full the life bar is: against a day for trending posts, 6 hours for
// news, an hour for everything else (a post kept alive past that stays full)
function life(post, now) {
  const left = post.expires_at ? new Date(post.expires_at).getTime() - now : HOUR;
  const span = post.is_trending ? 24 * HOUR : post.isNews ? 6 * HOUR : HOUR;
  return { left, pct: Math.max(0, Math.min(1, left / span)) };
}

function lifeColor(post, left, pct) {
  if (left <= 60 * 1000) return "bg-red-500";
  if (post.is_trending) return "bg-gradient-to-r from-yellow-300 to-orange-400";
  if (left < 5 * 60 * 1000 || pct < 0.2) return "bg-red-500";
  if (pct < 0.5) return "bg-orange-400";
  return "bg-gradient-to-r from-cyan-400 to-orange-400";
}

function Reel({ post, active, near, now, author, user, voted, onHit, onReact, onComments, onSignIn }) {
  const [fan, setFan] = useState(false);
  const { left, pct } = life(post, now);
  const dead = left <= 0;
  const lastBreath = !dead && left <= 60 * 1000;
  const palette = reactionPalette(post);
  const reactions = Object.values(post.reactions || {}).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!active) setFan(false);
  }, [active]);

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden bg-black">
      {near && (
        <>
          <img
            src={post.thumbnail_url || post.media_url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
          />
          {post.media_type === "video" && active ? (
            <video
              src={post.media_url}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <img src={post.media_url} alt={post.title} decoding="async" className="absolute inset-0 h-full w-full object-contain" />
          )}
        </>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-black/50" />

      {/* Life bar */}
      <div className="absolute inset-x-0 top-0 z-10 h-1.5 bg-white/15" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div
          className={`h-full transition-[width] duration-500 ease-out ${lifeColor(post, left, pct)} ${lastBreath ? "animate-pulse" : ""}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>

      {dead && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <p className="rounded-full bg-black/70 px-4 py-2 text-sm font-black text-gray-200">💀 This post just died</p>
        </div>
      )}

      {/* What the post is */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-4 right-20 z-10 space-y-2 text-white">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums ${
              lastBreath ? "animate-pulse border-red-500 bg-red-600/80" : "border-orange-400/60 bg-black/55"
            }`}
          >
            ⏳ {mmss(left)}
          </span>
          {isBreaking(post, now) && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">● Breaking</span>
          )}
          {post.is_trending && (
            <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">🔥 Trending</span>
          )}
          {post.revived_at && (
            <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">🧟 Revived</span>
          )}
        </div>

        {post.isNews ? (
          <p className="text-xs font-bold text-cyan-200">{post.guest_author_id || "News"}</p>
        ) : author ? (
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <Avatar url={author.avatar_url} name={author.username} size={26} />@{author.username}
            {post.city && <span className="text-xs font-semibold text-gray-300">· 📍 {post.city}</span>}
          </p>
        ) : null}

        <p className="text-[17px] font-extrabold leading-snug [text-shadow:0_1px_8px_rgba(0,0,0,0.7)] [text-wrap:balance]">
          {post.title || "Untitled"}
        </p>
        {post.isNews && post.summary && <p className="line-clamp-2 text-xs text-gray-200">{post.summary}</p>}
        {post.saved_by_name && <p className="text-xs font-bold text-yellow-300">🦸 Saved by @{post.saved_by_name}</p>}
        {!post.isNews && post.hashtags?.length > 0 && (
          <p className="flex flex-wrap gap-2 text-xs font-semibold text-cyan-200">
            {post.hashtags.slice(0, 4).map((h) => (
              <span key={h}>{h}</span>
            ))}
          </p>
        )}
        {post.isNews && (
          <div className="flex gap-2 pt-1">
            {post.source_url && (
              <a
                href={post.source_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Read
              </a>
            )}
            <button
              onClick={() => onComments(post)}
              className="flex items-center gap-1 rounded-full bg-violet-500/80 px-3 py-1.5 text-xs font-bold backdrop-blur"
            >
              <Sparkles className="h-3.5 w-3.5" /> Explain
            </button>
          </div>
        )}
      </div>

      {/* Emoji bar: big, centred, each with its count; tap outside to close */}
      <AnimatePresence>
        {fan && (
          <motion.div
            key="fan"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFan(false)}
            className="absolute inset-0 z-30 flex items-start justify-center bg-black/60 px-4 pt-[32%]"
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-3xl border border-white/15 bg-[#151c28]/95 px-3 py-3 shadow-2xl backdrop-blur"
            >
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">
                React · +3 min
              </p>
              <div className="flex gap-1">
                {palette.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setFan(false);
                      onReact(post, e);
                    }}
                    className="flex w-14 flex-col items-center gap-1 rounded-2xl py-1.5 transition active:scale-90 active:bg-white/10"
                  >
                    <span className="text-[32px] leading-none">{e}</span>
                    <span className="text-[11px] font-bold tabular-nums text-gray-300">{(post.reactions || {})[e] || 0}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions, under your thumb */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-2.5 z-20 flex flex-col items-center gap-3.5 text-white">
        <button
          onClick={() => onHit(post)}
          disabled={dead}
          aria-label={lastBreath ? "Save this post" : "Hit: 5 more minutes"}
          className="flex flex-col items-center gap-1 text-[11px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] disabled:opacity-40"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-90 ${
              voted ? "border border-white/20 bg-white/15" : lastBreath ? "animate-pulse bg-red-500" : "bg-gradient-to-br from-cyan-400 to-orange-500 text-black"
            }`}
          >
            {lastBreath && !voted ? <span className="text-[11px] font-black">SAVE</span> : <Zap className="h-6 w-6" fill="currentColor" />}
          </span>
          {post.hits || 0}
        </button>

        <div className="relative">
          <button
            onClick={() => (user ? setFan((f) => !f) : onSignIn?.())}
            disabled={dead}
            aria-label="React with an emoji"
            className="flex flex-col items-center gap-1 text-[11px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] disabled:opacity-40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-2xl backdrop-blur active:scale-90">
              {palette[0]}
            </span>
            {reactions}
          </button>
        </div>

        <button
          onClick={() => onComments(post)}
          aria-label="Comments and more"
          className="flex flex-col items-center gap-1 text-[11px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 backdrop-blur active:scale-90">
            <MessageCircle className="h-6 w-6" />
          </span>
          {post.comment_count || 0}
        </button>

        <div className="flex flex-col items-center gap-1 text-[11px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
          <WatchButton
            post={post}
            user={user}
            onSignIn={onSignIn}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 backdrop-blur active:scale-90 [&_svg]:h-6 [&_svg]:w-6"
          />
          {user && post.created_by_id !== user.id ? "Watch" : ""}
        </div>

        <ShareButton post={post} className="flex flex-col items-center gap-1 text-[11px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 backdrop-blur active:scale-90">
            <Share2 className="h-5 w-5" />
          </span>
          Share
        </ShareButton>
      </div>
    </section>
  );
}

export default function ReelsViewer({ post, list, onClose, onVote, onReact, onSignIn, onNavigate }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const feed = useRef(null);
  const items = list?.some((p) => p.id === post.id) ? list : [post];
  const startIdx = Math.max(0, items.findIndex((p) => p.id === post.id));
  const [idx, setIdx] = useState(startIdx);
  const [now, setNow] = useState(() => Date.now());
  const [voted, setVoted] = useState(() => new Set());
  const [local, setLocal] = useState({}); // instant updates from this person's own taps
  const [sheet, setSheet] = useState(null); // post id with the comments panel open
  const [floats, setFloats] = useState([]);
  const [hint, setHint] = useState(() => {
    try {
      return Number(localStorage.getItem(HINT_KEY) || 0) < 3;
    } catch {
      return false;
    }
  });

  const live = (p) => ({ ...p, ...(local[p.id] || {}) });
  const members = useMembers(
    items.slice(Math.max(0, idx - WINDOW), idx + WINDOW + 1).filter((p) => !p.isNews).map((p) => p.created_by_id)
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Open at the post that was tapped
  useLayoutEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = startIdx * el.clientHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    const el = feed.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== idx && items[i]) {
      setIdx(i);
      onNavigate?.(items[i]);
      if (hint) {
        setHint(false);
        try {
          localStorage.setItem(HINT_KEY, "3");
        } catch {
          // fine
        }
      }
    }
  }, [idx, items, onNavigate, hint]);

  const float = (text) => {
    const id = Math.random();
    setFloats((f) => [...f, { id, text }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1100);
  };

  const hit = async (p) => {
    if (voted.has(p.id)) return toast({ title: "You already hit this one", description: "React or comment to give it more time." });
    const updates = await onVote(p);
    setVoted((v) => new Set(v).add(p.id));
    if (updates) {
      setLocal((l) => ({ ...l, [p.id]: { ...(l[p.id] || {}), ...updates } }));
      float("+5:00");
    } else {
      toast({ title: "You already hit this one", description: "React or comment to give it more time." });
    }
  };

  const react = async (p, emoji) => {
    const updates = await onReact(p, emoji);
    if (updates) {
      setLocal((l) => ({ ...l, [p.id]: { ...(l[p.id] || {}), ...updates } }));
      float(emoji);
    }
  };

  const sheetPost = sheet && items.find((p) => p.id === sheet);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div
        ref={feed}
        onScroll={onScroll}
        className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      >
        {items.map((p, i) => (
          <Reel
            key={p.id}
            post={live(p)}
            active={i === idx}
            near={Math.abs(i - idx) <= WINDOW}
            now={now}
            author={members[p.created_by_id]}
            user={user}
            voted={voted.has(p.id)}
            onHit={hit}
            onReact={react}
            onComments={(x) => setSheet(x.id)}
            onSignIn={onSignIn}
          />
        ))}
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute left-3 z-30 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <X className="h-5 w-5" />
      </button>

      <AnimatePresence>
        {floats.map((f) => (
          <motion.span
            key={f.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -110, scale: 1.4 }}
            transition={{ duration: 1 }}
            className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+21rem)] right-4 z-30 font-mono text-xl font-black text-cyan-300 [text-shadow:0_2px_10px_rgba(0,0,0,0.8)]"
          >
            {f.text}
          </motion.span>
        ))}
      </AnimatePresence>

      {hint && items.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center">
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ repeat: Infinity, duration: 1.1 }}
            className="flex flex-col items-center gap-1 whitespace-nowrap text-sm font-black text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]"
          >
            <span className="text-3xl text-cyan-300">⌃</span>
            Swipe up for the next post
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {sheetPost && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheet(null)}
              className="absolute inset-0 z-40 bg-black/50"
            />
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", ease: [0.2, 0.8, 0.2, 1], duration: 0.3 }}
              className="absolute inset-x-0 bottom-0 z-50 flex h-[80%] flex-col rounded-t-3xl border-t border-white/10 bg-[#151c28] pb-[env(safe-area-inset-bottom)]"
            >
              <button
                onClick={() => setSheet(null)}
                aria-label="Close comments"
                className="mx-auto mt-2.5 block h-1.5 w-10 shrink-0 rounded-full bg-white/25"
              />
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-2.5 pt-2">
                <p className="min-w-0 truncate text-sm font-black text-white">
                  💬 Comments & more
                  <span className="ml-2 font-semibold text-gray-400">{live(sheetPost).comment_count || 0}</span>
                </p>
                <button
                  onClick={() => setSheet(null)}
                  aria-label="Close"
                  className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <PostCard
                  post={live(sheetPost)}
                  onClose={() => setSheet(null)}
                  onVote={onVote}
                  onReact={onReact}
                  onSignIn={onSignIn}
                  embedded
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
