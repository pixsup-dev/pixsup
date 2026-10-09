// Search shared by Home and Explore. Every word typed must match somewhere in
// the post: title, story summary, topic, hashtags, news source, city or the
// poster's @username. Case, accents and leading #/@ are ignored, so "#coffee",
// "Coffee" and "cafe" all work, word order doesn't matter, and a plural finds
// the singular ("cars" → "car").

const fold = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "");

export function searchTerms(query) {
  // words split the same way as posts: spaces, #, @, hyphens, punctuation
  return fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function haystack(post, username) {
  return fold(
    [
      post.title,
      post.summary,
      post.category,
      ...(post.hashtags || []).map((h) => h.replace(/^#/, "")),
      post.guest_author_id,
      post.city,
      username,
      post.isNews ? "news" : "",
    ].join(" \n ")
  );
}

// A term matches the start of a word ("art" finds "artist", not "start"); a
// plural also finds the exact singular word ("cars" finds "car", not "care")
const wordMatches = (words, term) =>
  words.some((w) => w.startsWith(term)) ||
  (term.length > 3 && term.endsWith("s") && words.includes(term.slice(0, -1)));

// terms: from searchTerms(); names: { [userId]: username } (optional)
export function matchesSearch(post, terms, names = {}) {
  if (!terms.length) return true;
  const words = haystack(post, names[post.created_by_id]).split(/[^\p{L}\p{N}]+/u);
  return terms.every((t) => wordMatches(words, t));
}
