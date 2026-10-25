import { useEffect, useRef } from "react";

// Runs onDeleted(postId) when a post is deleted from its ⋮ menu, so lists and
// open views drop it straight away instead of waiting for the live update
export default function usePostDeleted(onDeleted) {
  const ref = useRef(onDeleted);
  ref.current = onDeleted;
  useEffect(() => {
    const handle = (e) => ref.current(e.detail);
    window.addEventListener("pixsup:post-deleted", handle);
    return () => window.removeEventListener("pixsup:post-deleted", handle);
  }, []);
}
