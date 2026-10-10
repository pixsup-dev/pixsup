import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import useGameRules from "@/hooks/useGameRules";

export const WELCOME_SEEN_KEY = "pixsup_welcome_seen";

// The guided tour: it dims the screen except the real button it's talking
// about, with a bouncing arrow and a short card. Steps whose button isn't on
// screen (e.g. no challenge today) are skipped. Shown once on a first visit to
// the feed, and from Settings → "How Pixsup works" any time.
// In page order, top to bottom, so the tour flows down the screen. Numbers
// come from the game rules an admin can change.
const makeSteps = (r) => [
  {
    icon: "⏳",
    title: "Welcome to Pixsup",
    body: "Every post here is dying. Each one has a timer, and when it hits zero it's gone for good. You decide what stays alive.",
  },
  {
    target: "live",
    icon: "👀",
    title: "Live right now",
    body: "How many people are here, which posts are about to die and what's trending. Tap 🚨 to jump to a post that needs saving.",
  },
  {
    target: "belt",
    icon: "🔥",
    title: "The 24-Hour Trending Belt",
    body: `The crowd's favourites. A post that reaches ${r.trending_points} points lands here and lives for ${r.trending_hours} hours.`,
  },
  {
    target: "challenge",
    icon: "📸",
    title: "Today's challenge",
    body: "One photo prompt for everyone, every day. Tap Join to enter with one photo.",
  },
  {
    target: "hit",
    icon: "⚡",
    title: "Keep it alive",
    body: `Tap Keep alive (or double-tap a photo) for +${r.hit_minutes} minutes. An emoji adds ${r.react_minutes}, a comment ${r.comment_minutes}. Watch the life bar fill back up.`,
  },
  {
    target: "tile",
    icon: "⏳",
    title: "Every post has a timer",
    body: "The ⏳ shows how long it has left. Tap any post to open it full screen, then swipe up for the next one.",
  },
  {
    target: "upload",
    icon: "➕",
    title: "Post your own photo",
    body: "Tap here to post. Your first posts get extra time and a spot in 🌱 New faces. Then share them, because they only live while people keep them alive!",
  },
  {
    target: "profile",
    icon: "👤",
    title: "Your profile",
    body: "Your stats, badges and settings. Turn on phone alerts there, so you hear when a post of yours is dying and can save it in time.",
  },
  {
    icon: "🚀",
    title: "You're ready!",
    body: "Hit what you love, save what's dying, and post something worth keeping alive.",
    last: true,
  },
];

const GUTTER = 12;
const PAD = 6; // space around the highlighted button

// The first matching element that's actually visible (phone and computer
// layouts have different buttons with the same marker)
function findTarget(name) {
  return [...document.querySelectorAll(`[data-tour="${name}"]`)].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}

export default function WelcomeModal({ user, onClose, onSignUp }) {
  const rules = useGameRules();
  // rebuilt only when the rules change, so each step keeps the same identity
  const steps = useMemo(() => makeSteps(rules), [rules]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = step?.target && findTarget(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // Bring the button into view, then keep the highlight on it
  useLayoutEffect(() => {
    const el = step?.target && findTarget(step.target);
    if (!el) return setRect(null);
    const inFixedBar = !!el.closest("nav, header") && getComputedStyle(el.closest("nav, header")).position === "fixed";
    if (!inFixedBar) el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 450);
    return () => clearTimeout(t);
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Moves to the next (or previous) step whose button is on screen: e.g. no
  // challenge today, or the feed still loading, just skips that step
  const go = useCallback(
    (dir) => {
      let n = i + dir;
      while (n > 0 && n < steps.length - 1 && steps[n].target && !findTarget(steps[n].target)) n += dir;
      if (n >= 0 && n < steps.length) setI(n);
    },
    [i, steps]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && i < steps.length - 1) go(1);
      if (e.key === "ArrowLeft" && i > 0) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, steps.length, onClose, go]);

  if (!step) return null;

  // The card sits below the button if it's in the top half, otherwise above
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(320, vw - GUTTER * 2);
  const card = { left: (vw - cardW) / 2, top: null, bottom: null };
  let arrowUp = true;
  let arrowX = cardW / 2;
  if (rect) {
    const center = rect.left + rect.width / 2;
    card.left = Math.min(Math.max(GUTTER, center - cardW / 2), vw - cardW - GUTTER);
    arrowX = Math.min(Math.max(24, center - card.left), cardW - 24);
    if (rect.top + rect.height / 2 < vh / 2) {
      card.top = Math.min(rect.top + rect.height + 44, vh - 200);
    } else {
      card.bottom = Math.min(vh - rect.top + 44, vh - 200);
      arrowUp = false;
    }
  }

  const next = () => (step.last ? onClose() : go(1));

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="How Pixsup works">
      {/* Dim everything; the highlight cuts a bright hole around the button */}
      {rect ? (
        <motion.div
          className="pointer-events-none fixed rounded-2xl ring-2 ring-cyan-300"
          initial={false}
          animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          style={{ boxShadow: "0 0 0 9999px rgba(3,6,12,0.82), 0 0 24px 4px rgba(34,211,238,0.6)" }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(3,6,12,0.88)]" />
      )}
      {/* Taps outside the card don't reach the app underneath */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: arrowUp ? 10 : -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed"
          style={
            rect
              ? { left: card.left, width: cardW, ...(card.top !== null ? { top: card.top } : { bottom: card.bottom }) }
              : { left: card.left, width: cardW, top: "35%" }
          }
        >
          {rect && (
            <motion.span
              className="absolute text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]"
              style={{ left: arrowX - 16, ...(arrowUp ? { top: -40 } : { bottom: -40 }) }}
              animate={{ y: arrowUp ? [0, -8, 0] : [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
            >
              {arrowUp ? <ArrowUp className="h-8 w-8" strokeWidth={3} /> : <ArrowDown className="h-8 w-8" strokeWidth={3} />}
            </motion.span>
          )}

          <div className="relative rounded-2xl border border-cyan-400/40 bg-[#151c28] p-4 shadow-2xl">
            <button
              onClick={onClose}
              aria-label="Skip the tour"
              className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {!rect && <div className="mb-2 text-4xl">{step.icon}</div>}
            <p className="mb-1 pr-6 text-base font-black text-white">
              {rect && <span className="mr-1.5">{step.icon}</span>}
              {step.title}
            </p>
            <p className="text-sm leading-relaxed text-gray-300">{step.body}</p>

            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {steps.map((_, n) => (
                  <span
                    key={n}
                    className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-cyan-400" : "w-1.5 bg-white/20"}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {i > 0 && !step.last && (
                  <button onClick={() => go(-1)} className="px-2 text-xs font-bold text-gray-400 hover:text-white">
                    Back
                  </button>
                )}
                {step.last && !user && (
                  <button
                    onClick={onSignUp}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-gray-200 hover:bg-white/10"
                  >
                    Create account
                  </button>
                )}
                <button
                  onClick={next}
                  className="spring-tap rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-4 py-1.5 text-xs font-black text-black active:scale-95"
                >
                  {i === 0 ? "Show me around" : step.last ? "Let's go" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
