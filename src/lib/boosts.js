import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Shown in the app; the real prices are charged from
// supabase/functions/_shared/boosts.ts, so keep the two in sync.
export const BOOST_OPTIONS = [
  { product: "extend_1h", icon: "⏳", label: "+1 hour of life", price: "$0.99" },
  { product: "spotlight", icon: "🔦", label: "Spotlight: top of the feed for 30 min", price: "$2.99" },
];

export const isSpotlit = (post, now = Date.now()) =>
  !!post?.spotlight_until && new Date(post.spotlight_until).getTime() > now;

// Boosts stay hidden until switched on in app_settings (checked once per visit)
let enabledPromise = null;
export function useBoostsEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    enabledPromise ??= base44.rpc("boosts_enabled").catch(() => false);
    let alive = true;
    enabledPromise.then((on) => alive && setEnabled(!!on));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
