import React, { useCallback, useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { Flag, Loader2, ShieldCheck, EyeOff } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import ChallengeScheduler from "@/components/ChallengeScheduler";
import AppErrors from "@/components/AppErrors";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminTeam from "@/components/admin/AdminTeam";
import AdminSettings from "@/components/admin/AdminSettings";

const TABS = [
  ["overview", "📊 Overview"],
  ["reports", "🚩 Reports"],
  ["challenges", "📸 Challenges"],
  ["team", "👥 Team"],
  ["settings", "⚙️ Settings"],
  ["errors", "⚠️ Errors"],
];

// The admin center (profiles.role = 'admin'): overview, reports and bans,
// challenges, the admin team, settings and errors. Everything here is also
// enforced server-side: non-admins get nothing back from these calls.
export default function Admin() {
  const { user } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get("tab")) ? params.get("tab") : "overview";
  const openTab = (id) => setParams({ tab: id }, { replace: true });
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [banned, setBanned] = useState([]);
  const [chatReports, setChatReports] = useState([]);
  const [busy, setBusy] = useState(null); // `${action}:${id}` while running
  const [armed, setArmed] = useState(null); // destructive action awaiting a 2nd tap

  const load = useCallback(async () => {
    try {
      const flags = await base44.entities.Flag.list("-created_date", 1000);
      const byPost = {};
      for (const f of flags) {
        const entry = (byPost[f.post_id] ||= { reporters: new Set(), reasons: {}, latest: f.created_date });
        entry.reporters.add(f.created_by_id);
        const reason = f.reason || "Unspecified";
        entry.reasons[reason] = (entry.reasons[reason] || 0) + 1;
      }
      const postIds = Object.keys(byPost);
      const posts = postIds.length ? await base44.entities.Post.filter({ id: postIds }, undefined, 1000) : [];
      const authorIds = [...new Set(posts.map((p) => p.created_by_id).filter(Boolean))];
      const [authors, bannedProfiles] = await Promise.all([
        authorIds.length ? base44.entities.Profile.filter({ id: authorIds }, undefined, 1000) : [],
        base44.entities.Profile.filter({ banned: true }, undefined, 1000),
      ]);
      const authorById = Object.fromEntries(authors.map((a) => [a.id, a]));
      setQueue(
        posts
          .map((p) => ({ post: p, author: authorById[p.created_by_id], ...byPost[p.id] }))
          .sort((a, b) => b.reporters.size - a.reporters.size || (b.latest > a.latest ? 1 : -1))
      );
      setBanned(bannedProfiles);
      // Reported live-chat messages (copies: the messages themselves vanish)
      setChatReports(await base44.entities.ChatReport.list("-created_date", 200).catch(() => []));
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user?.role, load]);

  const run = async (key, fn, doneMessage) => {
    setBusy(key);
    setArmed(null);
    try {
      await fn();
      toast({ title: doneMessage });
      await load();
    } catch (e) {
      toast({ title: e.message || "Action failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // Destructive buttons need a second tap within the same card
  const confirmFirst = (key, action) => () => (armed === key ? action() : setArmed(key));

  if (user === undefined) return null;
  if (user?.role !== "admin") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-gray-400">
        This page is for moderators only.
      </main>
    );
  }

  const btn = "rounded-lg px-3 py-1.5 text-[11px] font-extrabold transition disabled:opacity-40";

  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-4">
      <h1 className="flex items-center gap-2 text-lg font-black text-white">
        <ShieldCheck className="h-5 w-5 text-cyan-300" /> Admin center
      </h1>
      <p className="mb-4 text-xs text-gray-400">
        Signed in as <b className="text-gray-200">@{user.username}</b> · admin
      </p>

      <div className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map(([id, label]) => {
          const count = id === "reports" ? queue.length + new Set(chatReports.map((r) => r.message_id)).size : 0;
          return (
            <button
              key={id}
              onClick={() => openTab(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                tab === id ? "bg-white text-black" : "border border-white/10 bg-white/5 text-gray-300 hover:text-white"
              }`}
            >
              {label}
              {count > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-black text-black">{count}</span>}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <AdminOverview onOpen={openTab} />}
      {tab === "challenges" && <ChallengeScheduler />}
      {tab === "team" && <AdminTeam me={user} />}
      {tab === "settings" && <AdminSettings />}
      {tab === "errors" && <AppErrors />}

      {tab === "reports" && (
      <>
      <p className="mb-3 text-xs text-gray-400">
        Reported posts, most-reported first. Posts with 3+ reporters are already hidden. App
        stores expect reports to be handled within 24 hours.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
        </div>
      ) : queue.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">
          No open reports. 🎉
        </p>
      ) : (
        <div className="space-y-3">
          {queue.map(({ post, author, reporters, reasons }) => {
            const authorName = post.isNews
              ? post.guest_author_id
              : author?.username || (post.created_by_id ? "member without username" : "guest");
            return (
              <div key={post.id} className="flex gap-3 rounded-2xl border border-white/10 bg-[#151c28] p-3">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-black">
                  {post.media_type === "video" ? (
                    <video src={post.media_url} className="h-full w-full object-cover" muted />
                  ) : (
                    <Image src={post.thumbnail_url || post.media_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-sm font-bold text-white">{post.title || "Untitled"}</p>
                  <p className="text-[11px] text-gray-400">
                    by <span className="font-semibold text-gray-200">{authorName}</span>
                    {author?.banned && <span className="ml-1 text-red-400">(banned)</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-orange-300">
                    <Flag className="h-3 w-3" /> {reporters.size} reporter{reporters.size === 1 ? "" : "s"} ·{" "}
                    {Object.entries(reasons).map(([r, n]) => `${r} ×${n}`).join(", ")}
                    {post.hidden_at && (
                      <span className="flex items-center gap-0.5 text-red-300">
                        · <EyeOff className="h-3 w-3" /> hidden
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        run(`keep:${post.id}`, async () => {
                          await base44.entities.Flag.deleteMany({ post_id: post.id });
                          if (post.hidden_at) await base44.rpc("admin_set_post_hidden", { p_post_id: post.id, p_hidden: false });
                        }, "Reports dismissed — post kept")
                      }
                      className={`${btn} border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10`}
                    >
                      Keep post
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={confirmFirst(`remove:${post.id}`, () =>
                        run(`remove:${post.id}`, () => base44.entities.Post.delete(post.id), "Post removed")
                      )}
                      className={`${btn} bg-orange-500 text-black hover:bg-orange-400`}
                    >
                      {armed === `remove:${post.id}` ? "Tap again to remove" : "Remove post"}
                    </button>
                    {post.created_by_id && !author?.banned && post.created_by_id !== user.id && (
                      <button
                        disabled={!!busy}
                        onClick={confirmFirst(`ban:${post.id}`, () =>
                          run(
                            `ban:${post.id}`,
                            () => base44.rpc("admin_set_banned", { p_user: post.created_by_id, p_banned: true, p_remove_posts: true }),
                            "Author banned and their posts removed"
                          )
                        )}
                        className={`${btn} bg-red-600 text-white hover:bg-red-500`}
                      >
                        {armed === `ban:${post.id}` ? "Tap again to ban" : "Ban author"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest text-red-400">
        Reported chat messages
      </h2>
      {chatReports.length === 0 ? (
        <p className="text-xs text-gray-500">No reported chat messages.</p>
      ) : (
        <ul className="space-y-2">
          {Object.values(
            chatReports.reduce((acc, r) => {
              (acc[r.message_id] ||= { ...r, reporters: 0, ids: [] }).reporters += 1;
              acc[r.message_id].ids.push(r.id);
              return acc;
            }, {})
          ).map((r) => (
            <li key={r.message_id} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-xs text-gray-200">
                <span className="font-bold text-violet-300">@{r.author_name}</span> {r.text}
              </p>
              <p className="text-[11px] text-orange-300">
                {r.reporters} reporter{r.reporters === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  disabled={!!busy}
                  onClick={() =>
                    run(`dismiss:${r.message_id}`, () => base44.entities.ChatReport.deleteMany({ id: r.ids }), "Report dismissed")
                  }
                  className={`${btn} border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10`}
                >
                  Dismiss
                </button>
                {r.author_id && r.author_id !== user.id && (
                  <button
                    disabled={!!busy}
                    onClick={confirmFirst(`chatban:${r.message_id}`, () =>
                      run(
                        `chatban:${r.message_id}`,
                        async () => {
                          await base44.rpc("admin_set_banned", { p_user: r.author_id, p_banned: true, p_remove_posts: true });
                          await base44.entities.ChatReport.deleteMany({ id: r.ids });
                        },
                        "Author banned"
                      )
                    )}
                    className={`${btn} bg-red-600 text-white hover:bg-red-500`}
                  >
                    {armed === `chatban:${r.message_id}` ? "Tap again to ban" : "Ban author"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest text-red-400">Banned accounts</h2>
      {banned.length === 0 ? (
        <p className="text-xs text-gray-500">Nobody is banned.</p>
      ) : (
        <ul className="space-y-2">
          {banned.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-xs text-gray-200">{p.username || p.email || p.id}</span>
              <button
                disabled={!!busy}
                onClick={() =>
                  run(`unban:${p.id}`, () => base44.rpc("admin_set_banned", { p_user: p.id, p_banned: false }), "Ban lifted")
                }
                className={`${btn} border border-white/15 text-gray-200 hover:bg-white/10`}
              >
                Unban
              </button>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </main>
  );
}
