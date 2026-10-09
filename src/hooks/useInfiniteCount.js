import { useCallback, useEffect, useRef, useState } from "react";

// Infinite scroll: shows `step` items, and `step` more each time the sentinel
// (put it after the list) comes within ~1.5 screens of view. Returns
// [visible, sentinelRef, showMore]; showMore is the manual fallback.
export default function useInfiniteCount(step = 12, resetKey) {
  const [visible, setVisible] = useState(step);
  const observer = useRef(null);
  const showMore = useCallback(() => setVisible((v) => v + step), [step]);

  // Back to the first page when the list itself changes (new filter or tab)
  useEffect(() => setVisible(step), [resetKey, step]);

  const sentinelRef = useCallback(
    (node) => {
      observer.current?.disconnect();
      if (!node || typeof IntersectionObserver === "undefined") return;
      observer.current = new IntersectionObserver(
        (entries) => entries.some((e) => e.isIntersecting) && showMore(),
        { rootMargin: "0px 0px 150% 0px" }
      );
      observer.current.observe(node);
    },
    // re-observe after each page: a sentinel that's still in view fires again
    [showMore, visible]
  );

  useEffect(() => () => observer.current?.disconnect(), []);

  return [visible, sentinelRef, showMore];
}
