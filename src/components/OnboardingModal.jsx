import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AtSign, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Shown once to every new member (email or Google): pick the public username
// that appears on notifications, and confirm age 13+ and the Terms if they
// haven't already at sign-up. Can't be dismissed — only completed or signed out.
export default function OnboardingModal({ user, onDone }) {
  const needsTerms = !user.terms_accepted_at;
  const [username, setUsername] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cleaned = username.trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,20}$/.test(cleaned) && (!needsTerms || accepted);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await base44.rpc("complete_onboarding", { p_username: cleaned, p_accept_terms: accepted });
      await onDone();
    } catch (err) {
      setError(err.message || "Couldn't save your username — please try again.");
      setBusy(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 p-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-cyan-400/30 bg-[#151c28] p-5"
      >
        <div>
          <h4 className="text-base font-extrabold text-cyan-400">Pick your username</h4>
          <p className="mt-1 text-xs text-gray-400">
            This is the name people see when you hit, react or comment. Your email stays private.
          </p>
        </div>

        <label className="relative block">
          <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
            maxLength={20}
            placeholder="your_name"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-cyan-400 focus:outline-none"
          />
        </label>
        <p className="text-[11px] text-gray-500">3–20 characters: letters, numbers and underscores.</p>

        {needsTerms && (
          <label className="flex items-start gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-400"
            />
            <span>
              I'm 13 or older and agree to the{" "}
              <Link to="/terms" target="_blank" className="text-cyan-300 underline">Terms</Link> and{" "}
              <Link to="/privacy" target="_blank" className="text-cyan-300 underline">Privacy Policy</Link>.
            </span>
          </label>
        )}

        {error && <p className="text-xs font-semibold text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-extrabold text-black transition hover:bg-cyan-300 disabled:opacity-40"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Continue"}
        </button>
        <button
          type="button"
          onClick={() => base44.auth.logout("/")}
          className="w-full text-center text-[11px] text-gray-500 hover:text-gray-300"
        >
          Sign out instead
        </button>
      </motion.form>
    </motion.div>
  );
}
