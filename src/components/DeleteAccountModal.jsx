import React, { useState } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2, X } from "lucide-react";

export default function DeleteAccountModal({ user, onClose }) {
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      // Permanently remove all of the user's content across the app
      await Promise.all([
        base44.entities.Post.deleteMany({ created_by_id: user.id }),
        base44.entities.Vote.deleteMany({ created_by_id: user.id }),
        base44.entities.Comment.deleteMany({ created_by_id: user.id }),
        base44.entities.Flag.deleteMany({ created_by_id: user.id }),
        base44.entities.Notification.deleteMany({ recipient_id: user.id }),
      ]);
      // Anonymize what remains of the profile, then end the session
      await base44.auth.updateMe({ display_name: "Deleted User" });
      await base44.auth.logout("/");
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-red-400/30 bg-[#151c28] p-5"
      >
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-red-400">
            <AlertTriangle className="h-4 w-4" /> Delete Account
          </h4>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs leading-relaxed text-gray-300">
          Are you sure? This will permanently delete your account, posts, and profile
          data. This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={busy}
            className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-extrabold text-white transition hover:bg-red-400 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Yes, delete everything"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}