import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// A post's poll. Members vote once (+3 minutes of life for the post); results
// show after voting, and for guests, who are asked to sign in to vote.
export default function PollCard({ post, user, onSignIn, onUpdate }) {
  const [myVote, setMyVote] = useState(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!user || !post.poll) return;
    let alive = true;
    base44.entities.PollVote.filter({ post_id: post.id, user_id: user.id }, undefined, 1)
      .then((rows) => alive && setMyVote(rows[0]?.option ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [post.id, post.poll, user]);

  if (!post.poll) return null;
  const options = post.poll.options || [];
  const counts = post.poll_counts || options.map(() => 0);
  const total = counts.reduce((s, n) => s + (n || 0), 0);
  const showResults = myVote !== null || !user;

  const vote = async (i) => {
    if (!user) return onSignIn?.();
    if (busy || myVote !== null) return;
    setBusy(true);
    try {
      const updated = await base44.rpc("vote_poll", { p_post_id: post.id, p_option: i });
      setMyVote(i);
      if (updated) onUpdate?.({ poll_counts: updated.poll_counts, expires_at: updated.expires_at });
    } catch (e) {
      toast({ title: e.message || "Couldn't vote", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
      <p className="mb-2 text-sm font-bold text-white">📊 {post.poll.question}</p>
      <div className="space-y-1.5">
        {options.map((label, i) => {
          const pct = total ? Math.round(((counts[i] || 0) * 100) / total) : 0;
          return (
            <button
              key={i}
              onClick={() => vote(i)}
              disabled={busy || (user && myVote !== null)}
              className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-gray-100 transition hover:border-violet-400/50 disabled:cursor-default"
            >
              {showResults && (
                <span
                  className={`absolute inset-y-0 left-0 ${myVote === i ? "bg-violet-500/40" : "bg-white/10"}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex justify-between gap-2">
                <span>
                  {label}
                  {myVote === i && " ✓"}
                </span>
                {showResults && <span className="font-bold text-violet-200">{pct}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-gray-400">
        {total === 1 ? "1 vote" : `${total} votes`}
        {!user && " · Sign in to vote"}
        {user && myVote === null && " · Voting adds 3 minutes of life"}
      </p>
    </div>
  );
}
