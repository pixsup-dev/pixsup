import React, { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useBlocklist, handleLabel } from "@/hooks/useBlocklist";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import PreferencesSection from "@/components/PreferencesSection";
import AlertsSection from "@/components/AlertsSection";
import { base44 } from "@/api/base44Client";
import { LifeBuoy, Shield, Trash2, Mail, Ban, FileText, ShieldAlert, Sparkles, LogOut } from "lucide-react";

const SUPPORT_EMAIL = "support@pixsup.com";

const GUIDELINES = [
  "Zero tolerance for objectionable content — harassment, hate speech, threats, or explicit material is removed and accounts are terminated.",
  "Every image is checked by AI moderation before it reaches the grid; unsafe images are rejected.",
  "Moderators review reported posts and chat messages, and remove anything that breaks these rules.",
  "Community reports are acted on swiftly — 3 independent reports auto-hide a post immediately.",
  "Report or block any user from the 3-dot menu on their post, and manage your blocks here at any time.",
];

export default function Settings() {
  const { user, openWelcome, refreshUser } = useOutletContext();
  const { blocked, unblock } = useBlocklist();
  const [deleting, setDeleting] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-8 pt-4 sm:px-6">
      <h1 className="mb-1 text-lg font-black text-cyan-400">⚙️ Settings</h1>
      <p className="mb-5 text-xs text-gray-400">
        Support, community rules, blocked users and account controls.
      </p>

      {/* Help & Support */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cyan-400">
          <LifeBuoy className="h-3.5 w-3.5" /> Help & Support
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-bold text-gray-200">
            <Shield className="h-3.5 w-3.5 text-cyan-400" /> Community Guidelines /
            Acceptable Use Policy
          </p>
          <ul className="mb-4 space-y-1.5">
            {GUIDELINES.map((g) => (
              <li key={g} className="flex gap-2 text-xs text-gray-400">
                <span className="text-cyan-400">•</span> {g}
              </li>
            ))}
          </ul>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="spring-tap inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-extrabold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
          >
            <Mail className="h-3.5 w-3.5" /> Contact Support · {SUPPORT_EMAIL}
          </a>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-gray-400">
            <button onClick={openWelcome} className="flex items-center gap-1 hover:text-white">
              <Sparkles className="h-3 w-3" /> How Pixsup works
            </button>
            <Link to="/terms" className="flex items-center gap-1 hover:text-white">
              <FileText className="h-3 w-3" /> Terms of Service
            </Link>
            <Link to="/privacy" className="flex items-center gap-1 hover:text-white">
              <FileText className="h-3 w-3" /> Privacy Policy
            </Link>
            {user?.role === "admin" && (
              <Link to="/admin" className="flex items-center gap-1 text-red-300 hover:text-red-200">
                <ShieldAlert className="h-3 w-3" /> Moderation
              </Link>
            )}
          </div>
        </div>
      </section>

      {user && <PreferencesSection user={user} onSaved={refreshUser} />}
      {user && <AlertsSection />}

      {/* Blocked Users */}
      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-orange-400">
          <Ban className="h-3.5 w-3.5" /> Blocked Users
        </h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          {blocked.length === 0 ? (
            <p className="text-xs text-gray-400">You haven't blocked anyone.</p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span className="truncate text-xs font-bold text-gray-200">
                    {handleLabel(key)}
                  </span>
                  <button
                    onClick={() => unblock(key)}
                    className="spring-tap shrink-0 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-extrabold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-gray-500">
            {user
              ? "Blocked users are hidden on every device you sign in on, and can't send you notifications."
              : "Blocked users are hidden on this device. Sign in to keep your blocks everywhere."}
          </p>
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-red-400">
          <Trash2 className="h-3.5 w-3.5" /> Account
        </h2>
        <div className="rounded-2xl border border-red-400/20 bg-red-400/5 p-4">
          {user ? (
            <>
              <button
                onClick={() => base44.auth.logout("/")}
                className="spring-tap mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-extrabold text-gray-100 transition hover:bg-white/10 active:scale-95"
              >
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
              <p className="mb-3 text-xs text-gray-400">
                Deleting your account permanently removes your posts, votes,
                comments, reports and profile data.
              </p>
              <button
                onClick={() => setDeleting(true)}
                className="spring-tap w-full rounded-xl border border-red-400/50 bg-red-500/15 py-2 text-xs font-extrabold text-red-300 transition hover:bg-red-500/25 active:scale-95"
              >
                Delete Account
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400">Sign in to manage your account.</p>
          )}
        </div>
      </section>

      {deleting && user && (
        <DeleteAccountModal user={user} onClose={() => setDeleting(false)} />
      )}
    </main>
  );
}