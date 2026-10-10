import React, { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Image } from "@/components/ui/image";
import { formatRemaining } from "@/lib/time";
import { useMembers } from "@/hooks/useUsernames";
import Avatar from "@/components/Avatar";
import RowArrows, { useRowScroll } from "@/components/RowArrows";

// 🌱 New faces: the first posts of people who just joined, in their own row
// near the top of Home, so nobody's first post dies without being seen.
export default function NewFacesRow({ posts, user, onVote, onOpen, onSignIn }) {
  const [now, setNow] = useState(() => Date.now());
  const [hitIds, setHitIds] = useState(() => new Set());
  const row = useRowScroll();

  useEffect(() => {
    const t = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fresh = posts
    .filter((p) => p.new_face && !p.isNews && new Date(p.expires_at).getTime() > now)
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 12);
  const members = useMembers(fresh.map((p) => p.created_by_id));

  if (!fresh.length) return null;

  const hit = async (e, post) => {
    e.stopPropagation();
    if (!user) return onSignIn();
    if (hitIds.has(post.id)) return;
    if (await onVote(post)) setHitIds((prev) => new Set(prev).add(post.id));
  };

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-green-400">🌱 New faces</h2>
          <p className="text-[11px] text-gray-400">Their first posts on Pixsup. Give them a warm welcome 👋</p>
        </div>
        <RowArrows row={row} />
      </div>
      <div ref={row.ref} className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
        {fresh.map((p) => {
          const m = members[p.created_by_id];
          const done = hitIds.has(p.id) || (user && p.created_by_id === user.id);
          return (
            <div
              key={p.id}
              onClick={() => onOpen(p)}
              className="w-36 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-green-400/40 bg-[#151c28] shadow-[0_0_14px_rgba(74,222,128,0.15)]"
            >
              <div className="relative aspect-square">
                <Image src={p.thumbnail_url || p.media_url} alt={p.title} fittingType="fill" className="h-full w-full object-cover" />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-black text-black">
                  🌱 NEW
                </span>
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-orange-300">
                  {formatRemaining(new Date(p.expires_at).getTime() - now)}
                </span>
              </div>
              <div className="space-y-1.5 p-2">
                <p className="flex items-center gap-1.5 truncate text-[11px] font-bold text-gray-200">
                  <Avatar url={m?.avatar_url} name={m?.username} size={18} />
                  <span className="truncate">@{m?.username || "new member"}</span>
                </p>
                <button
                  onClick={(e) => hit(e, p)}
                  disabled={done}
                  className="flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-green-400 to-cyan-400 py-1.5 text-[11px] font-black text-black active:scale-95 disabled:from-white/10 disabled:to-white/10 disabled:text-gray-400"
                >
                  <Zap className="h-3 w-3" fill="currentColor" />
                  {user && p.created_by_id === user.id ? "Your post" : hitIds.has(p.id) ? "Welcomed!" : "Welcome hit"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
