import React, { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Compass, Search, Flame, TrendingUp } from "lucide-react";
import TopicCard from "@/components/explore/TopicCard";
import ExploreTile from "@/components/explore/ExploreTile";
import PostDetail from "@/components/PostDetail";
import { topHashtags } from "@/components/CategoryChips";
import { engagementScore } from "@/lib/engagement";

export default function Explore() {
  const { posts, category, setCategory, handleVote, handleReact, openAuth } =
    useOutletContext();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [activePost, setActivePost] = useState(null);

  // Trending topic cards, recalculated live from the current posts
  const topics = useMemo(() => topHashtags(posts, 8), [posts]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    let list = posts;
    if (query) {
      list = posts.filter((p) => {
        const title = (p.title || "").toLowerCase();
        const inTags =
          (p.hashtags || []).some((h) => h.toLowerCase().includes(query)) ||
          (p.category || "").toLowerCase().includes(query);
        return title.includes(query) || inTags;
      });
    } else {
      list = [...posts].sort((a, b) => engagementScore(b) - engagementScore(a));
    }
    return list.slice(0, 30);
  }, [posts, query]);

  const openTopic = (tag) => {
    setCategory(tag);
    navigate("/");
  };

  return (
    <main className="mx-auto max-w-7xl px-3 pb-8 pt-4 sm:px-6">
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-cyan-400" />
          <h1 className="font-display text-xl font-black tracking-wide">
            Explore
          </h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search live posts, topics and tags..."
            className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-400 transition-all focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
          <TrendingUp className="h-3.5 w-3.5" /> Trending Topics
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {topics.map((t, i) => (
            <TopicCard
              key={t.tag}
              tag={t.tag}
              count={t.n}
              index={i}
              active={category === t.tag}
              onClick={() => openTopic(t.tag)}
            />
          ))}
          {topics.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-gray-400">
              No live topics right now — check back soon.
            </p>
          )}
        </div>
      </section>

      <section className="pb-4">
        <h2 className="mb-3 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
          {query ? `Results for "${q.trim()}"` : <><Flame className="h-3.5 w-3.5" /> Trending Now</>}
        </h2>
        {results.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">
            No matching posts right now.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-6">
            {results.map((p) => (
              <ExploreTile key={p.id} post={p} onOpen={setActivePost} />
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {activePost && (
          <PostDetail
            post={activePost}
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