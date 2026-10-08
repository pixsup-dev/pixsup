import { createSyncedList } from "@/hooks/syncedList";

// The author key of a post: the news source for news tiles (e.g. "BBC News"),
// the member ID for member posts, or the legacy guest ID for old anonymous posts
export function authorKeyOf(post) {
  if (!post) return null;
  return post.guest_author_id || post.created_by_id || null;
}

const MEMBER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Friendly display label for a stored author key
export function handleLabel(key) {
  if (!key) return "Unknown user";
  if (key.startsWith("guest-")) return `Anonymous guest · ${key.slice(6, 12)}`;
  if (MEMBER_ID.test(key)) return `Member · ${key.slice(-6)}`;
  return key; // a news source
}

// Blocked authors: in this browser for guests, on the account for members
// (so blocks apply on every device, and blocked members can't notify you).
// Blocking notifies every mounted consumer, so their posts vanish at once.
export const blocklist = createSyncedList({
  storageKey: "pixsup_blocked_authors",
  entity: "Block",
  field: "blocked_key",
});

export function useBlocklist() {
  const blocked = blocklist.useList();
  return { blocked, block: blocklist.add, unblock: blocklist.remove };
}
