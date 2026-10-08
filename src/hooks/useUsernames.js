import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Looks up public usernames for member ids (cached for the session).
// Returns { [id]: username } — ids without a username are simply absent.
const cache = new Map();

async function fetchUsernames(ids) {
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length) {
    try {
      const rows = await base44.rpc("get_usernames", { p_ids: missing.slice(0, 500) });
      missing.forEach((id) => cache.set(id, null));
      for (const row of rows || []) cache.set(row.id, row.username);
    } catch (e) {
      console.error(e); // names are decoration — the post still shows without them
    }
  }
  return Object.fromEntries(ids.filter((id) => cache.get(id)).map((id) => [id, cache.get(id)]));
}

export default function useUsernames(ids) {
  const key = [...new Set(ids.filter(Boolean))].sort().join(",");
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchUsernames(key.split(",")).then((found) => alive && setNames(found));
    return () => {
      alive = false;
    };
  }, [key]);

  return names;
}
