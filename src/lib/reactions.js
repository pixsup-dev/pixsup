// News gets "how does this make you feel" reactions; member posts keep the
// playful set (plus any AI-suggested emojis).
export const NEWS_REACTIONS = ["😮", "😢", "😡", "👏", "🤔"];

export function reactionPalette(post) {
  if (post?.isNews) return NEWS_REACTIONS;
  const extra = post?.emojis?.length ? post.emojis : ["🤯", "💀"];
  return [...new Set(["🔥", "😂", ...extra])].slice(0, 5);
}

// The crowd's mood: top reactions as shares of all reactions, e.g.
// [{ emoji: "😢", pct: 62 }, { emoji: "😡", pct: 21 }]. Null until anyone reacts.
export function moodSummary(reactions, limit = 3) {
  const entries = Object.entries(reactions || {}).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return null;
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([emoji, n]) => ({ emoji, pct: Math.round((n * 100) / total), count: n }));
}
