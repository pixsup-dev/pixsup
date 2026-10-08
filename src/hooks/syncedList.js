import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// A list of keys (post ids, blocked authors…) that lives in this browser for
// guests and on the account for members, so it follows them to every device.
// Anything a guest added is carried over to the account when they sign in.
// Every component using the list re-renders as soon as it changes.
export function createSyncedList({ storageKey, entity, field }) {
  const listeners = new Set();
  let userId = null;
  let list = readGuest();

  function readGuest() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeGuest(next) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — the list still works for this visit
    }
  }

  function publish(next) {
    list = next;
    listeners.forEach((fn) => fn(next));
  }

  // Call whenever the signed-in user changes (null for guests)
  async function sync(nextUserId) {
    userId = nextUserId || null;
    if (!userId) {
      publish(readGuest());
      return;
    }
    try {
      const rows = await base44.entities[entity].list(1000);
      if (userId !== nextUserId) return; // signed out/in again meanwhile
      const server = rows.map((r) => r[field]);
      const carried = readGuest().filter((k) => !server.includes(k));
      await Promise.all(
        carried.map((k) => base44.entities[entity].create({ [field]: k }).catch(() => {}))
      );
      writeGuest([]);
      publish([...server, ...carried]);
    } catch (e) {
      console.error(e);
    }
  }

  async function add(key) {
    if (!key || list.includes(key)) return;
    publish([...list, key]);
    if (!userId) return writeGuest(list);
    try {
      await base44.entities[entity].create({ [field]: key });
    } catch (e) {
      console.error(e);
    }
  }

  async function remove(key) {
    if (!key) return;
    publish(list.filter((k) => k !== key));
    if (!userId) return writeGuest(list);
    try {
      await base44.entities[entity].deleteMany({ [field]: key });
    } catch (e) {
      console.error(e);
    }
  }

  function useList() {
    const [value, setValue] = useState(list);
    useEffect(() => {
      listeners.add(setValue);
      setValue(list);
      return () => {
        listeners.delete(setValue);
      };
    }, []);
    return value;
  }

  return { useList, add, remove, sync };
}
