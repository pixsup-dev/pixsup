import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import moment from "moment";
import { Bell, Loader2, LogIn, Share2, TrendingUp, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import ShareButton from "@/components/ShareButton";
import StoryCardButton from "@/components/StoryCardButton";
import PostDetail from "@/components/PostDetail";
import { formatRemaining } from "@/lib/time";

const HOUR = 60 * 60 * 1000;
const DYING_MS = 10 * 60 * 1000;

const NOTIF_META = {
  hit: { icon: "⚡", text: "hit your post" },
  reaction: { icon: "🎉", text: "reacted to your post" },
  comment: { icon: "💬", text: "commented on your post" },
  trending: { icon: "🔥", text: "Your post made the 24-Hour Trending Belt!", solo: true },
  rescue: { icon: "🦸", text: "saved your post at the last minute!" },
};

function Thumb({ post, fallback }) {
  const media = post ? post.thumbnail_url || post.media_url : null;
  return media ? (
    <Image src={media} alt="" fittingType="fill" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg">
      {fallback}
    </div>
  );
}

function SectionTitle({ icon: Icon, children, color = "text-cyan-400", right }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${color}`}>
        <Icon className="h-3.5 w-3.5" /> {children}
      </h2>
      {right}
    </div>
  );
}

// The Hits hub: your activity, how your posts are doing (and which need help),
// and what the whole of Pixsup is hitting right now, live.
export default function Hits() {
  const { posts, user, openAuth, notifications, refreshNotifications, handleVote, handleReact } =
    useOutletContext();
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState([]);
  const [votes, setVotes] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Your posts, plus recent hits across Pixsup (kept live by realtime)
  const userId = user === undefined ? undefined : user?.id ?? null;
  useEffect(() => {
    if (userId === undefined) return;
    let alive = true;
    (async () => {
      try {
        const [myPosts, recent] = await Promise.all([
          userId ? base44.entities.Post.filter({ created_by_id: userId }, "-created_date", 100) : [],
          base44.entities.Vote.list("-created_date", 300),
        ]);
        if (!alive) return;
        setMine(myPosts);
        setVotes(recent);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const unsub = base44.entities.Vote.subscribe(({ type, data }) => {
      if (type === "create" && data) setVotes((v) => [data, ...v].slice(0, 300));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [userId]);

  // Viewing the hub marks your activity as seen, then refreshes the bell badge
  useEffect(() => {
    if (user && notifications.some((n) => !n.read)) {
      base44.entities.Notification.updateMany({ recipient_id: user.id, read: false }, { $set: { read: true } })
        .then(() => refreshNotifications())
        .catch((e) => console.error(e));
    }
  }, [user, notifications, refreshNotifications]);

  const byId = useMemo(() => {
    const m = new Map(mine.map((p) => [p.id, p]));
    for (const p of posts) m.set(p.id, p); // live versions win
    return m;
  }, [posts, mine]);

  const myLive = mine
    .map((p) => byId.get(p.id) || p)
    .filter((p) => p.expires_at && new Date(p.expires_at).getTime() > now);
  const dying = myLive
    .filter((p) => !p.is_trending && new Date(p.expires_at).getTime() - now < DYING_MS)
    .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));

  const todayStart = moment().startOf("day").valueOf();
  const today = notifications.filter((n) => new Date(n.created_date).getTime() >= todayStart);
  const count = (type) => today.filter((n) => n.type === type).length;

  // Hottest right now: most hits in the last hour, among posts still live
  const hottest = useMemo(() => {
    const tally = new Map();
    for (const v of votes) {
      if (now - new Date(v.created_date).getTime() > HOUR) continue;
      tally.set(v.post_id, (tally.get(v.post_id) || 0) + 1);
    }
    return [...tally.entries()]
      .map(([id, n]) => ({ post: byId.get(id), n }))
      .filter((x) => x.post && (!x.post.expires_at || new Date(x.post.expires_at).getTime() > now))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }, [votes, byId, now]);

  const ticker = votes.filter((v) => byId.get(v.post_id)).slice(0, 8);

  const earlierCut = today.length;
  const feed = notifications;

  if (loading || user === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-cyan-400">
            ⚡ Hits
            <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
            </span>
          </h1>
          <p className="text-xs text-gray-400">Your activity, and what Pixsup is keeping alive right now.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* ---------------- Left: you ---------------- */}
        <div className="space-y-6">
          {user ? (
            <>
              {/* Today */}
              <section className="grid grid-cols-4 gap-2">
                {[
                  ["⚡", count("hit") + count("rescue"), "hits", "text-cyan-300"],
                  ["🎉", count("reaction"), "reactions", "text-orange-300"],
                  ["💬", count("comment"), "comments", "text-violet-300"],
                  ["🦸", count("rescue"), "rescues", "text-yellow-300"],
                ].map(([icon, n, label, color]) => (
                  <div key={label} className="rounded-2xl border border-white/5 bg-white/5 p-2.5 text-center">
                    <p className={`text-lg font-black ${color}`}>
                      {icon} {n}
                    </p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label} today</p>
                  </div>
                ))}
              </section>

              {/* Needs help */}
              {dying.length > 0 && (
                <section className="space-y-2">
                  {dying.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3"
                    >
                      <button onClick={() => setActive(p)} className="shrink-0">
                        <Thumb post={p} fallback="⏳" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-red-200">
                          🚨 "{p.title || "Your post"}" is dying
                        </p>
                        <p className="font-mono text-sm font-black text-white">
                          {formatRemaining(new Date(p.expires_at).getTime() - now)} left
                        </p>
                      </div>
                      <ShareButton
                        post={p}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-red-500 active:scale-95"
                      >
                        <Share2 className="h-3 w-3" /> Get help
                      </ShareButton>
                      <StoryCardButton
                        post={p}
                        label="📸 Story"
                        className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-white/20 active:scale-95"
                      />
                    </div>
                  ))}
                </section>
              )}

              {/* Your live posts */}
              {myLive.length > 0 && (
                <section>
                  <SectionTitle icon={Zap} color="text-orange-400">
                    Your live posts
                  </SectionTitle>
                  <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                    {myLive.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setActive(p)}
                        className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10"
                      >
                        <Image
                          src={p.thumbnail_url || p.media_url}
                          alt={p.title}
                          fittingType="fill"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-300">
                          {formatRemaining(new Date(p.expires_at).getTime() - now)}
                        </span>
                        <span className="absolute bottom-1.5 left-1.5 text-[11px] font-black text-yellow-300">
                          ⚡ {p.hits || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Activity */}
              <section>
                <SectionTitle icon={Bell}>Your activity</SectionTitle>
                {feed.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-gray-400">
                    No activity yet. Post something, and every hit, reaction and rescue shows up here.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {feed.map((n, i) => {
                      const meta = NOTIF_META[n.type] || NOTIF_META.hit;
                      const icon = n.type === "reaction" ? n.emoji || meta.icon : meta.icon;
                      const p = byId.get(n.post_id);
                      const special = n.type === "trending" || n.type === "rescue";
                      return (
                        <React.Fragment key={n.id}>
                          {i === 0 && earlierCut > 0 && (
                            <p className="pt-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Today</p>
                          )}
                          {i === earlierCut && (
                            <p className="pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Earlier</p>
                          )}
                          <button
                            onClick={() => p && setActive(p)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition ${
                              special
                                ? "border-yellow-400/40 bg-yellow-400/10"
                                : n.read
                                  ? "border-white/5 bg-white/5"
                                  : "border-cyan-400/40 bg-cyan-400/5"
                            } ${p ? "hover:bg-white/10" : "cursor-default"}`}
                          >
                            <div className="relative">
                              <Thumb post={p} fallback={icon} />
                              <span className="absolute -bottom-1 -right-1 text-base">{icon}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-gray-100">
                                {meta.solo ? meta.text : `@${n.actor_name || "someone"} ${meta.text}`}
                              </p>
                              <p className="truncate text-[10px] text-gray-400">
                                {n.post_title || "Untitled"} · {moment(n.created_date).fromNow()}
                                {!p && " · expired"}
                              </p>
                            </div>
                          </button>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-cyan-500/10 to-orange-500/5 p-8 text-center">
              <p className="mb-1 text-4xl">⚡</p>
              <p className="mb-2 text-lg font-black">See who keeps your posts alive</p>
              <p className="mb-5 text-xs leading-relaxed text-gray-400">
                Every hit, reaction, comment and last-minute rescue on your posts, live, plus an alert
                when one of them is about to die.
              </p>
              <button
                onClick={openAuth}
                className="mx-auto flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-5 py-2.5 text-sm font-black text-black transition-transform hover:scale-105 active:scale-95"
              >
                <LogIn className="h-4 w-4" /> Sign in / Create account
              </button>
            </section>
          )}
        </div>

        {/* ---------------- Right: everyone ---------------- */}
        <div className="space-y-6">
          <section>
            <SectionTitle icon={TrendingUp} color="text-orange-400">
              Hottest this hour
            </SectionTitle>
            {hottest.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-gray-400">
                Quiet hour. Your hit could put a post on top.
              </p>
            ) : (
              <div className="space-y-1.5">
                {hottest.map(({ post, n }, i) => (
                  <button
                    key={post.id}
                    onClick={() => setActive(post)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-2 text-left transition hover:bg-white/10"
                  >
                    <span className={`w-5 text-center text-sm font-black ${i === 0 ? "text-yellow-300" : "text-gray-500"}`}>
                      {i + 1}
                    </span>
                    <Thumb post={post} fallback="⚡" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-gray-100">{post.title || "Untitled"}</span>
                      <span className="block text-[10px] text-gray-400">
                        {post.isNews ? post.guest_author_id : "Member post"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-black text-orange-300">
                      +{n} ⚡
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle
              icon={Zap}
              right={<span className="text-[10px] text-gray-500">updates live</span>}
            >
              Just hit
            </SectionTitle>
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {ticker.map((v) => {
                  const p = byId.get(v.post_id);
                  return (
                    <motion.button
                      key={v.id}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setActive(p)}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-white/[0.03] p-1.5 text-left transition hover:bg-white/10"
                    >
                      <Image
                        src={p.thumbnail_url || p.media_url}
                        alt=""
                        fittingType="fill"
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-300">
                        🔥 <span className="font-semibold text-gray-100">{p.title || "Untitled"}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-gray-500">{moment(v.created_date).fromNow(true)}</span>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
              {ticker.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 p-4 text-center text-xs text-gray-400">
                  No hits yet. Be the first.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {active && (
          <PostDetail
            post={byId.get(active.id) || active}
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
