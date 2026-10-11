import React, { useEffect, useState } from "react";
import { onPresence } from "@/lib/presence";
import useGameRules from "@/hooks/useGameRules";

// The first thing on Home: proof the place is alive right now. Tapping
// "dying" jumps to the posts that need saving.
export default function LiveNow({ posts, onRescue }) {
  const [here, setHere] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const rules = useGameRules();

  useEffect(() => onPresence(setHere), []);
  useEffect(() => {
    const t = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const dying = posts.filter((p) => {
    const left = new Date(p.expires_at).getTime() - now;
    return (!p.is_trending || rules.trending_saves) && left > 0 && left < 10 * 60 * 1000;
  }).length;
  const trending = posts.filter((p) => p.is_trending).length;
  const fresh = posts.filter((p) => p.new_face && !p.isNews).length;

  const chip = "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold";

  return (
    <div data-tour="live" className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
      <span className={`${chip} border border-white/10 bg-white/5 text-gray-200`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
        </span>
        {Math.max(1, here)} here now
      </span>
      {dying > 0 && (
        <button onClick={onRescue} className={`${chip} border border-red-500/50 bg-red-500/15 text-red-200 active:scale-95`}>
          🚨 {dying} dying · save one
        </button>
      )}
      {trending > 0 && (
        <span className={`${chip} border border-orange-400/40 bg-orange-500/10 text-orange-200`}>🔥 {trending} trending</span>
      )}
      {fresh > 0 && (
        <span className={`${chip} border border-green-400/40 bg-green-500/10 text-green-200`}>🌱 {fresh} new faces</span>
      )}
    </div>
  );
}
