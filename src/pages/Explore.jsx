import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Compass, Search, TrendingUp, X } from "lucide-react";
import TopicCard from "@/components/explore/TopicCard";
import ExploreTile from "@/components/explore/ExploreTile";
import PostDetail from "@/components/PostDetail";
import { topHashtags } from "@/components/CategoryChips";
import { engagementScore } from "@/lib/engagement";
import useInfiniteCount from "@/hooks/useInfiniteCount";
import { matchesSearch, searchTerms } from "@/lib/search";
import useUsernames from "@/hooks/useUsernames";

const PAGE = 30;
const time = (d) => new Date(d).getTime();
const byScore = (a, b) => engagementScore(b) - engagementScore(a) || time(b.created_date) - time(a.created_date);

const SORTS = [
  { id: "hot", label: "🔥 Hottest", filter: () => true, sort: byScore },
  { id: "trending", label: "🏆 Trending", filter: (p) => p.is_trending, sort: byScore },
  { id: "dying", label: "⏳ Dying soon", filter: (p) => !p.is_trending, sort: (a, b) => time(a.expires_at) - time(b.expires_at) },
  { id: "new", label: "✨ Newest", filter: () => true, sort: (a, b) => time(b.created_date) - time(a.created_date) },
  { id: "community", label: "👥 Community", filter: (p) => !p.isNews, sort: byScore },
  { id: "news", label: "📰 News", filter: (p) => p.isNews, sort: byScore },
  { id: "city", label: "📍 Near me", filter: () => true, sort: byScore },
];

const hasTag = (p, tag) => {
  const t = tag.toLowerCase();
  return (
    (p.hashtags || []).some((h) => h.toLowerCase() === t) ||
    `#${p.category || ""}`.toLowerCase() === t
  );
};

export default function Explore() {
  const { posts, user, category, setCategory, handleVote, handleReact, openAuth } = useOutletContext();
  const myCity = (user?.city || "").toLowerCase();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  // ?sort=trending (from the belt's "See all") opens that tab
  const [params] = useSearchParams();
  const [sortId, setSortId] = useState(() =>
    SORTS.some((s) => s.id === params.get("sort")) ? params.get("sort") : "hot"
  );
  useEffect(() => {
    const s = params.get("sort");
    if (SORTS.some((x) => x.id === s)) setSortId(s);
  }, [params]);
  // more tiles load as you scroll; back to the first page on a new sort or search
  const [visible, moreRef, showMore] = useInfiniteCount(PAGE, `${sortId}|${q}`);
  const [now, setNow] = useState(() => Date.now());
  const [activePost, setActivePost] = useState(null);

  useEffect(() => {
    const t = setInterval(() => !document.documentElement.dataset.reels && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Topic cards with their most-engaged live post as the cover (no photo used twice)
  const topics = useMemo(() => {
    const used = new Set();
    return topHashtags(posts, 8).map((t) => {
      const ranked = posts.filter((p) => hasTag(p, t.tag)).sort(byScore);
      const cover = ranked.find((p) => !used.has(p.id)) || ranked[0];
      if (cover) used.add(cover.id);
      return { ...t, cover };
    });
  }, [posts]);

  const query = q.trim().toLowerCase();
  const terms = useMemo(() => searchTerms(q), [q]);
  const names = useUsernames(terms.length ? posts.filter((p) => !p.isNews).map((p) => p.created_by_id) : []);
  const sort = SORTS.find((s) => s.id === sortId);
  const results = useMemo(() => {
    const matches = (p) => matchesSearch(p, terms, names);
    const inCity = (p) => sort.id !== "city" || (!!myCity && (p.city || "").toLowerCase() === myCity);
    return posts.filter((p) => sort.filter(p) && inCity(p) && matches(p)).sort(sort.sort);
  }, [posts, terms, names, sort, myCity]);

  const shown = results.slice(0, visible);

  const openTopic = (tag) => {
    setCategory(tag);
    navigate("/");
  };

  return (
    <main className="mx-auto max-w-7xl px-3 pb-8 pt-4 sm:px-6">
      <div className="mb-5 space-y-3">
        <h1 className="flex items-center gap-2 text-xl font-black">
          <Compass className="h-5 w-5 text-cyan-400" /> Explore
        </h1>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts, topics, tags or news sources..."
            className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-10 text-sm text-white placeholder-gray-400 transition-all focus:border-cyan-400 focus:outline-none"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!query && topics.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
            <TrendingUp className="h-3.5 w-3.5" /> Trending topics
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {topics.map((t) => (
              <TopicCard
                key={t.tag}
                tag={t.tag}
                count={t.n}
                cover={t.cover?.thumbnail_url || t.cover?.media_url}
                active={category === t.tag}
                onClick={() => openTopic(t.tag)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="pb-4">
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSortId(s.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                s.id === sortId
                  ? "bg-white text-black"
                  : "border border-white/10 bg-white/5 text-gray-300 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {query && (
          <p className="mb-2 text-xs text-gray-400">
            {results.length} {results.length === 1 ? "result" : "results"} for "{q.trim()}"
          </p>
        )}

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-16 text-center text-sm text-gray-400">
            {sortId === "city" && !myCity ? (
              <>
                Set your city in{" "}
                <Link to="/settings" className="font-bold text-cyan-300 underline">
                  Settings
                </Link>{" "}
                to see what's alive near you.
              </>
            ) : sortId === "city" ? (
              `Nothing live in ${user.city} yet. Post something and put ${user.city} on the map! 📍`
            ) : sortId === "community" && !query ? (
              "No community posts live right now. Be the first. Tap + to post."
            ) : (
              "Nothing matches right now."
            )}
          </p>
        ) : (
          <>
            {/* Mosaic: every 10th tile (from the first) is big */}
            <div className="grid grid-flow-row-dense grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-6">
              {shown.map((p, i) => (
                <ExploreTile key={p.id} post={p} now={now} big={i % 10 === 0} onOpen={setActivePost} />
              ))}
            </div>
            {results.length > visible && (
              <button
                ref={moreRef}
                onClick={showMore}
                className="spring-tap mx-auto mt-4 block rounded-full border border-cyan-400/40 bg-cyan-400/10 px-6 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
              >
                Load more
              </button>
            )}
          </>
        )}
      </section>

      <AnimatePresence>
        {activePost && (
          <PostDetail
            post={posts.find((p) => p.id === activePost.id) || activePost}
            list={results}
            onNavigate={setActivePost}
            onClose={() => setActivePost(null)}
            onVote={handleVote}
            onReact={handleReact}
            onSignIn={openAuth}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
