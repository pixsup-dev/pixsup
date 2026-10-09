// Breaking news: a top story tagged #Breaking by the news engine (published
// under 90 minutes before it arrived). The label fades after 2 hours.
export const BREAKING_FOR_MS = 2 * 60 * 60 * 1000;

export const isBreaking = (post, now = Date.now()) =>
  !!post?.isNews &&
  (post.hashtags || []).includes("#Breaking") &&
  now - new Date(post.created_date).getTime() < BREAKING_FOR_MS;
