import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
// into place. Built to stay smooth on iPhones: only the posts next to the one
// on screen are drawn, only they tick every second, no blur effects, and the
// feed underneath pauses its timers while this is open.

const HOUR = 60 * 60 * 1000;
const HINT_KEY = "pixsup_swipe_hint";
const NEAR = 1; // posts drawn either side of the one on screen

const clock = (ms) => {
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

// The life bar: what it's for is written on it, it changes colour as the post
// weakens, and it flashes the time someone just added
function LifeBar({ post, now }) {
  const { left, pct } = life(post, now);
  const dead = left <= 0;
  const urgent = !dead && left <= 5 * 60 * 1000;
  const lastBreath = !dead && left <= 60 * 1000;
  const expires = post.expires_at ? new Date(post.expires_at).getTime() : 0;
  const [gain, setGain] = useState(null);
  const prev = useRef(expires);

  useEffect(() => {
    const added = expires - prev.current;
    prev.current = expires;
    if (added >= 30 * 1000) {
      setGain(`+${clock(added)}`);
      const t = setTimeout(() => setGain(null), 1600);
      return () => clearTimeout(t);
    }
  }, [expires]);

  const fill = dead
    ? "bg-gray-500"
    : post.is_trending
      ? "bg-gradient-to-r from-yellow-300 to-orange-400"
      : urgent
        ? "bg-red-500"
        : pct < 0.5
          ? "bg-orange-400"
          : "bg-gradient-to-r from-cyan-400 to-emerald-300";

  const label = dead
    ? "💀 Died"
    : post.is_trending
      ? `🔥 Trending · ${clock(left)} left`
      : lastBreath
        ? `🚨 ${clock(left)} left · hit to save it!`
        : urgent
          ? `⚠️ ${clock(left)} left · dying`
          : `⏳ ${clock(left)} left`;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-2 text-[13px] font-extrabold text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.9)]">
        <span className={`truncate tabular-nums ${lastBreath ? "text-red-300" : ""}`}>{label}</span>
        <AnimatePresence>
          {gain && (
            <motion.span
              key={gain + expires}
              initial={{ opacity: 0, y: 6, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="shrink-0 rounded-full bg-cyan-400 px-2 py-0.5 font-mono text-[11px] font-black text-black"
            >
              {gain}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/20">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${fill} ${lastBreath ? "animate-pulse" : ""}`}
          style={{ width: `${Math.max(dead ? 0 : 2, pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

const Reel = memo(function Reel({ post, active, near, now, author, user, voted, onHit, onReact, onComments, onSignIn, onClose }) {
  const [fan, setFan] = useState(false);
  useEffect(() => {
    if (!active) setFan(false);
  }, [active]);

  // Far from the screen: an empty page of the right height (keeps swiping cheap)
  if (!near) return <section className="h-full snap-start snap-always bg-black" />;

  const { left } = life(post, now);
  const dead = left <= 0;
  const lastBreath = !dead && left <= 60 * 1000;
  const palette = reactionPalette(post);
  const reactions = Object.values(post.reactions || {}).reduce((a, b) => a + b, 0);
  const shadow = "[text-shadow:0_1px_6px_rgba(0,0,0,0.85)]";
  const round = "flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/55 active:scale-90";

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden bg-[#06080d]">
      {/* The photo sits in the open space above the details, not behind them */}
      <div className="absolute inset-x-0 bottom-[34%] top-[calc(env(safe-area-inset-top)+4.25rem)]">
        {post.media_type === "video" && active ? (
          <video src={post.media_url} autoPlay muted loop playsInline className="h-full w-full object-contain object-[50%_22%]" />
        ) : (
          <img
            src={post.thumbnail_url && post.media_type === "video" ? post.thumbnail_url : post.media_url}
            alt={post.title}
            decoding="async"
            className="h-full w-full object-contain object-[50%_22%]"
          />
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black via-black/80 to-transparent" />

      {/* Top: close, and the life bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-black/55 p-2 text-white">
          <X className="h-5 w-5" />
        </button>
        <LifeBar post={post} now={now} />
      </div>

      {dead && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <p className="rounded-full bg-black/70 px-4 py-2 text-sm font-black text-gray-200">💀 This post just died</p>
        </div>
      )}

      {/* What the post is */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-4 right-20 z-10 space-y-2 text-white">
        {(isBreaking(post, now) || post.revived_at) && (
          <div className="flex flex-wrap gap-1.5">
            {isBreaking(post, now) && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">● Breaking</span>
            )}
            {post.revived_at && (
              <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">🧟 Revived</span>
            )}
          </div>
        )}

        {post.isNews ? (
          <p className="text-xs font-bold text-cyan-200">{post.guest_author_id || "News"}</p>
        ) : author ? (
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <Avatar url={author.avatar_url} name={author.username} size={26} />@{author.username}
            {post.city && <span className="text-xs font-semibold text-gray-300">· 📍 {post.city}</span>}
          </p>
        ) : null}

        <p className={`text-[17px] font-extrabold leading-snug [text-wrap:balance] ${shadow}`}>{post.title || "Untitled"}</p>
        {post.isNews && post.summary && <p className="line-clamp-2 text-xs text-gray-300">{post.summary}</p>}
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
              <a href={post.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                <ExternalLink className="h-3.5 w-3.5" /> Read
              </a>
            )}
            <button onClick={() => onComments(post)} className="flex items-center gap-1 rounded-full bg-violet-500/85 px-3 py-1.5 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" /> Explain
            </button>
          </div>
        )}
      </div>

      {/* Emoji bar: big, each with its count; tap outside to close */}
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
              className="rounded-3xl border border-white/15 bg-[#151c28] px-3 py-3 shadow-2xl"
            >
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">React · +3 min</p>
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
      <div className={`absolute bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-2.5 z-20 flex flex-col items-center gap-3.5 text-[11px] font-extrabold text-white ${shadow}`}>
        <button
          onClick={() => onHit(post)}
          disabled={dead}
          aria-label={lastBreath ? "Save this post" : "Hit: 5 more minutes"}
          className="flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg active:scale-90 ${
              voted ? "border border-white/20 bg-white/15" : lastBreath ? "animate-pulse bg-red-500" : "bg-gradient-to-br from-cyan-400 to-orange-500 text-black"
            }`}
          >
            {lastBreath && !voted ? <span className="text-[11px] font-black">SAVE</span> : <Zap className="h-6 w-6" fill="currentColor" />}
          </span>
          {post.hits || 0}
        </button>

        <button
          onClick={() => (user ? setFan((f) => !f) : onSignIn?.())}
          disabled={dead}
          aria-label="React with an emoji"
          className="flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span className={`${round} text-2xl`}>{palette[0]}</span>
          {reactions}
        </button>

        <button onClick={() => onComments(post)} aria-label="Comments and more" className="flex flex-col items-center gap-1">
          <span className={round}>
            <MessageCircle className="h-6 w-6" />
          </span>
          {post.comment_count || 0}
        </button>

        <div className="flex flex-col items-center gap-1">
          <WatchButton post={post} user={user} onSignIn={onSignIn} className={`${round} [&_svg]:h-6 [&_svg]:w-6`} />
          {user && post.created_by_id !== user.id ? "Watch" : ""}
        </div>

        <ShareButton post={post} className="flex flex-col items-center gap-1">
          <span className={round}>
            <Share2 className="h-5 w-5" />
          </span>
          Share
        </ShareButton>
      </div>
    </section>
  );
});

export default function ReelsViewer({ post, list, onClose, onVote, onReact, onSignIn, onNavigate }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const feed = useRef(null);
  // The list as it was when Reels mode opened, refreshed with live numbers
  // (so posts don't jump around while someone is swiping)
  const order = useRef(null);
  if (!order.current) order.current = (list?.some((p) => p.id === post.id) ? list : [post]).map((p) => p.id);
  const byId = new Map((list || []).map((p) => [p.id, p]));
  byId.set(post.id, byId.get(post.id) || post);
  const items = order.current.map((id) => byId.get(id)).filter(Boolean);
  const startIdx = Math.max(0, order.current.indexOf(post.id));

  const [idx, setIdx] = useState(startIdx);
  const [now, setNow] = useState(() => Date.now());
  const [voted, setVoted] = useState(() => new Set());
  const [local, setLocal] = useState({}); // instant updates from this person's own taps
  const [sheet, setSheet] = useState(null); // post id with the comments panel open
  const [hint, setHint] = useState(() => {
    try {
      return Number(localStorage.getItem(HINT_KEY) || 0) < 3;
    } catch {
      return false;
    }
  });

  // Keep the same object for a post until its data changes, so posts off
  // screen don't redraw
  const merged = useRef(new Map());
  const live = (p) => {
    const extra = local[p.id];
    if (!extra) return p;
    const key = `${p.id}`;
    const prev = merged.current.get(key);
    if (prev && prev.base === p && prev.extra === extra) return prev.value;
    const value = { ...p, ...extra };
    merged.current.set(key, { base: p, extra, value });
    return value;
  };

  const members = useMembers(items.slice(Math.max(0, idx - NEAR), idx + NEAR + 1).filter((p) => !p.isNews).map((p) => p.created_by_id));

  // Pause the feed underneath while Reels mode is open
  useEffect(() => {
    document.documentElement.dataset.reels = "1";
    return () => delete document.documentElement.dataset.reels;
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Open at the post that was tapped
  useLayoutEffect(() => {
    const el = feed.current;
    if (el) el.scrollTop = startIdx * el.clientHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = feed.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i === idx || !items[i]) return;
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
  };

  const votedRef = useRef(voted);
  votedRef.current = voted;
  const hit = useCallback(
    async (p) => {
      const already = () => toast({ title: "You already hit this one", description: "React or comment to give it more time." });
      if (votedRef.current.has(p.id)) return already();
      setVoted((v) => new Set(v).add(p.id));
      const updates = await onVote(p);
      if (updates) setLocal((l) => ({ ...l, [p.id]: { ...(l[p.id] || {}), ...updates } }));
      else already();
    },
    [onVote, toast]
  );

  const react = useCallback(
    async (p, emoji) => {
      const updates = await onReact(p, emoji);
      if (updates) setLocal((l) => ({ ...l, [p.id]: { ...(l[p.id] || {}), ...updates } }));
    },
    [onReact]
  );

  const openSheet = useCallback((p) => setSheet(p.id), []);
  // the page passes new functions on every render; keep the posts' copies stable
  const actions = useRef({});
  actions.current = { onClose, onSignIn };
  const close = useCallback(() => actions.current.onClose?.(), []);
  const signIn = useCallback(() => actions.current.onSignIn?.(), []);
  const sheetPost = sheet && items.find((p) => p.id === sheet);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div ref={feed} onScroll={onScroll} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
        {items.map((p, i) => {
          const near = Math.abs(i - idx) <= NEAR;
          return (
            <Reel
              key={p.id}
              post={live(p)}
              active={i === idx}
              near={near}
              now={near ? now : 0}
              author={near ? members[p.created_by_id] : undefined}
              user={user}
              voted={voted.has(p.id)}
              onHit={hit}
              onReact={react}
              onComments={openSheet}
              onSignIn={signIn}
              onClose={close}
            />
          );
        })}
      </div>

      {hint && items.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] z-20 flex justify-center">
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
                <button onClick={() => setSheet(null)} aria-label="Close" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <PostCard post={live(sheetPost)} onClose={() => setSheet(null)} onVote={onVote} onReact={onReact} onSignIn={onSignIn} embedded />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
