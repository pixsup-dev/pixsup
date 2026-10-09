import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Same categories the AI tags posts with (supabase/functions/_shared/gemini.ts)
const TOPICS = [
  ["Food", "🍔"], ["Pets", "🐾"], ["Nature", "🌿"], ["Travel", "✈️"], ["Funny", "😂"], ["Art", "🎨"],
  ["Sports", "⚽"], ["Cars", "🚗"], ["Music", "🎵"], ["Fashion", "👗"], ["Beauty", "💄"], ["Tech", "💻"],
  ["Gaming", "🎮"], ["People", "🧑"], ["Urban", "🏙️"], ["AI", "🤖"],
];
const MAX = 5;

// 🛟 Rescue Radar: pick topics and/or your city; when a post there is dying,
// you get a phone alert so you can save it (3 a day at most)
export default function RadarSection({ user, onSaved }) {
  const { toast } = useToast();
  const [topics, setTopics] = useState(user.radar_topics || []);
  const [city, setCity] = useState(!!user.radar_city);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTopics(user.radar_topics || []);
    setCity(!!user.radar_city);
  }, [user.radar_topics, user.radar_city]);

  const changed =
    city !== !!user.radar_city || [...topics].sort().join() !== [...(user.radar_topics || [])].sort().join();

  const flip = (t) =>
    setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX ? [...cur, t] : cur));

  const save = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ radar_topics: topics, radar_city: city });
      await onSaved?.();
      toast({
        title: topics.length || city ? "Rescue Radar on 🛟" : "Rescue Radar off",
        description: topics.length || city ? "We'll ping you when a post there needs saving." : undefined,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Couldn't save",
        description: /column|schema/i.test(e.message || "") ? "Rescue Radar isn't switched on yet." : e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">🛟 Rescue Radar</h2>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="mb-3 text-[11px] text-gray-400">
          Pick up to {MAX} topics you care about. When a post there is about to die and needs saving, we'll
          ping you (3 times a day at most). Needs phone alerts on.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map(([t, icon]) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                onClick={() => flip(t)}
                disabled={!on && topics.length >= MAX}
                className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-30 ${
                  on ? "bg-orange-500 text-black" : "border border-white/15 bg-white/5 text-gray-300 hover:text-white"
                }`}
              >
                {icon} {t}
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-200">
          <input
            type="checkbox"
            checked={city}
            disabled={!user.city}
            onChange={(e) => setCity(e.target.checked)}
            className="h-4 w-4 accent-orange-500"
          />
          {user.city ? (
            <span>📍 Posts from {user.city}</span>
          ) : (
            <span className="text-gray-400">📍 Posts from your city (set your city above first)</span>
          )}
        </label>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">{topics.length}/{MAX} topics</span>
          <button
            onClick={save}
            disabled={saving || !changed}
            className="rounded-xl bg-cyan-400 px-4 py-1.5 text-xs font-extrabold text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
