import React, { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import moment from "moment";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Hourglass, Loader2, LogIn, LogOut, Settings, Zap } from "lucide-react";
import { displayNameFor } from "@/lib/engagement";
import useSavedPosts from "@/hooks/useSavedPosts";
import { formatRemaining } from "@/lib/time";
import PostDetail from "@/components/PostDetail";

const HOUR = 60 * 60 * 1000;
const lifeOf = (p) =>
  p.expires_at && p.created_date
    ? Math.max(
        0,
        Math.min(Date.now(), new Date(p.expires_at).getTime()) - new Date(p.created_date).getTime()
      )
    : 0;

// Every badge, earned or not; locked ones show progress toward unlocking
const BADGES = [
  { icon: "🎯", label: "First Hit", goal: 1, value: (s) => s.totalHits, unit: "hits earned" },
  { icon: "🔥", label: "On Fire", goal: 50, value: (s) => s.totalHits, unit: "hits earned" },
  { icon: "🦸", label: "Hero", goal: 1, value: (s) => s.rescues, unit: "rescues" },
  { icon: "🛟", label: "Lifeguard", goal: 10, value: (s) => s.rescues, unit: "rescues" },
  { icon: "💛", label: "100 Lifelines", goal: 100, value: (s) => s.lifelines, unit: "lifelines" },
  { icon: "⚡", label: "Trending Creator", goal: 1, value: (s) => s.trended, unit: "posts trended" },
  { icon: "⏳", label: "Time Lord", goal: 12, value: (s) => Math.floor(s.longest / HOUR), unit: "hours one post lived" },
];

function Stat({ value, label, color }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
      <p className={`text-xl font-black ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  );
}

function PostTile({ post, now, onOpen }) {
  const remaining = post.expires_at ? Math.max(0, new Date(post.expires_at).getTime() - now) : 0;
  return (
    <button
      onClick={() => onOpen(post)}
      className="relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-[#151c28] text-left"
    >
      <Image
        src={post.thumbnail_url || post.media_url}
        alt={post.title}
        fittingType="fill"
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
      <span className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-300">
        <Hourglass className="h-2.5 w-2.5" /> {formatRemaining(remaining)}
      </span>
      {post.is_trending && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black text-black">
          TRENDING
        </span>
      )}
      <span className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 text-[10px] font-bold text-white">
        <span className="truncate">{post.title || "Untitled"}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-yellow-300">
          <Zap className="h-2.5 w-2.5" /> {post.hits || 0}
        </span>
      </span>
    </button>
  );
}

export default function Profile() {
  const { user, openAuth, posts, refreshUser, handleVote, handleReact } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [allMine, setAllMine] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("live");
  const [active, setActive] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const { saved } = useSavedPosts();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Lifelines and rescues change with every hit; fetch fresh counts on open
  useEffect(() => {
    refreshUser?.();
  }, []);

  // undefined while auth loads, null for guests; only re-fetch when it changes
  const userId = user === undefined ? undefined : user?.id ?? null;
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const mine = await base44.entities.Post.filter({ created_by_id: userId }, "-created_date", 100);
        if (alive) setAllMine(mine);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const logout = async () => {
    setLoggingOut(true);
    await base44.auth.logout("/");
  };

  if (loading || user === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 pb-8 pt-10">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-cyan-500/10 to-orange-500/5 p-8 text-center">
          <p className="mb-1 text-4xl">👤</p>
          <p className="mb-2 text-lg font-black">Your Pixsup profile</p>
          <p className="mb-5 text-xs leading-relaxed text-gray-400">
            Track your live posts, the hits you earn, the posts you rescue and the badges you unlock.
            Your posts still disappear. Your stats are yours to keep.
          </p>
          <button
            onClick={openAuth}
            className="mx-auto flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-5 py-2.5 text-sm font-black text-black transition-transform hover:scale-105 active:scale-95"
          >
            <LogIn className="h-4 w-4" /> Sign in / Create account
          </button>
        </div>
      </main>
    );
  }

  const live = allMine.filter((p) => !p.expires_at || new Date(p.expires_at).getTime() > now);
  const stats = {
    totalHits: allMine.reduce((s, p) => s + (p.hits || 0), 0),
    lifelines: user.lifelines || 0,
    rescues: user.rescues || 0,
    trended: allMine.filter((p) => p.is_trending || p.trending_expires_at).length,
    longest: Math.max(0, ...allMine.map(lifeOf)),
  };
  const savedPosts = (posts || []).filter((p) => saved.includes(p.id));
  const name = displayNameFor(user);
  const initial = (name[0] || "?").toUpperCase();
  const longestLabel =
    stats.longest >= HOUR
      ? `${Math.floor(stats.longest / HOUR)}h ${Math.floor((stats.longest % HOUR) / 60000)}m`
      : `${Math.floor(stats.longest / 60000)}m`;

  const tabClass = (on) =>
    `rounded-full px-4 py-1.5 text-xs font-bold transition ${
      on ? "bg-white text-black" : "border border-white/15 bg-white/5 text-gray-300 hover:text-white"
    }`;

  const list = tab === "live" ? live : savedPosts;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-4 sm:px-6">
      {/* Header */}
      <section className="relative mb-4 overflow-hidden rounded-3xl border border-white/10 bg-[#151c28]">
        <div className="h-20 bg-gradient-to-r from-cyan-500/40 via-violet-500/30 to-orange-500/40" />
        <div className="px-4 pb-4">
          <div className="-mt-9 flex items-end justify-between gap-3">
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-4 border-[#151c28] bg-gradient-to-tr from-cyan-400 to-orange-500 text-2xl font-black text-black">
              {initial}
            </div>
            <div className="flex gap-2 pb-1">
              <Link
                to="/settings"
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-200 transition hover:bg-white/10"
              >
                <Settings className="h-3.5 w-3.5" /> Settings
              </Link>
              <button
                onClick={logout}
                disabled={loggingOut}
                className="flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
              >
                {loggingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                Log out
              </button>
            </div>
          </div>
          <p className="mt-2 text-xl font-black text-white">@{name}</p>
          <p className="text-xs text-gray-400">
            Keeping posts alive since {moment(user.created_date).format("MMMM YYYY")}
          </p>
          {stats.longest > 0 && (
            <p className="mt-2 inline-block rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-gray-300">
              ⏳ Longest-living post: <span className="text-orange-300">{longestLabel}</span>
            </p>
          )}
        </div>
      </section>

      {/* Stats */}
      <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={`💛 ${stats.lifelines}`} label="Lifelines" color="text-yellow-300" />
        <Stat value={`🦸 ${stats.rescues}`} label="Rescues" color="text-orange-300" />
        <Stat value={`⚡ ${stats.totalHits}`} label="Hits earned" color="text-cyan-300" />
        <Stat value={`🔴 ${live.length}`} label="Live now" color="text-white" />
      </section>

      {/* Badges */}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Badges</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BADGES.map((b) => {
            const value = b.value(stats);
            const earned = value >= b.goal;
            return (
              <div
                key={b.label}
                className={`rounded-2xl border p-3 ${
                  earned ? "border-yellow-400/40 bg-yellow-400/10" : "border-white/5 bg-white/[0.03]"
                }`}
              >
                <p className={`text-2xl ${earned ? "" : "opacity-30 grayscale"}`}>{b.icon}</p>
                <p className={`mt-1 text-xs font-extrabold ${earned ? "text-yellow-200" : "text-gray-400"}`}>
                  {b.label}
                </p>
                {earned ? (
                  <p className="text-[10px] font-bold text-yellow-300/80">Unlocked</p>
                ) : (
                  <>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${Math.min(100, (value * 100) / b.goal)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      {value}/{b.goal} {b.unit}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Posts */}
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("live")} className={tabClass(tab === "live")}>
          🔴 Live posts {live.length > 0 && `(${live.length})`}
        </button>
        <button onClick={() => setTab("saved")} className={tabClass(tab === "saved")}>
          🔖 Saved {savedPosts.length > 0 && `(${savedPosts.length})`}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-gray-400">
          {tab === "live"
            ? "Nothing live right now. Post something and see how long the crowd keeps it alive."
            : "Nothing saved yet. Tap the bookmark on any post. Saved posts stay here until they expire."}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {list.map((p) => (
            <PostTile key={p.id} post={p} now={now} onOpen={setActive} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {active && (
          <PostDetail
            post={(posts || []).find((p) => p.id === active.id) || active}
            onClose={() => setActive(null)}
            onVote={handleVote}
            onReact={handleReact}
            onSignIn={openAuth}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
