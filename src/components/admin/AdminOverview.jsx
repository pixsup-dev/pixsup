import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// The numbers that matter, at a glance. Items needing attention are marked.
const CARDS = [
  ["members", "Members", (s) => (s.members_today ? `+${s.members_today} today` : "none new today")],
  ["live_member_posts", "Live member posts", (s) => `${s.live_posts} live in total`],
  ["posts_today", "Posts today", (s) => `${s.comments_today} comments · ${s.hits_today} hits`],
  ["trending", "Trending now", () => "on the 24-hour belt"],
  ["open_reports", "Reported posts", () => "waiting for review", "reports"],
  ["chat_reports", "Reported chat", () => "waiting for review", "reports"],
  ["errors_today", "App errors (24h)", () => "crashes people hit", "errors"],
  ["alert_devices", "Phones with alerts", () => "devices subscribed"],
];

export default function AdminOverview({ onOpen }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.rpc("admin_stats").then(setStats, (e) =>
      setError(/function|schema/i.test(e.message || "") ? "Run the admin center update to see these numbers." : e.message)
    );
  }, []);

  if (error) return <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">{error}</p>;
  if (!stats) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-cyan-400" />;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {CARDS.map(([key, label, sub, tab]) => {
        const value = stats[key] ?? 0;
        const alert = !!tab && value > 0;
        const Box = tab ? "button" : "div";
        return (
          <Box
            key={key}
            onClick={tab ? () => onOpen(tab) : undefined}
            className={`rounded-2xl border p-3 text-left ${
              alert ? "border-orange-400/50 bg-orange-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
            <p className={`mt-1 text-2xl font-black tabular-nums ${alert ? "text-orange-300" : "text-white"}`}>{value}</p>
            <p className="text-[11px] text-gray-500">{sub(stats)}</p>
          </Box>
        );
      })}
    </div>
  );
}
