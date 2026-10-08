import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import { Image } from "@/components/ui/image";
import { Bell, Loader2, LogIn } from "lucide-react";

const hitsLabel = (n) => (n === 1 ? "1 hit" : `${n} hits`);

const NOTIF_META = {
  hit: { icon: "⚡", text: "hit your post" },
  reaction: { icon: "❤️", text: "reacted to your post" },
  comment: { icon: "💬", text: "commented on your post" },
  trending: { icon: "🔥", text: "entered the Trending Belt!" },
};

export default function Hits() {
  const { posts, user, openAuth, notifications, refreshNotifications } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [allMine, setAllMine] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [spikes, setSpikes] = useState([]);

  useEffect(() => {
    if (user === undefined) return;
    let alive = true;
    (async () => {
      try {
        if (user) {
          const mine = await base44.entities.Post.filter(
            { created_by_id: user.id },
            "-created_date",
            100
          );
          const myIds = new Set(mine.map((p) => p.id));
          const recent = await base44.entities.Vote.list("-created_date", 40);
          if (alive) {
            setAllMine(mine);
            setIncoming(recent.filter((v) => myIds.has(v.post_id)).slice(0, 12));
            setSpikes(recent.slice(0, 10));
          }
        } else {
          const recent = await base44.entities.Vote.list("-created_date", 40);
          if (alive) setSpikes(recent.slice(0, 10));
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Viewing the hub marks all of your activity as seen, then refreshes the bell badge
  useEffect(() => {
    if (user && notifications.length > 0) {
      base44.entities.Notification.updateMany(
        { recipient_id: user.id, read: false },
        { $set: { read: true } }
      )
        .then(() => refreshNotifications())
        .catch((e) => console.error(e));
    }
  }, [user, notifications.length, refreshNotifications]);

  const lookup = (id) =>
    posts.find((p) => p.id === id) || allMine.find((p) => p.id === id);

  const Pill = ({ vote }) => {
    const p = lookup(vote.post_id);
    const media = p ? p.thumbnail_url || p.media_url : null;
    return (
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-2.5 transition active:scale-95">
        {media ? (
          <Image src={media} alt={p.title} fittingType="fill" className="h-10 w-10 shrink-0 rounded" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10 text-xs">
            ⚡
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">
            {p ? p.title || "Untitled" : "An expired post"} received a hit
          </p>
          <p className="text-[10px] text-gray-400">
            {moment(vote.created_date).fromNow()}
            {p ? ` · ⚡ ${hitsLabel(p.hits || 0)} total` : ""}
          </p>
        </div>
      </div>
    );
  };

  const NotifRow = ({ n }) => {
    const p = lookup(n.post_id);
    const media = p ? p.thumbnail_url || p.media_url : null;
    const meta = NOTIF_META[n.type] || NOTIF_META.hit;
    const icon = n.type === "reaction" ? n.emoji || meta.icon : meta.icon;
    return (
      <div
        className={`mb-2 flex items-center gap-3 rounded-2xl border bg-white/5 p-2.5 transition active:scale-95 ${
          n.read ? "border-white/5" : "border-cyan-400/40 bg-cyan-400/5"
        }`}
      >
        {media ? (
          <Image
            src={media}
            alt={n.post_title}
            fittingType="fill"
            className="h-10 w-10 shrink-0 rounded"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/10 text-xs">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">
            {n.actor_name || "Someone"} {meta.text}
          </p>
          <p className="truncate text-[10px] text-gray-400">
            {icon} {n.post_title || "Untitled"} · {moment(n.created_date).fromNow()}
          </p>
        </div>
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-8 pt-4 sm:px-6">
      <h1 className="mb-1 text-lg font-black text-cyan-400">⚡ Live Hits Dashboard</h1>
      <p className="mb-4 text-xs text-gray-400">
        Real-time notifications, incoming hits on your posts and platform spikes.
      </p>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
                <Bell className="h-3.5 w-3.5" /> Recent Activity
              </h2>
              {user === null ? (
                <div className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
                  Sign in to see who hits, reacts and comments on your posts.
                  <button
                    onClick={openAuth}
                    className="mt-2 flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-3 py-1.5 text-xs font-black text-black transition-transform hover:scale-105 active:scale-95"
                  >
                    <LogIn className="h-3 w-3" /> Sign in
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
                  No activity yet — share something to the live grid!
                </p>
              ) : (
                notifications.map((n) => <NotifRow key={n.id} n={n} />)
              )}
            </section>
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-orange-400">
                Incoming on Your Posts
              </h2>
              {user !== null && incoming.length === 0 ? (
                <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
                  No hits on your posts yet — share something to the live grid!
                </p>
              ) : (
                incoming.map((v) => <Pill key={v.id} vote={v} />)
              )}
            </section>
          </div>
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
              Platform Hit Spikes
            </h2>
            {spikes.length === 0 ? (
              <p className="rounded-xl border border-white/5 bg-white/5 p-3 text-xs text-gray-400">
                The grid is quiet right now.
              </p>
            ) : (
              spikes.map((v) => <Pill key={v.id} vote={v} />)
            )}
          </section>
        </div>
      )}
    </main>
  );
}