// Engagement-weighted scoring: 1 Hit = 1 pt, 1 emoji reaction = 2 pts, 1 comment = 5 pts
export function reactionTotal(post) {
  return Object.values(post.reactions || {}).reduce((sum, c) => sum + (c || 0), 0);
}

export function engagementScore(post) {
  if (!post) return 0;
  return (
    (post.hits || 0) +
    2 * reactionTotal(post) +
    5 * (post.comment_count || 0)
  );
}

export function displayNameFor(user) {
  if (!user) return "Someone";
  return user.display_name || user.full_name || (user.email || "Member").split("@")[0];
}