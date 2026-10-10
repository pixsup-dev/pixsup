import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44, supabase } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import ShareButton from "@/components/ShareButton";

export const GRAVE_MS = 10 * 60 * 1000; // a dead post can be revived for 10 minutes

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// A member's post that died in the last 10 minutes and hasn't been revived yet
export const inGraveyard = (post, now = Date.now()) =>
  !!post &&
  !post.isNews &&
  !post.revived_at &&
  !post.hidden_at &&
  !!post.expires_at &&
  now >= new Date(post.expires_at).getTime() &&
  now - new Date(post.expires_at).getTime() < GRAVE_MS;

let neededPromise = null;
const votesNeeded = () => (neededPromise ??= base44.rpc("revive_votes_needed").catch(() => 3));

// Vote to revive: shared by the Graveyard row and the shared-link page.
// Returns { votes, needed, revived, post } or null on failure.
export function useRevive(user, onSignIn, onRevived) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState(null);
  const [voted, setVoted] = useState(() => new Set());

  const revive = useCallback(
    async (post) => {
      if (!user) return onSignIn?.();
      setBusyId(post.id);
      try {
        const r = await base44.rpc("revive_post", { p_post_id: post.id });
        setVoted((v) => new Set(v).add(post.id));
        if (r.revived) {
          toast({ title: "🧟 It's alive!", description: "Your revive brought it back for 30 more minutes." });
          onRevived?.(r.post);
        } else {
          toast({
            title: `🧟 Revive ${r.votes}/${r.needed}`,
            description: `${r.needed - r.votes} more and it comes back. Share it!`,
          });
        }
        return r;
      } catch (e) {
        toast({ title: e.message || "Couldn't revive it", variant: "destructive" });
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [user, onSignIn, onRevived, toast]
  );

  return { revive, busyId, voted, setVoted };
}

// One dead post: black and white, a countdown and the Revive button
export function GraveCard({ post, now, needed, user, busy, hasVoted, onRevive, big = false }) {
  const left = new Date(post.expires_at).getTime() + GRAVE_MS - now;
  const mine = user && post.created_by_id === user.id;
  const votes = post.revive_votes || 0;

  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#151c28] ${big ? "w-full" : "w-40 shrink-0"}`}>
      <div className={`relative ${big ? "aspect-[4/3]" : "aspect-square"}`}>
        <Image
          src={post.thumbnail_url || post.media_url}
          alt={post.title}
          fittingType="fill"
          className="h-full w-full object-cover opacity-70 grayscale"
        />
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-black text-gray-200">
          🪦 {mmss(left)} to revive
        </span>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
          <p className={`truncate font-bold text-white ${big ? "text-sm" : "text-[11px]"}`}>{post.title || "Untitled"}</p>
          <div className="mt-1 flex gap-1">
            {Array.from({ length: needed }).map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < votes ? "bg-green-400" : "bg-white/20"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="p-2">
        {mine ? (
          <ShareButton
            post={post}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-green-400/40 bg-green-500/10 py-1.5 text-[11px] font-extrabold text-green-300"
          >
            📣 Share to revive
          </ShareButton>
        ) : (
          <button
            onClick={() => onRevive(post)}
            disabled={busy || hasVoted}
            className="spring-tap flex w-full items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-400 py-1.5 text-[11px] font-black text-black disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : hasVoted ? "✓ You voted" : `🧟 Revive ${votes}/${needed}`}
          </button>
        )}
      </div>
    </div>
  );
}

// 🪦 The Graveyard row on Home: posts that died in the last 10 minutes
export default function Graveyard({ user, onSignIn, onRevived }) {
  const [dead, setDead] = useState([]);
  const [needed, setNeeded] = useState(3);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("isNews", false)
      .is("hidden_at", null)
      .is("revived_at", null)
      .lte("expires_at", nowIso)
      .gt("expires_at", new Date(Date.now() - GRAVE_MS).toISOString())
      .order("expires_at", { ascending: false })
      .limit(20);
    setDead(data || []);
  }, []);

  const { revive, busyId, voted, setVoted } = useRevive(user, onSignIn, (post) => {
    setDead((d) => d.filter((p) => p.id !== post.id));
    onRevived?.(post);
  });

  useEffect(() => {
    votesNeeded().then((n) => setNeeded(Number(n) || 3));
    load();
    const poll = setInterval(load, 15000);
    const tick = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  // Which of these the member already voted for
  const ids = dead.map((p) => p.id).join(",");
  useEffect(() => {
    if (!user || !ids) return;
    supabase
      .from("revive_votes")
      .select("post_id")
      .in("post_id", ids.split(","))
      .then(({ data }) => data && setVoted(new Set(data.map((v) => v.post_id))));
  }, [user?.id, ids, setVoted]);

  const shown = dead.filter((p) => inGraveyard(p, now));
  if (!shown.length) return null;

  const onRevive = async (post) => {
    const r = await revive(post);
    if (r && !r.revived) setDead((d) => d.map((p) => (p.id === post.id ? { ...p, revive_votes: r.votes } : p)));
  };

  return (
    <section className="mb-6">
      <h2 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gray-300">
        🪦 Graveyard
      </h2>
      <p className="mb-2 text-[11px] text-gray-400">
        These just died. If {needed} people tap Revive in the next 10 minutes, it comes back. Once only.
      </p>
      <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
        {shown.map((p) => (
          <GraveCard
            key={p.id}
            post={p}
            now={now}
            needed={needed}
            user={user}
            busy={busyId === p.id}
            hasVoted={voted.has(p.id)}
            onRevive={onRevive}
          />
        ))}
      </div>
    </section>
  );
}
