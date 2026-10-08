import { useEffect, useState } from "react";

const KEY = "pixsup_blocked_authors";
const listeners = new Set();

const readList = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};

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

// Local block list (per browser). Blocking a handle notifies every mounted
// consumer immediately, so blocked authors vanish from the feed at once.
export function useBlocklist() {
  const [blocked, setBlocked] = useState(readList);

  useEffect(() => {
    const fn = (list) => setBlocked(list);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  const block = (authorKey) => {
    if (!authorKey) return;
    const list = readList();
    if (list.includes(authorKey)) return;
    const next = [...list, authorKey];
    localStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((fn) => fn(next));
  };

  const unblock = (authorKey) => {
    if (!authorKey) return;
    const next = readList().filter((k) => k !== authorKey);
    localStorage.setItem(KEY, JSON.stringify(next));
    listeners.forEach((fn) => fn(next));
  };

  return { blocked, block, unblock };
}