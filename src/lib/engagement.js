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

// Public name for a member: their chosen username. Never derived from the
// email address, which must stay private.
export function displayNameFor(user) {
  if (!user) return "Someone";
  return user.username || user.display_name || "Member";
}