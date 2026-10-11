import React from "react";
import { AnimatePresence, motion } from "framer-motion";

// "▲ 2": a post just overtook others in a ranked row
export default function ClimbBadge({ places, className = "" }) {
  return (
    <AnimatePresence>
      {places > 0 && (
        <motion.span
          key={places}
          initial={{ opacity: 0, scale: 0.5, y: 6 }}
          animate={{ opacity: 1, scale: [0.5, 1.25, 1], y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className={`pointer-events-none absolute z-20 rounded-full bg-green-500 px-2 py-0.5 text-[11px] font-black text-black shadow-[0_0_14px_rgba(34,197,94,0.8)] ${className}`}
        >
          ▲ {places}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// Cards slide to their new place when the order changes
export const glide = { type: "spring", stiffness: 380, damping: 34 };
