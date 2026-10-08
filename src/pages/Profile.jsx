import React, { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import { Image } from "@/components/ui/image";
import { Hourglass, Loader2, LogIn, Settings } from "lucide-react";
import { displayNameFor } from "@/lib/engagement";
import useSavedPosts from "@/hooks/useSavedPosts";
import { formatRemaining } from "@/lib/time";

const hitsLabel = (n) => (n === 1 ? "1 hit" : `${n} hits`);

// Milestone badges: hit counts, rescues, trending status and decay-timer mastery
const BADGES = [
  { icon: "🦸", label: "Hero", earned: ({ rescues }) => rescues >= 1 },
  { icon: "🛟", label: "Lifeguard", earned: ({ rescues }) => rescues >= 10 },
  { icon: "💛", label: "100 Lifelines", earned: ({ lifelines }) => lifelines >= 100 },
  { icon: "🎯", label: "First Hit", earned: ({ totalHits }) => totalHits >= 1 },
  { icon: "🔥", label: "On Fire", earned: ({ totalHits }) => totalHits >= 50 },
  {
    icon: "⚡",
    label: "Trending Creator",
    earned: ({ mine }) => mine.some((p) => p.is_trending),
  },
  {
    icon: "⏳",
    label: "Time Lord",
    earned: ({ mine }) =>
      mine.some(
        (p) =>
          p.expires_at &&
          p.created_date &&
          new Date(p.expires_at) - new Date(p.created_date) > 12 * 60 * 60 * 1000
      ),
  },
];

export default function Profile() {
  const { user, openAuth, posts, refreshUser } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [allMine, setAllMine] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState("uploads");
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
        const mine = await base44.entities.Post.filter(
          { created_by_id: userId },
          "-created_date",
          100
        );
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

  const live = allMine.filter(
    (p) => !p.expires_at || new Date(p.expires_at).getTime() > now
  );
  const totalHits = allMine.reduce((s, p) => s + (p.hits || 0), 0);
  const lifelines = user?.lifelines || 0;
  const rescues = user?.rescues || 0;
  const badges = BADGES.filter((b) =>
    b.earned({ mine: allMine, totalHits, lifelines, rescues })
  );
  const savedPosts = (posts || []).filter((p) => saved.includes(p.id));

  const tabClass = (active) =>
    `rounded-full px-4 py-1.5 text-xs font-bold transition ${
      active
        ? "bg-cyan-400 font-extrabold text-black shadow-[0_0_10px_rgba(34,211,238,0.4)]"
        : "border border-white/15 bg-white/5 text-gray-300 hover:text-white"
    }`;

  const name = user ? displayNameFor(user) : "";
  const initials =
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const countdown = (p) => {
    const remaining = p.expires_at
      ? Math.max(0, new Date(p.expires_at).getTime() - now)
      : 0;
    return formatRemaining(remaining);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-black text-cyan-400">👤 Profile Studio</h1>
        <Link
          to="/settings"
          className="spring-tap flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
        >
          <Settings className="h-3.5 w-3.5" /> Settings
        </Link>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        Your live uploads, earned hits and badges. No followers, no permanent archives.
      </p>
      {loading || user === undefined ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
      ) : user === null ? (
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
          <p className="mb-2 text-lg font-black">Unlock Profile Studio</p>
          <p className="mb-5 text-xs text-gray-400">
            Sign in to track your live uploads, hits, reactions and milestone badges.
            Your posts still disappear — your stats are yours.
          </p>
          <button
            onClick={openAuth}
            className="flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-5 py-2 text-sm font-black text-black shadow-[0_0_14px_rgba(34,211,238,0.5)] transition-transform hover:scale-105 active:scale-95"
          >
            <LogIn className="h-4 w-4" /> Sign in / Create account
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-orange-500 text-lg font-black text-black shadow-[0_0_16px_rgba(34,211,238,0.4)]">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-black">{name}</p>
              <p className="truncate text-[10px] text-gray-400">{user.email}</p>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
              <p className="text-lg font-black text-cyan-400">{live.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Active Posts
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
              <p className="text-lg font-black text-orange-400">{hitsLabel(totalHits)}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Hits Earned
              </p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
              <p className="text-lg font-black text-yellow-300">💛 {lifelines}</p>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Lifelines{rescues > 0 && ` · 🦸 ${rescues}`}
              </p>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                key={b.label}
                className="rounded-full border border-cyan-400/25 bg-white/5 px-3 py-1 text-xs font-bold text-amber-200 shadow-[0_0_12px_rgba(34,211,238,0.15)] backdrop-blur-md"
              >
                {b.icon} {b.label}
              </span>
            ))}
            {badges.length === 0 && (
              <p className="text-xs text-gray-400">
                Post something and earn hits to unlock badges.
              </p>
            )}
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setTab("uploads")}
              className={tabClass(tab === "uploads")}
            >
              ⬆️ My Uploads
            </button>
            <button
              onClick={() => setTab("saved")}
              className={tabClass(tab === "saved")}
            >
              🔖 Saved {saved.length > 0 && `(${saved.length})`}
            </button>
          </div>

          {tab === "uploads" && (
          <>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-orange-400">
            Live Uploads
          </h2>
          {live.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
              Nothing live right now — posts disappear after 1 hour.
            </p>
          ) : (
            <div className="space-y-2">
              {live.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-2.5"
                >
                  <Image
                    src={p.thumbnail_url || p.media_url}
                    alt={p.title}
                    fittingType="fill"
                    className="h-10 w-10 shrink-0 rounded"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{p.title || "Untitled"}</p>
                    <p className="text-[10px] text-gray-400">
                      ⚡ {hitsLabel(p.hits || 0)} · posted{" "}
                      {moment(p.created_date).fromNow()}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 font-mono text-xs font-bold text-orange-400">
                    <Hourglass className="h-3 w-3" /> {countdown(p)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {live.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-widest text-cyan-400">
                Live Gallery
              </h2>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
                {live.map((p) => (
                  <Image
                    key={p.id}
                    src={p.thumbnail_url || p.media_url}
                    alt={p.title}
                    fittingType="fill"
                    className="h-10 w-10 rounded"
                  />
                ))}
              </div>
            </>
          )}
          </>
          )}

          {tab === "saved" && (
            <div>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                Saved Posts
              </h2>
              {savedPosts.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
                  Nothing saved yet — tap the bookmark on any tile. Saved posts
                  stay here until they expire.
                </p>
              ) : (
                <div className="space-y-2">
                  {savedPosts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-2.5"
                    >
                      <Image
                        src={p.thumbnail_url || p.media_url}
                        alt={p.title}
                        fittingType="fill"
                        className="h-10 w-10 shrink-0 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">
                          {p.title || "Untitled"}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          ⚡ {hitsLabel(p.hits || 0)} · posted{" "}
                          {moment(p.created_date).fromNow()}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 font-mono text-xs font-bold text-orange-400">
                        <Hourglass className="h-3 w-3" /> {countdown(p)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}