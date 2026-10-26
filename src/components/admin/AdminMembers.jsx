import React, { useEffect, useState } from "react";
import moment from "moment";
import { Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Avatar from "@/components/Avatar";

const today = (d) => Date.now() - new Date(d).getTime() < 24 * 3600e3;

// Who joined, newest first, with a search by @username or email
export default function AdminMembers() {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // Search after a short pause in typing, not on every key
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    setMembers(null);
    base44.rpc("admin_members", { p_search: query || null, p_limit: 200 }).then(
      (rows) => alive && setMembers(rows || []),
      (e) =>
        alive &&
        setError(/function|schema/i.test(e.message || "") ? "Run the members update in Supabase to see this list." : e.message)
    );
    return () => {
      alive = false;
    };
  }, [query]);

  if (error) return <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">{error}</p>;

  const newToday = (members || []).filter((m) => today(m.joined)).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search @username or email"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      {!members ? (
        <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-cyan-400" />
      ) : members.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-xs text-gray-400">
          {query ? "Nobody matches that search." : "No members yet."}
        </p>
      ) : (
        <>
          <p className="px-1 text-[11px] text-gray-400">
            {query ? `${members.length} found` : `Newest first · ${members.length} shown`}
            {!query && newToday > 0 && ` · ${newToday} joined in the last 24 hours`}
          </p>
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
                <Avatar url={m.avatar_url} name={m.username || m.email} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-white">
                    {m.username ? `@${m.username}` : <span className="text-gray-400">No username yet</span>}
                    {today(m.joined) && (
                      <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-black text-black">NEW</span>
                    )}
                    {m.role === "admin" && (
                      <span className="rounded-full bg-cyan-400 px-1.5 py-0.5 text-[9px] font-black text-black">ADMIN</span>
                    )}
                    {m.banned && (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">BANNED</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-gray-400">
                    {m.email}
                    {m.signed_up_with === "google" && " · Google"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Joined {moment(m.joined).fromNow()}
                    {m.city && ` · 📍 ${m.city}`}
                    {` · ${m.posts_made || 0} post${m.posts_made === 1 ? "" : "s"}`}
                    {m.rescues > 0 && ` · 🦸 ${m.rescues} saves`}
                    {m.last_signed_in && ` · last signed in ${moment(m.last_signed_in).fromNow()}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
