import React, { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { Loader2, ShieldCheck } from "lucide-react";
import { base44, supabase } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import Avatar from "@/components/Avatar";

// Who the admins are, adding or removing one, and a log of admin changes
export default function AdminTeam({ me }) {
  const { toast } = useToast();
  const [team, setTeam] = useState(null);
  const [log, setLog] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(null);
  const [armed, setArmed] = useState(null);

  const load = useCallback(async () => {
    try {
      setTeam(await base44.rpc("admin_team"));
      const { data } = await supabase.from("admin_log").select("*").order("created_date", { ascending: false }).limit(50);
      setLog(data || []);
    } catch (e) {
      setTeam([]);
      toast({
        title: /function|schema/i.test(e.message || "") ? "Run the admin center update first" : e.message,
        variant: "destructive",
      });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = async (username, makeAdmin) => {
    const clean = username.replace(/^@/, "");
    setBusy(username);
    setArmed(null);
    try {
      await base44.rpc("admin_set_admin", { p_username: clean, p_admin: makeAdmin });
      toast({ title: makeAdmin ? `@${clean} is now an admin` : `@${clean} is no longer an admin` });
      setName("");
      await load();
    } catch (e) {
      toast({ title: e.message || "Couldn't change that", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-cyan-400">Admins</h2>
        <p className="mb-3 text-[11px] text-gray-400">
          Admins can open this page, handle reports, ban accounts and change the settings. Only add people you trust.
        </p>
        {team === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        ) : (
          <ul className="space-y-2">
            {team.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <Avatar url={a.avatar_url} name={a.username} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-bold text-white">
                    @{a.username || "no username"} <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
                    {a.id === me.id && <span className="text-[11px] font-semibold text-gray-400">(you)</span>}
                  </p>
                  <p className="text-[11px] text-gray-500">Member since {moment(a.since).format("MMM D, YYYY")}</p>
                </div>
                {a.id !== me.id && team.length > 1 && (
                  <button
                    disabled={!!busy}
                    onClick={() => (armed === a.id ? set(a.username, false) : setArmed(a.id))}
                    className="rounded-lg border border-red-400/40 px-2.5 py-1 text-[11px] font-bold text-red-300 disabled:opacity-40"
                  >
                    {armed === a.id ? "Tap again to remove" : "Remove"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) set(name.trim(), true);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            id="new-admin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="@username to make an admin"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
          />
          <button
            disabled={!!busy || !name.trim()}
            className="shrink-0 rounded-xl bg-cyan-400 px-4 text-xs font-black text-black disabled:opacity-40"
          >
            {busy && busy === name.trim() ? "…" : "Add admin"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">Activity log</h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-500">No admin changes yet. Team and settings changes show up here.</p>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {log.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                <span className="text-gray-200">
                  <b className="text-white">@{l.admin_name || "admin"}</b> {l.action.toLowerCase()}{" "}
                  <span className="text-cyan-300">{l.detail}</span>
                </span>
                <span className="shrink-0 text-[11px] text-gray-500">{moment(l.created_date).fromNow()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
