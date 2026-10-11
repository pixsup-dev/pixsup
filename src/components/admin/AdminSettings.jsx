import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { refreshGameRules } from "@/hooks/useGameRules";

// The handful of controls worth changing live. Each one says what it does;
// every change is written to the activity log.
const GROUPS = [
  {
    title: "🚨 Emergency",
    items: [
      {
        key: "posting_paused",
        type: "switch",
        label: "Pause posting",
        help: "Stops new uploads for everyone except admins. Use it during a spam wave or an outage.",
        danger: true,
      },
      {
        key: "announcement",
        type: "text",
        label: "Announcement banner",
        help: "Shown at the top of the app for everyone. Leave empty for no banner.",
      },
    ],
  },
  {
    title: "🏠 Home sections",
    items: [
      { key: "show_live_now", type: "switch", label: "👀 Live right now line", help: "People here, posts dying, trending and new faces, at the top of Home." },
      { key: "show_new_faces", type: "switch", label: "🌱 New faces row", help: "New members' first posts, so they get seen." },
      { key: "show_rescue_row", type: "switch", label: "🚨 About to die row", help: "Posts with under 10 minutes left." },
      { key: "show_graveyard", type: "switch", label: "🪦 Graveyard row", help: "Posts that just died and can still be revived." },
    ],
  },
  {
    title: "⏳ Time rules",
    items: [
      { key: "post_life_minutes", type: "number", label: "New posts live for", unit: "min", help: "How long a post lives before anyone engages." },
      { key: "hit_minutes", type: "number", label: "Each ⚡ Hit adds", unit: "min" },
      { key: "react_minutes", type: "number", label: "Each emoji adds", unit: "min" },
      { key: "comment_minutes", type: "number", label: "A comment adds", unit: "min" },
      { key: "rescue_minutes", type: "number", label: "🚨 A save puts it back to", unit: "min", help: "Hitting someone else's post in its last 10 minutes resets its timer to this." },
    ],
  },
  {
    title: "🔥 Trending & 🧟 Graveyard",
    items: [
      {
        key: "trending_points",
        type: "number",
        label: "Points to trend",
        unit: "pts",
        help: "Hit = 1, emoji = 2, comment = 5. Lower it while the community is small.",
      },
      { key: "revive_votes_needed", type: "number", label: "Revives needed", unit: "people" },
    ],
  },
  {
    title: "🛡️ Fair play",
    items: [
      {
        key: "reaction_caps",
        type: "switch",
        label: "Fair reactions",
        help: "On: a person's emoji adds time once per post. Off: unlimited, for testing.",
        launch: true,
      },
      {
        key: "comment_caps",
        type: "switch",
        label: "Fair comments",
        help: "On: only a person's first comment on a post adds time.",
        launch: true,
      },
      { key: "posts_per_hour", type: "number", label: "Posts per person per hour", unit: "max" },
    ],
  },
  {
    title: "🤖 Safety & money",
    items: [
      { key: "ai_moderation_required", type: "switch", label: "AI checks every photo", help: "Blocks nudity, violence and hate before it posts.", launch: true },
      { key: "text_moderation_required", type: "switch", label: "AI checks comments and chat", help: "Blocks harassment, hate, spam and private details.", launch: true },
      { key: "boosts_enabled", type: "switch", label: "Paid boosts", help: "Needs Stripe set up first." },
    ],
  },
];

function NumberField({ item, value, busy, onSave }) {
  const [v, setV] = useState(String(value ?? ""));
  useEffect(() => setV(String(value ?? "")), [value]);
  const changed = v !== "" && Number(v) !== Number(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) onSave(Number(v));
      }}
      className="flex shrink-0 items-center gap-1.5"
    >
      <input
        id={`setting-${item.key}`}
        type="number"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-sm tabular-nums text-white"
      />
      <span className="w-9 text-[11px] text-gray-400">{item.unit}</span>
      <button disabled={busy || !changed} className="rounded-lg bg-cyan-400 px-2.5 py-1 text-[11px] font-black text-black disabled:opacity-30">
        Save
      </button>
    </form>
  );
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    base44.rpc("admin_settings").then(
      (v) => {
        setValues(v || {});
        setNotice(v?.announcement || "");
      },
      (e) => {
        setValues({});
        toast({
          title: /function|schema/i.test(e.message || "") ? "Run the admin update first" : e.message,
          variant: "destructive",
        });
      }
    );
  }, [toast]);

  const save = async (key, value, message) => {
    setBusy(key);
    try {
      await base44.rpc("admin_set_setting", { p_key: key, p_value: value });
      setValues((v) => ({ ...v, [key]: value }));
      refreshGameRules();
      toast({ title: message });
    } catch (e) {
      toast({ title: e.message || "Couldn't save", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!values) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-cyan-400" />;

  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">{g.title}</h2>
          <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/5">
            {g.items.map((item) => {
              const on = values[item.key] === true;
              const warn = (item.launch && !on) || (item.danger && on);
              return (
                <div key={item.key} className={`p-3 ${warn ? "bg-orange-500/10" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{item.label}</p>
                      {item.help && <p className="text-[11px] text-gray-400">{item.help}</p>}
                      {item.launch && !on && (
                        <p className="mt-0.5 text-[11px] font-bold text-orange-300">⚠️ Turn this on before inviting people</p>
                      )}
                      {item.danger && on && <p className="mt-0.5 text-[11px] font-bold text-orange-300">⚠️ Posting is paused right now</p>}
                    </div>
                    {item.type === "switch" && (
                      <button
                        role="switch"
                        aria-checked={on}
                        aria-label={item.label}
                        disabled={busy === item.key}
                        onClick={() => save(item.key, !on, `${item.label}: ${on ? "off" : "on"}`)}
                        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                          on ? (item.danger ? "bg-orange-500" : "bg-green-500") : "bg-white/15"
                        }`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    )}
                    {item.type === "number" && (
                      <NumberField
                        item={item}
                        value={values[item.key]}
                        busy={busy === item.key}
                        onSave={(n) => save(item.key, n, `${item.label}: ${n} ${item.unit}`)}
                      />
                    )}
                  </div>
                  {item.type === "text" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        save("announcement", notice.trim(), notice.trim() ? "Announcement is live" : "Announcement removed");
                      }}
                      className="mt-2 flex gap-2"
                    >
                      <input
                        id="setting-announcement"
                        value={notice}
                        maxLength={200}
                        onChange={(e) => setNotice(e.target.value)}
                        placeholder="e.g. Pixsup is updating at 9 PM, back in 5 minutes"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-gray-500"
                      />
                      <button
                        disabled={busy === "announcement" || notice.trim() === (values.announcement || "")}
                        className="rounded-lg bg-cyan-400 px-3 text-[11px] font-black text-black disabled:opacity-30"
                      >
                        {notice.trim() ? "Post" : "Clear"}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-gray-500">
        Changes apply right away for new actions. Every change is listed in Team → Activity log.
      </p>
    </div>
  );
}
