import React, { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Hourglass, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Home from "@/pages/Home";
import PostDetail from "@/components/PostDetail";
import { useToast } from "@/components/ui/use-toast";
import { GraveCard, inGraveyard, useRevive } from "@/components/Graveyard";

// Target of shared links (pixsup.com/p/<id>): opens the post on top of the
// live feed, or explains that it has already expired.
export default function PostLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { handleVote, handleReact, openAuth, user, loadPosts } = useOutletContext();
  const [post, setPost] = useState(undefined); // undefined = loading, null = gone
  const [grave, setGrave] = useState(null); // died in the last 10 minutes: can be revived
  const [needed, setNeeded] = useState(3);
  const [now, setNow] = useState(() => Date.now());
  const { revive, busyId, voted } = useRevive(user, openAuth, (revived) => {
    setGrave(null);
    setPost(revived);
    loadPosts?.();
  });
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();

  // Back from Stripe Checkout (?boost=success|cancelled)
  useEffect(() => {
    const boost = params.get("boost");
    if (!boost) return;
    if (boost === "success") {
      toast({
        title: "⚡ Boost purchased!",
        description: "It kicks in within a few seconds of Stripe confirming your payment.",
      });
    } else {
      toast({ title: "Boost cancelled", description: "You weren't charged." });
    }
    setParams({}, { replace: true });
  }, [params, setParams, toast]);

  useEffect(() => {
    let alive = true;
    base44.entities.Post.filter({ id }, undefined, 1)
      .then((rows) => {
        const p = rows[0];
        const live = p && (!p.expires_at || new Date(p.expires_at) > new Date());
        if (!alive) return;
        setPost(live ? p : null);
        if (!live && inGraveyard(p)) {
          setGrave(p);
          base44.rpc("revive_votes_needed").then((n) => setNeeded(Number(n) || 3), () => {});
        }
      })
      .catch(() => alive && setPost(null));
    return () => {
      alive = false;
    };
  }, [id]);

  // the Graveyard countdown
  useEffect(() => {
    if (!grave) return;
    const t = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [grave]);

  const onRevive = async (p) => {
    const r = await revive(p);
    if (r && !r.revived) setGrave((g) => g && { ...g, revive_votes: r.votes });
  };

  return (
    <>
      <Home />
      {post === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
      )}
      {post === null && grave && inGraveyard(grave, now) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <div className="w-full max-w-sm space-y-3 text-center">
            <h2 className="text-lg font-black text-white">🪦 This post just died</h2>
            <p className="text-xs text-gray-400">
              It's in the Graveyard. If {needed} people tap Revive before the timer runs out, it comes back to life.
            </p>
            <GraveCard
              post={grave}
              now={now}
              needed={needed}
              user={user}
              busy={busyId === grave.id}
              hasVoted={voted.has(grave.id)}
              onRevive={onRevive}
              big
            />
            <Link to="/" className="inline-block text-xs font-bold text-cyan-300 hover:underline">
              See what's alive right now
            </Link>
          </div>
        </div>
      )}
      {post === null && !(grave && inGraveyard(grave, now)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-[#151c28] p-6 text-center">
            <Hourglass className="mx-auto h-8 w-8 text-orange-400" />
            <h2 className="text-base font-extrabold text-white">This post has expired</h2>
            <p className="text-xs text-gray-400">
              Posts on Pixsup only live as long as people keep them alive. Check out what's live right now.
            </p>
            <Link
              to="/"
              className="inline-block rounded-xl bg-cyan-400 px-4 py-2 text-xs font-extrabold text-black"
            >
              See the live feed
            </Link>
          </div>
        </div>
      )}
      <AnimatePresence>
        {post && (
          <PostDetail
            post={post}
            onClose={() => navigate("/")}
            onVote={handleVote}
            onReact={handleReact}
            onSignIn={openAuth}
          />
        )}
      </AnimatePresence>
    </>
  );
}
