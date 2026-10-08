import React from "react";

const KEYWORDS = {
  all: [],
  nature: ["golden", "shore", "pine", "fog", "mountain", "desert", "beach", "autumn", "trail", "garden", "bloom", "forest", "ridge", "valley", "mist", "dawn", "storm", "tide", "rain", "dew", "leaf"],
  urban: ["city", "neon", "alley", "rooftop", "market", "commute", "skate", "night", "streets", "skyline"],
  art: ["art", "studio", "film", "shadow", "vintage", "coffee", "abstract", "oil"],
  food: ["coffee", "market", "food", "pizza", "kitchen", "brunch", "dough", "snack"],
  travel: ["beach", "mountain", "pass", "trail", "shore", "desert", "highway", "valley", "sunset", "road", "journey"],
  sports: ["stadium", "court", "surf", "ride", "slope", "match", "run", "climb", "cycling", "bike"],
  gaming: ["arcade", "pixel", "console", "game", "dungeon", "cyber", "quest"],
  ai: ["pixel", "abstract", "neon", "dungeon", "cyber", "console"],
  future: ["neon", "cyber", "arcade", "skyline", "highway"],
  cyberpunk: ["neon", "cyber", "arcade", "alley", "midnight"],
  space: ["midnight", "star", "moon", "skyline", "cosmic"],
  macro: ["bloom", "leaf", "dew", "coffee", "grain"],
  aesthetic: ["golden", "art", "bloom", "vintage", "shadow", "light"],
  street: ["alley", "skate", "market", "streets", "commute", "rooftop"],
  anime: ["arcade", "pixel", "cyber", "console"],
  retro: ["vintage", "film", "arcade", "vinyl", "coffee"],
  architecture: ["rooftop", "bridge", "studio", "skyline", "tower"],
  fitness: ["court", "run", "climb", "ride", "cycling", "match"],
  wildlife: ["forest", "pine", "bird", "deer", "shore", "bloom"],
  lofi: ["coffee", "quiet", "fog", "vinyl", "dawn", "midnight"],
  "3d": ["pixel", "console", "dungeon", "render"],
};

export const HASHTAG_POOLS = [
  ["#All", "#Nature", "#Urban", "#Art", "#Food", "#Travel", "#Sports", "#Gaming"],
  ["#All", "#AI", "#Future", "#Cyberpunk", "#Space", "#Macro", "#Aesthetic", "#Street"],
  ["#All", "#Anime", "#Retro", "#Architecture", "#Fitness", "#Wildlife", "#LoFi", "#3D"],
];

export function isAllTag(tag) {
  return !tag || tag.toLowerCase() === "#all";
}

export function keywordsForTag(tag) {
  const id = (tag || "").replace("#", "").toLowerCase();
  return KEYWORDS[id] || [];
}

export function categoryFor(post) {
  if (post?.category) return `#${post.category}`;
  if (post?.hashtags && post.hashtags.length > 0) return post.hashtags[0];
  const title = (post?.title || "").toLowerCase();
  const id = Object.keys(KEYWORDS).find(
    (k) => k !== "all" && KEYWORDS[k].some((kw) => title.includes(kw))
  );
  if (!id) return null;
  const name = id === "3d" ? "3D" : id.charAt(0).toUpperCase() + id.slice(1);
  return `#${name}`;
}

// Top live hashtags from current posts, recalculated as content changes
export function topHashtags(posts, limit = 7) {
  const counts = {};
  const bump = (raw) => {
    const t = String(raw || "").trim();
    const body = t.startsWith("#") ? t.slice(1) : t;
    if (body.length < 3 || !/^[a-z0-9]+$/i.test(body)) return;
    const display = body.charAt(0).toUpperCase() + body.slice(1);
    const key = body.toLowerCase();
    if (!counts[key]) counts[key] = { tag: `#${display}`, n: 0 };
    counts[key].n += 1;
  };
  for (const p of posts || []) {
    for (const h of p.hashtags || []) bump(h);
    if (p.category) bump(`#${p.category}`);
  }
  return Object.values(counts)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export default function CategoryChips({ hashtags, active, onChange }) {
  return (
    <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto py-1 text-xs font-semibold">
      {(hashtags || []).map((tag) => (
        <button
          key={tag}
          onClick={() => onChange(tag)}
          className={`flex items-center justify-center whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold leading-none transition-all ${
            active === tag
              ? "border-cyan-400 bg-cyan-400 font-extrabold text-black"
              : "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/50 hover:text-white"
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}