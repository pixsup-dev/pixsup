import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Looks up members' public usernames and avatars (cached for the session).
// useMembers returns { [id]: { username, avatar_url } }; useUsernames returns
// { [id]: username }. Ids without a username are simply absent.
const cache = new Map();

async function fetchMembers(ids) {
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length) {
    try {
      const rows = await base44.rpc("get_usernames", { p_ids: missing.slice(0, 500) });
      missing.forEach((id) => cache.set(id, null));
      for (const row of rows || []) cache.set(row.id, { username: row.username, avatar_url: row.avatar_url || null });
    } catch (e) {
      console.error(e); // names are decoration — the post still shows without them
    }
  }
  return Object.fromEntries(ids.filter((id) => cache.get(id)).map((id) => [id, cache.get(id)]));
}

// After a member changes their own picture, so it shows straight away
export function forgetMember(id) {
  cache.delete(id);
}

export function useMembers(ids) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [members, setMembers] = useState({});

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchMembers(key.split(",")).then((found) => alive && setMembers(found));
    return () => {
      alive = false;
    };
  }, [key]);

  return members;
}

export default function useUsernames(ids) {
  const members = useMembers(ids);
  return Object.fromEntries(Object.entries(members).map(([id, m]) => [id, m.username]));
}
