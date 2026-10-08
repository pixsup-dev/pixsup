import React, { useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2, ArrowDown } from "lucide-react";
import TrendingBelt from "@/components/TrendingBelt";
import WorldPulse from "@/components/WorldPulse";
import RescueRow from "@/components/RescueRow";
import RisingBelt from "@/components/RisingBelt";
import PostGrid from "@/components/PostGrid";
import PostDetail from "@/components/PostDetail";
import { isAllTag, keywordsForTag } from "@/components/CategoryChips";
import { engagementScore } from "@/lib/engagement";
import { isSpotlit } from "@/lib/boosts";

export default function Home() {
  const { posts, loading, loadPosts, category, query, handleVote, handleReact, openAuth, user } =
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
  // World Pulse: live top stories, ranked by how hard people keep them alive
  const pulseTag = category.toLowerCase();
  const showPulse = isAllTag(category) || pulseTag === "#news" || pulseTag === "#world";
  const pulse = showPulse
    ? posts
        .filter((p) => p.top_story && (!q || (p.title || "").toLowerCase().includes(q)))
        .sort(
          (a, b) =>
            byScore(a, b) || new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        )
        .slice(0, 10)
    : [];
  const pulseIds = new Set(pulse.map((p) => p.id));

  const trending = filtered.filter((p) => p.is_trending).sort(byScore);
  // Until something actually trends, the belt shows the most-engaged posts as
  // "Hot right now" — never zero-engagement posts dressed up as trending.
  const showingHot = trending.length === 0;
  const beltPosts = showingHot
    ? filtered
        .filter((p) => engagementScore(p) > 0 && !pulseIds.has(p.id))
        .sort(byScore)
        .slice(0, 8)
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
  // The Survivor: the member post the crowd has kept alive longest (past its
  // first hour, without trending). It wears the crown and leads the feed.
  const survivor = filtered
    .filter(
      (p) =>
        !p.is_trending &&
        !p.isNews &&
        !p.boosted_at &&
        Date.now() - new Date(p.created_date).getTime() > 60 * 60 * 1000
    )
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
  let hourlyPosts = filtered.filter((p) => !p.is_trending);
  if (survivor) {
    hourlyPosts.splice(hourlyPosts.indexOf(survivor), 1);
    hourlyPosts.unshift(survivor);
  }
  // Paid Spotlight posts go in front of everything else
  const spotlit = hourlyPosts.filter((p) => isSpotlit(p));
  if (spotlit.length) {
    hourlyPosts = [...spotlit, ...hourlyPosts.filter((p) => !isSpotlit(p))];
  }

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
        <WorldPulse posts={pulse} onVote={handleVote} onOpen={setActivePost} />
        <RescueRow
          posts={filtered}
          user={user}
          onVote={handleVote}
          onOpen={setActivePost}
          onSignIn={openAuth}
        />
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
          survivorId={survivor?.id}
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