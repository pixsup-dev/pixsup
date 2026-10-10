import React, { useState } from "react";
import { X } from "lucide-react";
import useGameRules from "@/hooks/useGameRules";

const SEEN_KEY = "pixsup_announcement_closed";

// The admin's announcement (Admin → Settings) and a notice while posting is
// paused. People can close an announcement; a new one shows again.
export default function AnnouncementBar() {
  const rules = useGameRules();
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const text = (rules.announcement || "").trim();
  const showNotice = text && closed !== text;
  if (!showNotice && !rules.posting_paused) return null;

  return (
    <div className="mx-auto mt-2 max-w-7xl space-y-2 px-3 sm:px-6">
      {rules.posting_paused && (
        <p className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200">
          ⏸️ Posting is paused for a few minutes. You can still browse, hit and comment.
        </p>
      )}
      {showNotice && (
        <div className="flex items-start gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100">
          <span className="min-w-0 flex-1">📢 {text}</span>
          <button
            onClick={() => {
              setClosed(text);
              try {
                localStorage.setItem(SEEN_KEY, text);
              } catch {
                // fine
              }
            }}
            aria-label="Close announcement"
            className="shrink-0 rounded p-0.5 text-cyan-200 hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
