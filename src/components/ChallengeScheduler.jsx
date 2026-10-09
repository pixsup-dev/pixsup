import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

// Admins: schedule the Daily Challenge for any day (UTC), optionally sponsored.
// Days left unscheduled get the next prompt from the built-in rotation.
export default function ChallengeScheduler() {
  const { toast } = useToast();
  const [upcoming, setUpcoming] = useState([]);
  const [form, setForm] = useState({ day: tomorrow(), prompt: "", tag: "#", sponsor: "", sponsor_url: "" });
  const [busy, setBusy] = useState(false);

  const load = () =>
    base44.entities.DailyChallenge.list("-day", 14)
      .then(setUpcoming)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const validTag = /^#[A-Za-z0-9]{2,30}$/.test(form.tag);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await base44.rpc("admin_set_challenge", {
        p_day: form.day,
        p_prompt: form.prompt,
        p_tag: form.tag,
        p_sponsor: form.sponsor || null,
        p_sponsor_url: form.sponsor_url || null,
      });
      toast({ title: `Challenge set for ${form.day}` });
      setForm({ day: tomorrow(), prompt: "", tag: "#", sponsor: "", sponsor_url: "" });
      load();
    } catch (err) {
      toast({ title: err.message || "Couldn't save", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none";

  return (
    <section>
      <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest text-orange-400">📸 Daily challenges</h2>
      <form onSubmit={save} className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="grid gap-2 sm:grid-cols-[140px_1fr_160px]">
          <input type="date" value={form.day} onChange={set("day")} className={input} required />
          <input value={form.prompt} onChange={set("prompt")} maxLength={120} placeholder="Prompt, e.g. Show us your sneakers" className={input} required />
          <input value={form.tag} onChange={set("tag")} maxLength={31} placeholder="#ShowYourSneakers" className={input} required />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.sponsor} onChange={set("sponsor")} maxLength={60} placeholder="Sponsor name (optional)" className={input} />
          <input value={form.sponsor_url} onChange={set("sponsor_url")} placeholder="Sponsor link, https://… (optional)" className={input} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-gray-500">
            Tag: # then 2–30 letters or numbers, no spaces. Days are UTC. Unscheduled days use the built-in rotation.
          </p>
          <button
            disabled={busy || !validTag || !form.prompt.trim()}
            className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-extrabold text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
      {upcoming.length > 0 && (
        <ul className="mt-2 space-y-1">
          {upcoming.map((c) => (
            <li key={c.day} className="flex flex-wrap gap-x-2 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[11px] text-gray-300">
              <span className="font-mono text-gray-500">{c.day}</span>
              <span className="font-bold text-white">{c.prompt}</span>
              <span className="text-cyan-300">{c.tag}</span>
              {c.sponsor && <span className="text-orange-300">· {c.sponsor}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
