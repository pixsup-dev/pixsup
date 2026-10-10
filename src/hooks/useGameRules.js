import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// The game rules an admin can change (Admin → Settings): post life, time per
// hit/emoji/comment, the announcement… Fetched once per visit and refreshed
// every few minutes, with today's values until the server answers.
export const DEFAULT_RULES = {
  post_life_minutes: 60,
  hit_minutes: 5,
  react_minutes: 3,
  comment_minutes: 10,
  trending_points: 20,
  trending_hours: 24,
  revive_window_minutes: 10,
  revive_life_minutes: 30,
  revive_votes_needed: 3,
  posting_paused: false,
  announcement: "",
};

let cached = DEFAULT_RULES;
let pending = null;
let fetchedAt = 0;
const listeners = new Set();

function refresh(force = false) {
  if (pending || (!force && Date.now() - fetchedAt < 5 * 60 * 1000)) return pending;
  pending = base44
    .rpc("game_rules")
    .then((r) => {
      cached = { ...DEFAULT_RULES, ...(r || {}) };
      fetchedAt = Date.now();
      listeners.forEach((fn) => fn(cached));
    })
    .catch(() => {})
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function refreshGameRules() {
  return refresh(true);
}

export default function useGameRules() {
  const [rules, setRules] = useState(cached);
  useEffect(() => {
    listeners.add(setRules);
    refresh();
    const t = setInterval(() => refresh(), 5 * 60 * 1000);
    return () => {
      listeners.delete(setRules);
      clearInterval(t);
    };
  }, []);
  return rules;
}
