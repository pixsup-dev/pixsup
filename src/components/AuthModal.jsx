import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { X, Apple, Chrome, Mail, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function AuthModal({ onClose }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const postLoginUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnTo = urlParams.get("returnTo");
    return returnTo && returnTo.startsWith("/") ? returnTo : window.location.pathname;
  };

  const social = async (provider) => {
    try {
      await base44.auth.loginWithProvider(provider, postLoginUrl());
    } catch (e) {
      toast({ title: `Couldn't start ${provider} sign-in`, variant: "destructive" });
    }
  };

  const emailLogin = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      window.location.href = postLoginUrl();
    } catch (e) {
      setError("Wrong email or password — or create an account below.");
    } finally {
      setBusy(false);
    }
  };

  const socialBtn =
    "flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-bold text-white backdrop-blur-md transition hover:border-cyan-400/50 hover:bg-white/10 active:scale-95";
  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="relative w-full max-w-sm rounded-2xl border border-white/15 bg-[#151c28]/70 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)] backdrop-blur-xl"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 transition hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="mb-1 font-display text-xl font-black">
          <span className="text-cyan-400">PIX</span>
          <span className="text-orange-500">SUP</span> members
        </h3>
        <p className="mb-5 text-xs text-gray-400">
          Sign in to post, react, earn badges and track every hit.
        </p>
        {!emailMode ? (
          <div className="space-y-2.5">
            <button onClick={() => social("google")} className={socialBtn}>
              <Chrome className="h-4 w-4" /> Continue with Google
            </button>
            <button onClick={() => social("apple")} className={socialBtn}>
              <Apple className="h-4 w-4" /> Continue with Apple
            </button>
            <button onClick={() => setEmailMode(true)} className={socialBtn}>
              <Mail className="h-4 w-4" /> Continue with Email
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              className={inputClass}
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              onKeyDown={(e) => e.key === "Enter" && emailLogin()}
              className={inputClass}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={emailLogin}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-orange-500 py-2.5 text-sm font-black text-black transition active:scale-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </button>
            <button
              onClick={() => {
                onClose();
                navigate("/register");
              }}
              className="w-full text-center text-xs text-cyan-400 transition hover:text-cyan-300"
            >
              New here? Create an account
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}