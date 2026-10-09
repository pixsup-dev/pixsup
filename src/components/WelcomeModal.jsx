import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";

export const WELCOME_SEEN_KEY = "pixsup_welcome_seen";

const STEPS = [
  {
    icon: "⏳",
    title: "Every post is dying",
    body: "Posts start with 1 hour to live. When the timer hits zero, they're gone for good. No archives, no old feeds.",
    visual: (
      <span className="rounded-full bg-black/60 px-3 py-1 font-mono text-lg font-black text-orange-300">
        ⏳ 59:42
      </span>
    ),
  },
  {
    icon: "⚡",
    title: "You keep them alive",
    body: "Every interaction buys a post more time. Enough love and it hits the 24-hour Trending belt.",
    visual: (
      <span className="flex flex-wrap justify-center gap-1.5 text-xs font-bold">
        <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-cyan-300">⚡ Hit +5 min</span>
        <span className="rounded-full bg-orange-400/15 px-2.5 py-1 text-orange-300">😂 React +3 min</span>
        <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-violet-300">💬 Comment +10 min</span>
      </span>
    ),
  },
  {
    icon: "🦸",
    title: "Rescue the dying",
    body: "Save a post in its last 5 minutes and it says \"Saved by\" you. Earn 💛 Lifelines, badges, and help a post win the 👑 Survivor crown.",
    visual: (
      <span className="rounded-full bg-red-600 px-3 py-1 font-mono text-lg font-black text-white">
        02:13 · Rescue!
      </span>
    ),
  },
  {
    icon: "📸",
    title: "Today's challenge",
    body: "One photo prompt for everyone, every day. Enter once, so make it your best shot. The most-loved entry wears the 👑. Share a story card to get friends hitting it.",
    visual: (
      <span className="rounded-full bg-gradient-to-r from-orange-500 to-fuchsia-500 px-3 py-1 text-sm font-black text-white">
        📸 Join the challenge
      </span>
    ),
  },
  {
    icon: "🌍",
    title: "The people's front page",
    body: "World Pulse ranks today's news by what you keep alive. Tap ✨ Explain it for the story in 3 sentences, vote in polls, drop a 🔥 hot take, or join a live chat that vanishes in 10 minutes.",
    visual: (
      <span className="flex gap-1.5 text-xs font-bold">
        <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-white">● BREAKING</span>
        <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-black">JUST IN</span>
        <span className="rounded-md bg-violet-500 px-1.5 py-0.5 text-white">📊 Poll</span>
      </span>
    ),
  },
];

// The "how Pixsup works" walkthrough: shown once on a first visit, and from
// Settings any time after.
export default function WelcomeModal({ user, onClose, onSignUp }) {
  useBodyScrollLock();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  return (
    <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#151c28] p-6 text-center"
      >
        <button
          onClick={onClose}
          aria-label="Skip"
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-cyan-400">
          How Pixsup works
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            <div className="text-5xl">{s.icon}</div>
            <h2 className="text-xl font-black text-white">{s.title}</h2>
            <p className="text-sm leading-relaxed text-gray-300">{s.body}</p>
            <div className="flex min-h-10 items-center justify-center pt-1">{s.visual}</div>
          </motion.div>
        </AnimatePresence>

        <div className="my-5 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-cyan-400" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>

        {last ? (
          <div className="space-y-2">
            {!user && (
              <button
                onClick={onSignUp}
                className="spring-tap w-full rounded-xl bg-gradient-to-r from-cyan-500 to-orange-500 py-2.5 text-sm font-extrabold text-black active:scale-95"
              >
                Create a free account
              </button>
            )}
            <button
              onClick={onClose}
              className={`spring-tap w-full rounded-xl py-2.5 text-sm font-extrabold active:scale-95 ${
                user
                  ? "bg-gradient-to-r from-cyan-500 to-orange-500 text-black"
                  : "border border-white/10 bg-white/5 text-gray-200"
              }`}
            >
              {user ? "Let's go" : "Just look around"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-gray-400 transition hover:text-white"
            >
              Skip
            </button>
            <button
              onClick={() => setStep(step + 1)}
              className="spring-tap flex-1 rounded-xl bg-cyan-400 py-2.5 text-sm font-extrabold text-black active:scale-95"
            >
              Next
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
