import React, { useEffect, useState } from "react";
import { MapPin, Sunrise } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Normalises "  new york " to "New York" so posts from the same city match
export const cleanCity = (c) =>
  String(c || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase())
    .slice(0, 60);

// Members' preferences: their city (for City Pulse) and the Morning Pulse email
export default function PreferencesSection({ user, onSaved }) {
  const { toast } = useToast();
  const [city, setCity] = useState(user.city || "");
  const [saving, setSaving] = useState(null);

  useEffect(() => setCity(user.city || ""), [user.city]);

  const save = async (key, data, message) => {
    setSaving(key);
    try {
      await base44.auth.updateMe(data);
      await onSaved?.();
      toast({ title: message });
    } catch (e) {
      toast({
        title: "Couldn't save",
        description: /column|schema/i.test(e.message || "") ? "This setting isn't available yet." : e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const cleaned = cleanCity(city);

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">⚙️ Preferences</h2>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-200">
            <MapPin className="h-3.5 w-3.5 text-cyan-400" /> Your city
          </p>
          <p className="mb-2 text-[11px] text-gray-400">
            Your posts show up in your city's 📍 City Pulse, and you see what's alive near you. Only the
            city name is shared, never your location.
          </p>
          <div className="flex gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              placeholder="e.g. New York"
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              onClick={() =>
                save("city", { city: cleaned || null }, cleaned ? `City set to ${cleaned}` : "City removed")
              }
              disabled={saving === "city" || cleaned === (user.city || "")}
              className="shrink-0 rounded-xl bg-cyan-400 px-4 text-xs font-extrabold text-black disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1 text-xs font-bold text-gray-200">
              <Sunrise className="h-3.5 w-3.5 text-orange-400" /> Morning Pulse email
            </p>
            <p className="text-[11px] text-gray-400">
              Once a day: the posts and stories people kept alive in the last 24 hours, plus today's
              challenge. Unsubscribe any time.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={!!user.morning_pulse}
            onClick={() =>
              save(
                "pulse",
                { morning_pulse: !user.morning_pulse },
                user.morning_pulse ? "Morning Pulse turned off" : "Morning Pulse turned on ☀️"
              )
            }
            disabled={saving === "pulse"}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
              user.morning_pulse ? "bg-orange-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                user.morning_pulse ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
