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
    <section className="mb-6 overflow-hidden rounded-2xl border border-orange-400/30 bg-gradient-to-r from-orange-500/15 via-fuchsia-500/10 to-cyan-500/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-orange-300">
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
          <p className="mt-0.5 text-lg font-black leading-tight text-white">{challenge.prompt}</p>
          <button onClick={onBrowse} className="mt-0.5 text-sm font-bold text-cyan-300 hover:underline">
            {challenge.tag} · {entries.length === 1 ? "1 entry" : `${entries.length} entries`} live
          </button>
        </div>
        <button
          onClick={onJoin}
          className="spring-tap flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-fuchsia-500 px-4 py-2 text-sm font-black text-white shadow-lg active:scale-95"
        >
          <Camera className="h-4 w-4" /> Join the challenge
        </button>
      </div>

      {entries.length > 0 ? (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
          {entries.slice(0, 12).map((p, i) => (
            <button
              key={p.id}
              onClick={() => onOpen(p)}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10"
            >
              <Image src={p.thumbnail_url || p.media_url} alt={p.title} fittingType="fill" className="h-full w-full object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-full bg-yellow-400 px-1.5 text-[9px] font-black text-black">
                  👑 #1
                </span>
              )}
              <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[9px] font-bold text-yellow-300">
                ⚡ {p.hits || 0}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-300">No entries yet. Be the first, and the best one wears the crown 👑</p>
      )}
    </section>
  );
}
