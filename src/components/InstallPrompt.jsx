import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Share, X } from "lucide-react";
import { canPromptInstall, isIOSSafari, isStandalone, onInstallAvailable, promptInstall } from "@/lib/pwa";
import { WELCOME_SEEN_KEY } from "@/components/WelcomeModal";

const DISMISS_KEY = "pixsup_install_dismissed";
const AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_AFTER_MS = 45 * 1000; // let people look around first

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // private mode: the prompt just comes back next visit
    }
  },
};

// A small banner inviting phone visitors to add Pixsup to their home screen:
// a real Install button where the browser supports it (Android), the
// Share → "Add to Home Screen" steps on iPhone Safari. Shown after 45 seconds,
// never in the installed app, and at most once a week if dismissed.
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [native, setNative] = useState(canPromptInstall());

  useEffect(() => onInstallAvailable(setNative), []);

  useEffect(() => {
    if (isStandalone() || !window.matchMedia?.("(pointer: coarse)").matches) return;
    if (Date.now() - Number(store.get(DISMISS_KEY) || 0) < AGAIN_AFTER_MS) return;
    const t = setTimeout(() => {
      if (store.get(WELCOME_SEEN_KEY) && (canPromptInstall() || isIOSSafari())) setShow(true);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    store.set(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const install = async () => {
    if (await promptInstall()) setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] mx-auto max-w-md rounded-2xl border border-cyan-400/30 bg-[#151c28]/95 p-4 shadow-2xl backdrop-blur-xl lg:hidden"
        >
          <button
            onClick={dismiss}
            aria-label="Not now"
            className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-5">
            <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <p className="text-sm font-black text-white">Get the Pixsup app</p>
              {native ? (
                <>
                  <p className="mb-2 text-xs text-gray-300">
                    Full screen, one tap away, and alerts when a post needs saving.
                  </p>
                  <button
                    onClick={install}
                    className="rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-4 py-1.5 text-xs font-black text-black"
                  >
                    Install
                  </button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-gray-300">
                  Tap <Share className="mx-0.5 inline h-3.5 w-3.5 -translate-y-0.5 text-cyan-300" />{" "}
                  <b>Share</b> below, then <b>“Add to Home Screen”</b>. Full screen, one tap away, and
                  alerts when a post needs saving.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
