import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Bell, Loader2, Zap } from "lucide-react";
import moment from "moment";

const rowText = (n) => {
  switch (n.type) {
    case "hit":
      return "Your post received a hit";
    case "reaction":
      return `${n.actor_name || "Someone"} reacted ${n.emoji || ""}`;
    case "comment":
      return "New comment on your post";
    case "trending":
      return "Your post hit the Trending belt";
    default:
      return "New activity on your post";
  }
};

const rowIcon = { hit: "⚡", reaction: "🎉", comment: "💬", trending: "🔥" };

export default function NotificationBell({
  user,
  unread,
  notifications,
  onRefresh,
}) {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    // Opening the dropdown marks everything as read in real time
    if (next && unread > 0 && user) {
      setMarking(true);
      try {
        await base44.entities.Notification.updateMany(
          { recipient_id: user.id, read: false },
          { $set: { read: true } }
        );
        onRefresh();
      } catch (e) {
        console.error(e);
      } finally {
        setMarking(false);
      }
    }
  };

  const list = (notifications || []).slice(0, 8);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        onClick={toggleOpen}
        aria-label="Notifications"
        title="Notifications"
        className="relative rounded-full border border-white/10 bg-white/5 p-2 text-gray-300 backdrop-blur-md transition hover:border-cyan-400/40 hover:text-cyan-300"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black text-black shadow-[0_0_8px_rgba(249,115,22,0.7)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#151c28]/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-cyan-400">
                Notifications
              </p>
              {marking && (
                <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">
                  No activity yet — hits, comments and reactions land here in
                  real time.
                </p>
              ) : (
                list.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-2.5 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/5"
                  >
                    <span className="text-sm">{rowIcon[n.type] || "🔔"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-gray-100">
                        {rowText(n)}
                      </p>
                      <p className="truncate text-[10px] text-gray-400">
                        {n.post_title || "Untitled"} ·{" "}
                        {moment(n.created_date).fromNow()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/hits"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 border-t border-white/5 bg-white/5 py-2 text-[10px] font-extrabold uppercase tracking-wider text-cyan-300 transition hover:bg-white/10"
            >
              <Zap className="h-3 w-3" /> View all activity
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}