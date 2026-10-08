import { createSyncedList } from "@/hooks/syncedList";

// Bookmarks: in this browser for guests, on the account for members. Saved
// posts still disappear from Pixsup when their decay timer runs out.
export const savedPosts = createSyncedList({
  storageKey: "pixsup_saved_post_ids",
  entity: "SavedPost",
  field: "post_id",
});

export default function useSavedPosts() {
  const saved = savedPosts.useList();

  const isSaved = (id) => saved.includes(id);

  const toggleSave = (id) => {
    if (!id) return;
    if (saved.includes(id)) savedPosts.remove(id);
    else savedPosts.add(id);
  };

  return { saved, isSaved, toggleSave };
}
