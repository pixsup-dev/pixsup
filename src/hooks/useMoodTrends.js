import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const FEELINGS = {
  "😮": "Shock",
  "😢": "Sadness",
  "😡": "Anger",
  "👏": "Applause",
  "🤔": "Doubt",
  "🔥": "Hype",
  "😂": "Laughter",
  "🤯": "Mind blown",
  "💀": "Dead",
};

// "😡 Anger rising"
export const moodLabel = (trend) =>
  trend ? `${trend.emoji} ${FEELINGS[trend.emoji] || "Reactions"} rising` : null;

// The mood rising on each post right now: the emoji used most in the last 30
// minutes (3+ times). Refreshed every minute. { [postId]: { emoji, recent } }
export default function useMoodTrends(postIds) {
  const [trends, setTrends] = useState({});
  const key = [...postIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () =>
      base44
        .rpc("mood_trends", { p_post_ids: key.split(",") })
        .then((rows) => {
          if (!alive) return;
          setTrends(Object.fromEntries((rows || []).map((r) => [r.post_id, r])));
        })
        .catch(() => {}); // not available yet: no trends shown
    load();
    const t = setInterval(load, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);

  return trends;
}
