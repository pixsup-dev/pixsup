import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const MAX_PER_CHANGE = 6;
const LIFETIME_MS = 1600;
let seq = 0;

// Emojis that float up over a post whenever anyone engages with it, live:
// 🔥 per hit, the emoji itself per reaction, 💬 per comment. It watches the
// post's counters, so your own actions and other people's (via realtime)
// both show. Nothing plays for the counts a post already had on first render.
export default function EmojiBurst({ post, size = "text-2xl" }) {
  const [floaters, setFloaters] = useState([]);
  const prev = useRef(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const now = {
      id: post?.id,
      hits: post?.hits || 0,
      comments: post?.comment_count || 0,
      reactions: { ...(post?.reactions || {}) },
    };
    const before = prev.current;
    prev.current = now;
    if (!before || before.id !== now.id) return;

    const spawn = [];
    const add = (emoji, n) => {
      for (let i = 0; i < Math.min(n, MAX_PER_CHANGE); i++) spawn.push(emoji);
    };
    add("🔥", now.hits - before.hits);
    add("💬", now.comments - before.comments);
    for (const [emoji, count] of Object.entries(now.reactions)) {
      add(emoji, (count || 0) - (before.reactions[emoji] || 0));
    }
    if (!spawn.length) return;

    const born = spawn.slice(0, MAX_PER_CHANGE).map((emoji, i) => ({
      id: ++seq,
      emoji,
      x: 15 + Math.random() * 70, // % across the image
      drift: (Math.random() - 0.5) * 40,
      delay: i * 0.12,
      rise: 110 + Math.random() * 60,
    }));
    setFloaters((f) => [...f, ...born]);
    const ids = new Set(born.map((b) => b.id));
    timers.current.push(
      setTimeout(
        () => setFloaters((f) => f.filter((x) => !ids.has(x.id))),
        LIFETIME_MS + born.length * 120
      )
    );
  }, [post?.id, post?.hits, post?.comment_count, post?.reactions]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {floaters.map((f) => (
          <motion.span
            key={f.id}
            className={`absolute bottom-2 ${size} drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]`}
            style={{ left: `${f.x}%` }}
            initial={{ y: 0, x: 0, opacity: 0, scale: 0.4 }}
            animate={{
              y: -f.rise,
              x: f.drift,
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.2, 1, 0.9],
            }}
            transition={{ duration: LIFETIME_MS / 1000, delay: f.delay, ease: "easeOut" }}
          >
            {f.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
