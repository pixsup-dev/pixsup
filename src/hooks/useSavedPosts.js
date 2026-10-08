import { useEffect, useState } from "react";

const KEY = "pixsup_saved_post_ids";
const listeners = new Set();

function readList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  listeners.forEach((fn) => fn(list));
}

// Bookmarks live in this browser (guests included) and sync across every
// component using this hook in real time. Saved posts still disappear from
// Pixsup when their decay timer runs out.
export default function useSavedPosts() {
  const [saved, setSaved] = useState(readList);

  useEffect(() => {
    listeners.add(setSaved);
    return () => {
      listeners.delete(setSaved);
    };
  }, []);

  const isSaved = (id) => saved.includes(id);

  const toggleSave = (id) => {
    if (!id) return;
    writeList(saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id]);
  };

  return { saved, isSaved, toggleSave };
}