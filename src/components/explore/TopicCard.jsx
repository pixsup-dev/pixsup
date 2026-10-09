import React from "react";
import { Image } from "@/components/ui/image";

const EMOJI = {
  news: "📰", world: "🌍", tech: "💻", sports: "⚽", business: "💼", health: "🩺",
  science: "🔬", entertainment: "🎬", gaming: "🎮", nature: "🌿", travel: "✈️",
  food: "🍜", art: "🎨", fashion: "👗", beauty: "💄", pets: "🐾", funny: "😂",
  cars: "🚗", music: "🎵", people: "🧑", urban: "🏙️", ai: "🤖",
};

export const topicEmoji = (tag) => EMOJI[String(tag || "").replace("#", "").toLowerCase()] || "#️⃣";

// A topic with its most-engaged live post as the cover photo
export default function TopicCard({ tag, count, cover, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`spring-tap group relative h-24 overflow-hidden rounded-2xl border text-left transition-all active:scale-95 sm:h-28 ${
        active ? "border-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.45)]" : "border-white/10"
      }`}
    >
      {cover ? (
        <Image
          src={cover}
          alt=""
          fittingType="fill"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <span className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 to-orange-500/20" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
      <span className="absolute left-3 top-2.5 text-xl">{topicEmoji(tag)}</span>
      <span className="absolute bottom-2.5 left-3 right-3">
        <span className="block truncate text-sm font-black text-white">{tag}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
          {count} live {count === 1 ? "post" : "posts"}
        </span>
      </span>
    </button>
  );
}
