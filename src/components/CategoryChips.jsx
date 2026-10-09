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

// Live hashtags for the top bar, recalculated as posts come and go. Members'
// tags come first (up to 4), so what people are posting always shows even
// when dozens of news stories are live; the busiest news topics fill the rest.
// Each post counts once per tag.
const MEMBER_TAGS = 4;

// "#Cars" and "car" are the same tag
const tagKey = (t) => {
  const k = String(t || "").trim().replace(/^#/, "").toLowerCase();
  return k.length > 3 && k.endsWith("s") && !k.endsWith("ss") ? k.slice(0, -1) : k;
};
export const sameTag = (a, b) => tagKey(a) === tagKey(b);
const SKIP = new Set(["all", "breaking"]);

function tally(posts) {
  const counts = {};
  for (const p of posts) {
    const seen = new Set();
    for (const raw of [...(p.hashtags || []), p.category ? `#${p.category}` : null]) {
      const body = String(raw || "").trim().replace(/^#/, "");
      const key = body.toLowerCase();
      if (body.length < 2 || !/^[a-z0-9]+$/i.test(body) || SKIP.has(key) || seen.has(key)) continue;
      seen.add(key);
      counts[key] ??= { tag: `#${body.charAt(0).toUpperCase()}${body.slice(1)}`, n: 0, newest: 0 };
      counts[key].n += 1;
      counts[key].newest = Math.max(counts[key].newest, new Date(p.created_date || 0).getTime());
    }
  }
  // "#Car" and "#Cars" are one tag (shown in whichever form is used more)
  for (const key of Object.keys(counts)) {
    const plural = counts[`${key}s`];
    if (!plural || !counts[key]) continue;
    const [keep, drop] = counts[key].n >= plural.n ? [key, `${key}s`] : [`${key}s`, key];
    counts[keep] = { ...counts[keep], n: counts[keep].n + counts[drop].n, newest: Math.max(counts[keep].newest, counts[drop].newest) };
    delete counts[drop];
  }
  // most posts first; ties go to the tag used most recently
  return Object.entries(counts)
    .sort(([, a], [, b]) => b.n - a.n || b.newest - a.newest)
    .map(([key, v]) => ({ key, ...v }));
}

export function topHashtags(posts, limit = 7) {
  const list = posts || [];
  const members = tally(list.filter((p) => !p.isNews)).slice(0, MEMBER_TAGS);
  const taken = new Set(members.map((t) => t.key));
  const news = tally(list.filter((p) => p.isNews)).filter((t) => !taken.has(t.key));
  return [...members, ...news].slice(0, limit).map(({ tag, n }) => ({ tag, n }));
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