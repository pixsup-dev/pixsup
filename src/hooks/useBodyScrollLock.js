import { useEffect } from "react";

// Freezes the page behind a popup while it's open, so scrolling only moves
// the popup. Counted, so stacked popups (e.g. report dialog over a post) work.
// overflow:hidden alone doesn't stop iPhone Safari scrolling the page, so the
// body is pinned in place and the scroll position restored on close.
let locks = 0;
let saved = null;

export default function useBodyScrollLock() {
  useEffect(() => {
    if (locks++ === 0) {
      const { style } = document.body;
      saved = {
        y: window.scrollY,
        overflow: style.overflow,
        position: style.position,
        top: style.top,
        width: style.width,
      };
      style.overflow = "hidden";
      style.position = "fixed";
      style.top = `-${saved.y}px`;
      style.width = "100%";
    }
    return () => {
      if (--locks === 0 && saved) {
        const { style } = document.body;
        style.overflow = saved.overflow;
        style.position = saved.position;
        style.top = saved.top;
        style.width = saved.width;
        window.scrollTo(0, saved.y);
        saved = null;
      }
    };
  }, []);
}
