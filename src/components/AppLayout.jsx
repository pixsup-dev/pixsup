import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import PostCreator from "@/components/PostCreator";
import AuthModal from "@/components/AuthModal";
import OnboardingModal from "@/components/OnboardingModal";
import WelcomeModal, { WELCOME_SEEN_KEY } from "@/components/WelcomeModal";
import { HASHTAG_POOLS, topHashtags } from "@/components/CategoryChips";
import useNotifications from "@/hooks/useNotifications";
import { useBlocklist, authorKeyOf, blocklist } from "@/hooks/useBlocklist";
import { savedPosts } from "@/hooks/useSavedPosts";

const isLive = (p, now = Date.now()) =>
  !p.hidden_at && (!p.expires_at || new Date(p.expires_at).getTime() > now);

export default function AppLayout() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("#All");
  const [query, setQuery] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // undefined = checking session, null = guest, object = signed-in member
  const [user, setUser] = useState(undefined);

  // First visit: explain the app. Not on top of a shared post someone came to
  // see (they get it next time they land on the feed).
  const { pathname } = useLocation();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    if (pathname.startsWith("/p/") || pathname === "/terms" || pathname === "/privacy") return;
    try {
      if (!localStorage.getItem(WELCOME_SEEN_KEY)) setWelcomeOpen(true);
    } catch {
      // storage blocked: skip the walkthrough rather than show it every visit
    }
  }, [pathname]);
  const closeWelcome = () => {
    setWelcomeOpen(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  // Real-time notifications hub state, shared by the bell and the Hits tab
  const { notifications, unread, refresh: refreshNotifications } = useNotifications();

  // Blocked authors stay hidden from the feed (synced to the account for members)
  const { blocked } = useBlocklist();

  const loadSeq = useRef(0);

  const loadPosts = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      // Posts hidden by 3+ reports are already filtered out by the server
      const all = await base44.entities.Post.list("-created_date", 200);
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      const now = Date.now();
      setPosts(all.filter((p) => isLive(p, now)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Live updates: apply each changed post in place rather than re-downloading
  // the whole feed on every hit; new posts trigger one debounced reload.
  useEffect(() => {
    loadPosts();
    let reloadTimer = null;
    const reloadSoon = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(loadPosts, 1500);
    };
    const unsubscribe = base44.entities.Post.subscribe(({ type, id, data }) => {
      if (type === "create") return reloadSoon();
      setPosts((prev) => {
        if (type === "delete" || !data || !isLive(data)) return prev.filter((p) => p.id !== id);
        return prev.some((p) => p.id === id)
          ? prev.map((p) => (p.id === id ? { ...p, ...data } : p))
          : prev;
      });
    });
    return () => {
      clearTimeout(reloadTimer);
      unsubscribe();
    };
  }, [loadPosts]);

  const refreshUser = useCallback(async () => {
    try {
      if (!(await base44.auth.isAuthenticated())) return setUser(null);
      setUser(await base44.auth.me());
    } catch {
      setUser(null);
    }
  }, []);

  // Resolve the session once: guests browse freely, members are loaded with their profile
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Saved posts and blocks follow the account (guest lists carry over on sign-in)
  const userId = user?.id ?? null;
  const authResolved = user !== undefined;
  useEffect(() => {
    if (!authResolved) return;
    savedPosts.sync(userId);
    blocklist.sync(userId);
  }, [userId, authResolved]);

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

  // A Hit = +1 point and +5 minutes of life; 20 composite points promote to the 24h belt
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
      // hit_post records the vote, extends the timer, promotes at 20 points and
      // notifies the owner, atomically on the server; null = already hit
      const updated = await base44.rpc("hit_post", { p_post_id: post.id });
      if (!updated) return false;
      return {
        hits: updated.hits,
        expires_at: updated.expires_at,
        is_trending: updated.is_trending,
        trending_expires_at: updated.trending_expires_at,
        saved_by_name: updated.saved_by_name,
        saved_at: updated.saved_at,
      };
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  // An emoji reaction = +2 points and +3 minutes of life
  const handleReact = async (post, emoji) => {
    if (!user) {
      // Guests react instantly — the boost lives in this browsing session only
      const counts = { ...(post.reactions || {}) };
      counts[emoji] = (counts[emoji] || 0) + 1;
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, reactions: counts } : p))
      );
      return { reactions: counts };
    }
    try {
      const updated = await base44.rpc("react_to_post", { p_post_id: post.id, p_emoji: emoji });
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
  // creatorOpen: false, true, or a daily challenge the new post joins
  const openUpload = (challenge) =>
    user ? setCreatorOpen(challenge?.tag ? challenge : true) : setAuthOpen(true);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0f17] pb-20 font-body text-gray-100 lg:pb-6">
      <TopBar
        hashtags={hashtags}
        activeTag={category}
        onCategory={setCategory}
        onRotate={refreshFeed}
        query={query}
        onQuery={setQuery}
        onUpload={() => openUpload()}
        onHomeReset={resetFilters}
        user={user}
        unread={unread}
        notifications={notifications}
        refreshNotifications={refreshNotifications}
        onSignIn={() => setAuthOpen(true)}
      />
      {user?.banned && (
        <div className="mx-auto mt-2 max-w-7xl px-3 sm:px-6">
          <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            Your account is suspended for breaking the community guidelines. You can browse,
            but you can't post, comment, react or report.
          </p>
        </div>
      )}
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
          refreshUser,
          openAuth: () => setAuthOpen(true),
          openWelcome: () => setWelcomeOpen(true),
          openUpload,
          notifications,
          refreshNotifications,
        }}
      />
      <BottomNav onUpload={() => openUpload()} onHome={resetFilters} unread={unread} user={user} />
      <AnimatePresence>
        {creatorOpen && (
          <PostCreator
            challenge={creatorOpen === true ? null : creatorOpen}
            onClose={() => setCreatorOpen(false)}
            onCreated={loadPosts}
          />
        )}
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {user && !user.username && <OnboardingModal user={user} onDone={refreshUser} />}
        {welcomeOpen && user !== undefined && !(user && !user.username) && !authOpen && (
          <WelcomeModal
            user={user}
            onClose={closeWelcome}
            onSignUp={() => {
              closeWelcome();
              setAuthOpen(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
