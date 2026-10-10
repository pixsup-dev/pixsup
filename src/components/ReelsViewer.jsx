import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
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
import EmojiBurst from "@/components/EmojiBurst";

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

// A soft glow of the photo's colours behind it: the photo drawn into a tiny
// 12×16 canvas and stretched to fill the screen. Looks like a heavy blur but
// costs almost nothing, which keeps swiping smooth on iPhones.
function paintGlow(canvas, img) {
  try {
    const ctx = canvas?.getContext("2d");
    if (ctx && img?.naturalWidth) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } catch {
    // some publishers' images can't be drawn: the plain dark background stays
  }
}

const Reel = memo(function Reel({ post, active, near, now, author, user, voted, onHit, onReact, onComments, onSignIn, onClose }) {
  const [fan, setFan] = useState(false);
  const glow = useRef(null);
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
  const tab = "flex flex-col items-center justify-center gap-1 rounded-2xl py-1.5 text-[11px] font-bold text-gray-200 active:scale-95 active:bg-white/10 disabled:opacity-40";

  return (
    <section className="relative flex h-full snap-start snap-always flex-col overflow-hidden bg-[#06080d] text-white">
      <canvas ref={glow} width={12} height={16} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/85" />
      {/* Top: close, and the life bar */}
      <div className="relative flex shrink-0 items-center gap-3 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.6rem)]">
        <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-white/10 p-2">
          <X className="h-5 w-5" />
        </button>
        <LifeBar post={post} now={now} />
      </div>

      {/* The photo gets all the room between the life bar and the details */}
      <div className="relative min-h-0 flex-1">
        {/* 🔥 per hit, the emoji per reaction, 💬 per comment, from anyone, live */}
        <EmojiBurst post={post} size="text-5xl" per={4} rise={2.4} />
        {post.media_type === "video" && active ? (
          <video src={post.media_url} autoPlay muted loop playsInline className="h-full w-full object-contain" />
        ) : (
          <img
            src={post.thumbnail_url && post.media_type === "video" ? post.thumbnail_url : post.media_url}
            alt={post.title}
            decoding="async"
            onLoad={(e) => paintGlow(glow.current, e.currentTarget)}
            className="h-full w-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          />
        )}
        {(isBreaking(post, now) || post.revived_at || post.saved_by_name) && (
          <div className="absolute bottom-2 left-3 flex flex-wrap gap-1.5">
            {isBreaking(post, now) && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">● Breaking</span>
            )}
            {post.revived_at && (
              <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-black">🧟 Revived</span>
            )}
            {post.saved_by_name && (
              <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-yellow-300">🦸 Saved by @{post.saved_by_name}</span>
            )}
          </div>
        )}
        {dead && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="rounded-full bg-black/70 px-4 py-2 text-sm font-black text-gray-200">💀 This post just died</p>
          </div>
        )}
      </div>

      {/* What the post is: kept short so the photo stays big */}
      <div className="relative shrink-0 space-y-1 px-4 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-bold">
          {post.isNews ? (
            <>
              <span className="truncate text-cyan-200">{post.guest_author_id || "News"}</span>
              {post.source_url && (
                <a href={post.source_url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-gray-300">
                  · Read <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button onClick={() => onComments(post, "more")} className="flex shrink-0 items-center gap-1 text-violet-300">
                · <Sparkles className="h-3 w-3" /> Explain
              </button>
            </>
          ) : author ? (
            <>
              <Avatar url={author.avatar_url} name={author.username} size={22} />
              <span className="truncate">@{author.username}</span>
              {post.city && <span className="shrink-0 font-semibold text-gray-400">· 📍 {post.city}</span>}
            </>
          ) : null}
        </div>
        {post.isNews ? (
          // news: more of the story, and a tap opens the full details
          <button onClick={() => onComments(post, "more")} className="block w-full space-y-1 text-left">
            <p className="line-clamp-3 text-base font-extrabold leading-snug [text-wrap:balance]">{post.title || "Untitled"}</p>
            {post.summary && <p className="line-clamp-4 text-[13px] leading-snug text-gray-300">{post.summary}</p>}
            <p className="text-xs font-bold text-cyan-300">Tap for the full story ›</p>
          </button>
        ) : (
          <p className="line-clamp-2 text-base font-extrabold leading-snug [text-wrap:balance]">{post.title || "Untitled"}</p>
        )}
        {post.isNews ? null : (
          !post.isNews &&
          post.hashtags?.length > 0 && (
            <p className="truncate text-xs font-semibold text-cyan-300">{post.hashtags.slice(0, 4).join("  ")}</p>
          )
        )}
      </div>

      {/* Actions across the bottom, Hit first and biggest */}
      <div className="relative grid shrink-0 grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-stretch gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2">
        <button
          onClick={() => onHit(post)}
          disabled={dead}
          aria-label={lastBreath ? "Save this post" : "Hit: 5 more minutes"}
          className={`flex items-center justify-center gap-1.5 rounded-2xl px-2 text-sm font-black active:scale-95 disabled:opacity-40 ${
            voted
              ? "bg-white/10 text-gray-300"
              : lastBreath
                ? "animate-pulse bg-red-500 text-white"
                : "bg-gradient-to-r from-cyan-400 to-orange-500 text-black"
          }`}
        >
          <Zap className="h-5 w-5" fill="currentColor" />
          {lastBreath && !voted ? "SAVE" : "Hit"}
          <span className="tabular-nums opacity-80">{post.hits || 0}</span>
        </button>

        <button onClick={() => (user ? setFan((f) => !f) : onSignIn?.())} disabled={dead} aria-label="React with an emoji" className={tab}>
          <span className="text-xl leading-none">{palette[0]}</span>
          <span className="tabular-nums">{reactions}</span>
        </button>

        <button onClick={() => onComments(post)} aria-label="Comments and more" className={tab}>
          <MessageCircle className="h-5 w-5" />
          <span className="tabular-nums">{post.comment_count || 0}</span>
        </button>

        <div className={tab}>
          <WatchButton post={post} user={user} onSignIn={onSignIn} className="[&_svg]:h-5 [&_svg]:w-5" />
          {user && post.created_by_id === user.id ? <span className="text-lg leading-none">👤</span> : null}
          <span>{user && post.created_by_id === user.id ? "Yours" : "Watch"}</span>
        </div>

        <ShareButton post={post} className={tab}>
          <Share2 className="h-5 w-5" />
          <span>Share</span>
        </ShareButton>
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
            className="absolute inset-0 z-30 flex items-end justify-center bg-black/60 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
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

  const [sheetTab, setSheetTab] = useState("comments");
  const sheetDrag = useDragControls();
  const openSheet = useCallback((p, tab = "comments") => {
    setSheetTab(tab);
    setSheet(p.id);
  }, []);
  // the page passes new functions on every render; keep the posts' copies stable
  const actions = useRef({});
  actions.current = { onClose, onSignIn };
  const close = useCallback(() => actions.current.onClose?.(), []);
  const signIn = useCallback(() => actions.current.onSignIn?.(), []);
  const sheetPost = sheet && items.find((p) => p.id === sheet);

  // Swipe sideways (either way) to go back home: the post follows the finger,
  // then slides off. Up and down stay with the native scroll between posts.
  const shell = useRef(null);
  const side = useRef(null);
  const sideStart = (e) => {
    if (sheet) return;
    side.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null };
  };
  const sideMove = (e) => {
    const g = side.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (!g.dir && Math.abs(dx) + Math.abs(dy) > 12) g.dir = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
    if (g.dir !== "x" || !shell.current) return;
    shell.current.style.transition = "none";
    shell.current.style.transform = `translateX(${dx}px)`;
    shell.current.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 500));
  };
  const sideEnd = (e) => {
    const g = side.current;
    side.current = null;
    if (!g || g.dir !== "x" || !shell.current) return;
    const dx = e.changedTouches[0].clientX - g.x;
    const el = shell.current;
    el.style.transition = "transform 0.22s ease-out, opacity 0.22s ease-out";
    if (Math.abs(dx) > 90) {
      el.style.transform = `translateX(${dx > 0 ? "" : "-"}100%)`;
      el.style.opacity = "0";
      setTimeout(() => actions.current.onClose?.(), 200);
    } else {
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
    }
  };

  return (
    <div
      ref={shell}
      onTouchStart={sideStart}
      onTouchMove={sideMove}
      onTouchEnd={sideEnd}
      className="fixed inset-0 z-50 bg-black"
    >
      <div
        ref={feed}
        onScroll={onScroll}
        className="no-scrollbar h-full touch-pan-y snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      >
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
              // Pull the top bar down to close (a short flick works too)
              drag="y"
              dragControls={sheetDrag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={(_, info) => (info.offset.y > 90 || info.velocity.y > 450) && setSheet(null)}
              className="absolute inset-x-0 bottom-0 z-50 flex h-[80%] flex-col rounded-t-3xl border-t border-white/10 bg-[#151c28] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="shrink-0 touch-none" onPointerDown={(e) => sheetDrag.start(e)}>
              <button
                onClick={() => setSheet(null)}
                aria-label="Close comments"
                className="mx-auto block w-full pb-1.5 pt-2.5"
              >
                <span className="mx-auto block h-1.5 w-10 rounded-full bg-white/30" />
              </button>
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-0.5">
                <p className="min-w-0 truncate text-sm font-black text-white">{sheetPost.title || "Untitled"}</p>
                <button onClick={() => setSheet(null)} aria-label="Close" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              </div>
              <div className="min-h-0 flex-1">
                <PostCard
                  key={sheetPost.id + sheetTab}
                  post={live(sheetPost)}
                  onClose={() => setSheet(null)}
                  onVote={onVote}
                  onReact={onReact}
                  onSignIn={onSignIn}
                  embedded
                  startTab={sheetTab}
                  onDragHandle={(e) => sheetDrag.start(e)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
