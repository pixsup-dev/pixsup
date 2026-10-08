import React, { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Hourglass, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Home from "@/pages/Home";
import PostDetail from "@/components/PostDetail";
import { useToast } from "@/components/ui/use-toast";

// Target of shared links (pixsup.com/p/<id>): opens the post on top of the
// live feed, or explains that it has already expired.
export default function PostLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { handleVote, handleReact, openAuth } = useOutletContext();
  const [post, setPost] = useState(undefined); // undefined = loading, null = gone
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
        if (alive) setPost(live ? p : null);
      })
      .catch(() => alive && setPost(null));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <>
      <Home />
      {post === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
      )}
      {post === null && (
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
