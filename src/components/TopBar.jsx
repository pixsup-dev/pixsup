import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import CategoryChips from "@/components/CategoryChips";
import NotificationBell from "@/components/NotificationBell";
import { Zap, User, Compass, Plus, Home as HomeIcon, LogIn, RefreshCw } from "lucide-react";

export default function TopBar({
  hashtags,
  activeTag,
  onCategory,
  onRotate,
  query,
  onQuery,
  onUpload,
  onHomeReset,
  user,
  unread,
  notifications,
  refreshNotifications,
  onSignIn,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const [refreshing, setRefreshing] = useState(false);

  const goHome = () => {
    onHomeReset();
    navigate("/");
  };

  const navLinkClass = (active) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
      active
        ? "bg-cyan-400/15 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.4)]"
        : "text-gray-400 hover:bg-white/5 hover:text-white"
    }`;

  const pageLabel =
    location.pathname === "/hits"
      ? "⚡ Live Hits"
      : location.pathname === "/profile"
      ? "👤 Profile Studio"
      : location.pathname === "/explore"
      ? "🔍 Explore"
      : "";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0f17]/90 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={goHome}
            className="flex shrink-0 items-center gap-0.5 font-display text-xl font-black tracking-wider sm:text-2xl"
          >
            <span className="text-cyan-400">PIX</span>
            <span className="text-orange-500">SUP</span>
            <span className="ml-1 h-1.5 w-1.5 animate-ping rounded-full bg-orange-500" />
          </button>
          {isHome ? (
            <div className="relative w-36 sm:w-64">
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search feed..."
                className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white placeholder-slate-200 transition-all focus:border-cyan-400 focus:outline-none"
              />
            </div>
          ) : (
            <span className="text-xs font-bold text-gray-400">{pageLabel}</span>
          )}
          <div className="flex items-center gap-2">
            {user ? (
              <NotificationBell
                user={user}
                unread={unread}
                notifications={notifications}
                onRefresh={refreshNotifications}
              />
            ) : (
              user === null && (
                <button
                  onClick={onSignIn}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-3 py-1.5 text-xs font-black text-black shadow-[0_0_14px_rgba(34,211,238,0.5)] transition-transform hover:scale-105 active:scale-95"
                >
                  <LogIn className="h-3.5 w-3.5" /> Sign in
                </button>
              )
            )}
            <nav className="hidden items-center gap-1 lg:flex">
              <button className={navLinkClass(isHome)} onClick={goHome}>
                <HomeIcon className="h-3.5 w-3.5" /> Home
              </button>
              <button
                className={navLinkClass(location.pathname === "/explore")}
                onClick={() => navigate("/explore")}
              >
                <Compass className="h-3.5 w-3.5" /> Explore
              </button>
              <Link
                to="/hits"
                className={navLinkClass(location.pathname === "/hits")}
              >
                <Zap className="h-3.5 w-3.5" /> Hits
                {unread > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                )}
              </Link>
              <Link
                to="/profile"
                className={navLinkClass(location.pathname === "/profile")}
              >
                <User className="h-3.5 w-3.5" /> Profile
              </Link>
              <button
                onClick={onUpload}
                className="spring-tap ml-1 flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-3 py-1.5 text-xs font-black text-black shadow-[0_0_14px_rgba(34,211,238,0.5)] transition-transform hover:scale-105 active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Post
              </button>
            </nav>
          </div>
        </div>
        {isHome && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setRefreshing(true);
                try {
                  await onRotate();
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing}
              title="Refresh the feed"
              aria-label="Refresh the feed"
              className="flex shrink-0 items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-300 transition hover:bg-cyan-400/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <CategoryChips hashtags={hashtags} active={activeTag} onChange={onCategory} />
          </div>
        )}
      </div>
    </header>
  );
}