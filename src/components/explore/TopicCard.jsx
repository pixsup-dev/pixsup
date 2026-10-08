import React from "react";

const GRADIENTS = [
  "from-cyan-500/30 to-blue-600/20",
  "from-orange-500/30 to-rose-600/20",
  "from-violet-500/30 to-purple-600/20",
  "from-emerald-500/30 to-teal-600/20",
  "from-pink-500/30 to-fuchsia-600/20",
  "from-amber-400/30 to-orange-600/20",
  "from-sky-500/30 to-indigo-600/20",
  "from-lime-500/30 to-green-600/20",
];

export default function TopicCard({ tag, count, index = 0, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`spring-tap group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 text-left transition-all hover:scale-[1.02] active:scale-95 ${
        active
          ? "border-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
          : "border-white/10"
      } ${GRADIENTS[index % GRADIENTS.length]}`}
    >
      <span className="truncate text-sm font-black tracking-wide text-white">
        {tag}
      </span>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-300">
        {count} live {count === 1 ? "post" : "posts"}
      </p>
      <span className="absolute -right-4 -top-4 h-14 w-14 rounded-full bg-cyan-400/10 blur-xl transition group-hover:bg-cyan-400/20" />
    </button>
  );
}