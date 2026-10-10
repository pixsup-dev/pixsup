import React, { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { engagementScore } from "@/lib/engagement";

// Today's challenge, fetched once per visit (null until the server has one)
let challengePromise = null;
export function useTodaysChallenge() {
  const [challenge, setChallenge] = useState(null);
  useEffect(() => {
    challengePromise ??= base44.rpc("todays_challenge").catch(() => null);
    let alive = true;
    challengePromise.then((c) => alive && c?.tag && setChallenge(c));
    return () => {
      alive = false;
    };
  }, []);
  return challenge;
}

export const isChallengeEntry = (post, challenge) =>
  !!challenge?.tag &&
  (post.hashtags || []).some((h) => h.toLowerCase() === challenge.tag.toLowerCase());

// The Daily Challenge banner: one photo prompt for everyone today, its live
// entries, and a button that opens the upload already tagged.
export default function DailyChallenge({ challenge, posts, onJoin, onBrowse, onOpen }) {
  if (!challenge?.tag) return null;
  const entries = posts
    .filter((p) => isChallengeEntry(p, challenge))
    .sort((a, b) => engagementScore(b) - engagementScore(a));

  return (
    // One slim row: the challenge, its top entries (computers) and Join
    <section className="mb-5 overflow-hidden rounded-2xl border border-orange-400/30 bg-gradient-to-r from-orange-500/15 via-fuchsia-500/10 to-cyan-500/15 px-3 py-2.5 sm:mb-6 sm:px-4 sm:py-3">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 sm:max-w-md sm:flex-none">
          <p className="hidden text-[10px] font-extrabold uppercase tracking-widest text-orange-300 sm:block">
            📸 Today's challenge
            {challenge.sponsor && (
              <span className="ml-2 normal-case tracking-normal text-gray-300">
                presented by{" "}
                {challenge.sponsor_url ? (
                  <a
                    href={challenge.sponsor_url}
                    target="_blank"
                    rel="noreferrer sponsored"
                    className="font-bold text-white underline"
                  >
                    {challenge.sponsor}
                  </a>
                ) : (
                  <span className="font-bold text-white">{challenge.sponsor}</span>
                )}
              </span>
            )}
          </p>
          <p className="truncate text-sm font-black leading-tight text-white sm:text-base">
            <span className="sm:hidden">📸 </span>
            {challenge.prompt}
          </p>
          <button onClick={onBrowse} className="mt-0.5 text-[11px] font-bold text-cyan-300 hover:underline sm:text-xs">
            {challenge.tag} · {entries.length === 1 ? "1 entry" : `${entries.length} entries`} live
          </button>
        </div>

        {/* Top entries, in the same row (computers only; phones tap the count) */}
        <div className="no-scrollbar hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex">
          {entries.length > 0 ? (
            entries.slice(0, 12).map((p, i) => (
              <button
                key={p.id}
                onClick={() => onOpen(p)}
                title={p.title}
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10"
              >
                <Image src={p.thumbnail_url || p.media_url} alt={p.title} fittingType="fill" className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-0.5 top-0.5 text-xs leading-none">👑</span>}
                <span className="absolute bottom-0.5 right-0.5 rounded-full bg-black/70 px-1 text-[8px] font-bold text-yellow-300">
                  ⚡{p.hits || 0}
                </span>
              </button>
            ))
          ) : (
            <p className="text-xs text-gray-400">No entries yet. Be the first, and the best one wears the crown 👑</p>
          )}
        </div>

        <button
          onClick={onJoin}
          data-tour="challenge"
          className="spring-tap flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-fuchsia-500 px-3 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 sm:px-4 sm:py-2 sm:text-sm"
        >
          <Camera className="h-4 w-4" /> Join<span className="hidden sm:inline"> the challenge</span>
        </button>
      </div>
    </section>
  );
}
