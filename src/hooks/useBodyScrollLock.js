import { useEffect } from "react";

// Freezes the page behind a popup while it's open, so scrolling only moves
// the popup. Counted, so stacked popups (e.g. report dialog over a post) work.
let locks = 0;
let previousOverflow = "";

export default function useBodyScrollLock() {
  useEffect(() => {
    if (locks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--locks === 0) document.body.style.overflow = previousOverflow;
    };
  }, []);
}
