import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import PostCreator from "@/components/PostCreator";
import AuthModal from "@/components/AuthModal";
import { HASHTAG_POOLS, topHashtags } from "@/components/CategoryChips";
import { displayNameFor } from "@/lib/engagement";
import { createNotification } from "@/lib/notify";
import useNotifications from "@/hooks/useNotifications";
import { useBlocklist, authorKeyOf } from "@/hooks/useBlocklist";

export default function AppLayout() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("#All");
  const [query, setQuery] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // undefined = checking session, null = guest, object = signed-in member
  const [user, setUser] = useState(undefined);

  // Real-time notifications hub state, shared by the bell and the Hits tab
  const { notifications, unread, refresh: refreshNotifications } = useNotifications();

  // Locally blocked authors (per browser) stay hidden from the feed
  const { blocked } = useBlocklist();

  const loadSeq = useRef(0);

  const loadPosts = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [all, flags] = await Promise.all([
        base44.entities.Post.list("-created_date", 200),
        base44.entities.Flag.list(500),
      ]);
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      // 3+ unique flags (distinct users) auto-hide a post
      const flagMap = {};
      for (const f of flags) {
        if (!flagMap[f.post_id]) flagMap[f.post_id] = new Set();
        flagMap[f.post_id].add(f.created_by_id);
      }
      const now = new Date();
      const live = all.filter(
        (p) =>
          (!p.expires_at || new Date(p.expires_at) > now) &&
          (!flagMap[p.id] || flagMap[p.id].size < 3)
      );
      setPosts(live);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
    const unsubPosts = base44.entities.Post.subscribe(() => loadPosts());
    const unsubFlags = base44.entities.Flag.subscribe(() => loadPosts());
    return () => {
      unsubPosts();
      unsubFlags();
    };
  }, [loadPosts]);

  // Resolve the session once: guests browse freely, members get an auto profile
  useEffect(() => {
    let alive = true;
    base44.auth.isAuthenticated().then(async (authed) => {
      if (!authed) {
        if (alive) setUser(null);
        return;
      }
      try {
        const me = await base44.auth.me();
        if (!me.display_name) {
          await base44.auth.updateMe({ display_name: displayNameFor(me) });
        }
        if (alive) setUser(me);
      } catch (e) {
        if (alive) setUser(null);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Refresh Feed: run the news ingestion FIRST so the grid always holds at
  // least 8 live tiles, then reload. Expired items are only ever filtered out
  // by their genuine decay timer — refresh never wipes or soft-deletes posts.
  const refreshFeed = useCallback(async () => {
    try {
      await base44.functions.invoke("seedNewsPosts", { min_active: 8 });
    } catch (e) {
      console.error(e);
    }
    loadPosts();
  }, [loadPosts]);

  // News top-up engine: whenever the live grid runs low (old tiles expiring),
  // pull fresh trending news tiles so the feed never goes empty — checked on
  // session start and every 5 minutes after
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  useEffect(() => {
    if (!user) return;
    const topUp = () => {
      if (postsRef.current.length >= 8) return;
      refreshFeed();
    };
    topUp();
    const t = setInterval(topUp, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [user, refreshFeed]);

  const visiblePosts = useMemo(
    () => posts.filter((p) => !blocked.includes(authorKeyOf(p))),
    [posts, blocked]
  );

  // Dynamic header hashtags: top tags from live posts, recalculated in real time
  const hashtags = useMemo(() => {
    const top = topHashtags(visiblePosts, 7);
    return top.length > 0 ? ["#All", ...top.map((t) => t.tag)] : HASHTAG_POOLS[0];
  }, [visiblePosts]);

  // A Hit = +1 point and +1 minute of life; 20 composite points promote to the 24h belt
  const handleVote = async (post) => {
    if (!user) {
      // Guests hit instantly — the boost lives in this browsing session only
      const updates = { hits: (post.hits || 0) + 1 };
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, hits: updates.hits } : p))
      );
      return updates;
    }
    try {
      // hit_post records the vote, extends the timer and promotes at 20 points
      // atomically on the server; null means this member already hit the post
      const updated = await base44.rpc("hit_post", { p_post_id: post.id });
      if (!updated) return false;
      const updates = {
        hits: updated.hits,
        expires_at: updated.expires_at,
        is_trending: updated.is_trending,
        trending_expires_at: updated.trending_expires_at,
      };
      const promoted = updated.is_trending && !post.is_trending;
      if (post.created_by_id) {
        await createNotification({
          recipientId: post.created_by_id,
          type: "hit",
          postId: post.id,
          postTitle: post.title,
          actor: user,
        });
      }
      if (promoted && post.created_by_id) {
        await createNotification({
          recipientId: post.created_by_id,
          type: "trending",
          postId: post.id,
          postTitle: post.title,
          actor: user,
        });
      }
      return updates;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // An emoji reaction = +2 points and +2 minutes of life
  const handleReact = async (post, emoji) => {
    const counts = { ...(post.reactions || {}) };
    counts[emoji] = (counts[emoji] || 0) + 1;
    if (!user) {
      // Guests react instantly — the boost lives in this browsing session only
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, reactions: counts } : p))
      );
      return { reactions: counts };
    }
    try {
      const updated = await base44.rpc("react_to_post", { p_post_id: post.id, p_emoji: emoji });
      if (post.created_by_id) {
        await createNotification({
          recipientId: post.created_by_id,
          type: "reaction",
          postId: post.id,
          postTitle: post.title,
          actor: user,
          emoji,
        });
      }
      return { reactions: updated.reactions, expires_at: updated.expires_at };
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const resetFilters = useCallback(() => {
    setCategory("#All");
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Posting needs an account — guests are asked to sign in first
  const openUpload = () => (user ? setCreatorOpen(true) : setAuthOpen(true));

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0f17] pb-20 font-body text-gray-100 lg:pb-6">
      <TopBar
        hashtags={hashtags}
        activeTag={category}
        onCategory={setCategory}
        onRotate={refreshFeed}
        query={query}
        onQuery={setQuery}
        onUpload={openUpload}
        onHomeReset={resetFilters}
        user={user}
        unread={unread}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
        onSignIn={() => setAuthOpen(true)}
      />
      <Outlet
        context={{
          posts: visiblePosts,
          loading,
          loadPosts,
          category,
          setCategory,
          query,
          handleVote,
          handleReact,
          resetFilters,
          hashtags,
          user,
          openAuth: () => setAuthOpen(true),
          notifications,
          refreshNotifications,
        }}
      />
      <BottomNav onUpload={openUpload} onHome={resetFilters} unread={unread} />
      <AnimatePresence>
        {creatorOpen && (
          <PostCreator onClose={() => setCreatorOpen(false)} onCreated={loadPosts} />
        )}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}