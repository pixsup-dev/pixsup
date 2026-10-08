import React, { useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2, ArrowDown } from "lucide-react";
import TrendingBelt from "@/components/TrendingBelt";
import RisingBelt from "@/components/RisingBelt";
import PostGrid from "@/components/PostGrid";
import PostDetail from "@/components/PostDetail";
import { isAllTag, keywordsForTag } from "@/components/CategoryChips";
import { engagementScore } from "@/lib/engagement";

export default function Home() {
  const { posts, loading, loadPosts, category, query, handleVote, handleReact, openAuth } =
    useOutletContext();
  const [activePost, setActivePost] = useState(null);

  // Native pull-to-refresh (mobile + tablet)
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);

  const onTouchStart = (e) => {
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY <= 0) setPull(Math.min(dy * 0.4, 70));
  };
  const onTouchEnd = async () => {
    if (pull > 45 && !refreshing) {
      setRefreshing(true);
      await loadPosts();
      setRefreshing(false);
    }
    setPull(0);
    startY.current = null;
  };

  const q = query.trim().toLowerCase();
  const matchesFilter = (p) => {
    const title = (p.title || "").toLowerCase();
    const tag = category.replace("#", "").toLowerCase();
    const inCat =
      isAllTag(category) ||
      (p.category || "").toLowerCase() === tag ||
      (p.hashtags || []).some((h) => h.toLowerCase() === category.toLowerCase()) ||
      keywordsForTag(category).some((k) => title.includes(k));
    const inSearch = !q || title.includes(q);
    return inCat && inSearch;
  };

  const filtered = posts.filter(matchesFilter);
  const byScore = (a, b) => engagementScore(b) - engagementScore(a);
  const trending = filtered.filter((p) => p.is_trending).sort(byScore);
  // Until something actually trends, the belt shows the most-engaged posts as
  // "Hot right now" — never zero-engagement posts dressed up as trending.
  const showingHot = trending.length === 0;
  const beltPosts = showingHot
    ? filtered.filter((p) => engagementScore(p) > 0).sort(byScore).slice(0, 8)
    : trending.slice(0, 10);
  const beltIds = new Set(beltPosts.map((p) => p.id));
  const rising = filtered
    .filter(
      (p) =>
        !p.is_trending &&
        !beltIds.has(p.id) &&
        engagementScore(p) >= 10 &&
        engagementScore(p) < 20
    )
    .sort(byScore);
  const hourlyPosts = filtered.filter((p) => !p.is_trending);

  return (
    <div
      className="touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {(pull > 0 || refreshing) && (
        <div
          className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2"
          style={{ top: refreshing ? 64 : Math.max(pull, 8) }}
        >
          <div className="rounded-full border border-cyan-400/40 bg-[#151c28]/90 p-2 backdrop-blur-md">
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            ) : (
              <ArrowDown className="h-4 w-4 text-cyan-400" />
            )}
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-3 pt-4 sm:px-6">
        <TrendingBelt
          posts={beltPosts}
          title={showingHot ? "Hot Right Now" : "24-Hour Trending Belt"}
          onVote={handleVote}
          onOpen={setActivePost}
        />
        {rising.length > 0 && (
          <RisingBelt posts={rising} onVote={handleVote} onOpen={setActivePost} />
        )}
        <PostGrid
          posts={hourlyPosts}
          loading={loading}
          onOpen={setActivePost}
          onReact={handleReact}
        />
      </main>

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
    </div>
  );
}