import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { BOOST_OPTIONS, useBoostsEnabled } from "@/lib/boosts";
import { useToast } from "@/components/ui/use-toast";

// Paid Boosts for your own live post. Payment happens on Stripe's checkout
// page; the boost lands a few seconds after Stripe confirms it.
export default function BoostPanel({ post, user }) {
  const enabled = useBoostsEnabled();
  const [busy, setBusy] = useState(null);
  const { toast } = useToast();

  const live = post.expires_at && new Date(post.expires_at).getTime() > Date.now();
  if (!enabled || !user || post.created_by_id !== user.id || post.isNews || !live) return null;

  const buy = async (product) => {
    setBusy(product);
    try {
      const { data } = await base44.functions.invoke("createBoostCheckout", {
        post_id: post.id,
        product,
      });
      window.location.assign(data.url);
    } catch (e) {
      toast({ title: "Couldn't start the boost", description: e.message, variant: "destructive" });
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 p-3">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-yellow-300">
        ⚡ Boost your post
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {BOOST_OPTIONS.map((o) => (
          <button
            key={o.product}
            onClick={() => buy(o.product)}
            disabled={!!busy}
            className="spring-tap flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-bold text-white transition hover:border-yellow-400/50 active:scale-95 disabled:opacity-60"
          >
            <span>
              {o.icon} {o.label}
            </span>
            {busy === o.product ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-300" />
            ) : (
              <span className="shrink-0 text-yellow-300">{o.price}</span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        Secure payment by Stripe. Boosted posts are labelled in the feed.
      </p>
    </div>
  );
}
