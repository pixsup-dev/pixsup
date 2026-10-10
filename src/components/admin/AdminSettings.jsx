import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const SWITCHES = [
  {
    key: "reaction_caps",
    label: "Fair reactions (bot protection)",
    help: "On: each person's emoji adds time once per post. Off: unlimited emoji time, for testing only.",
    launch: true,
  },
  {
    key: "ai_moderation_required",
    label: "AI checks every photo",
    help: "Uploads are checked for nudity, violence and hate before they post.",
    launch: true,
  },
  {
    key: "text_moderation_required",
    label: "AI checks comments and chat",
    help: "Harassment, hate, spam and private details are blocked before they post.",
    launch: true,
  },
  {
    key: "boosts_enabled",
    label: "Paid boosts",
    help: "Lets people pay to extend or spotlight a post. Needs Stripe set up first.",
  },
];

// The switches that matter, with what each one does. Changes are logged.
export default function AdminSettings() {
  const { toast } = useToast();
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(null);
  const [revives, setRevives] = useState("");

  useEffect(() => {
    base44.rpc("admin_settings").then(
      (v) => {
        setValues(v || {});
        setRevives(String(v?.revive_votes_needed ?? 3));
      },
      (e) => {
        setValues({});
        toast({
          title: /function|schema/i.test(e.message || "") ? "Run the admin center update first" : e.message,
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
      toast({ title: message });
    } catch (e) {
      toast({ title: e.message || "Couldn't save", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!values) return <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-cyan-400" />;

  return (
    <div className="space-y-2.5">
      {SWITCHES.map((s) => {
        const on = values[s.key] === true;
        const warn = s.launch && !on;
        return (
          <div
            key={s.key}
            className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
              warn ? "border-orange-400/50 bg-orange-500/10" : "border-white/10 bg-white/5"
            }`}
          >
            <div>
              <p className="text-sm font-bold text-white">{s.label}</p>
              <p className="text-[11px] text-gray-400">{s.help}</p>
              {warn && <p className="mt-1 text-[11px] font-bold text-orange-300">⚠️ Turn this on before inviting people</p>}
            </div>
            <button
              role="switch"
              aria-checked={on}
              aria-label={s.label}
              disabled={busy === s.key}
              onClick={() => save(s.key, !on, `${s.label}: ${on ? "off" : "on"}`)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-green-500" : "bg-white/15"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save("revive_votes_needed", Number(revives), `Revives needed: ${revives}`);
        }}
        className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
      >
        <div>
          <p className="text-sm font-bold text-white">Revives needed</p>
          <p className="text-[11px] text-gray-400">How many people must tap 🧟 Revive to bring a post back from the Graveyard.</p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <input
            id="revives-needed"
            type="number"
            min={1}
            max={20}
            value={revives}
            onChange={(e) => setRevives(e.target.value)}
            className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
          />
          <button
            disabled={busy === "revive_votes_needed" || Number(revives) === values.revive_votes_needed}
            className="rounded-lg bg-cyan-400 px-3 text-xs font-black text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
