import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ‹ › buttons for a sideways row (like the Trending Belt's), always shown
// like the other rows', and dimmed when everything already fits. Usage:
//   const row = useRowScroll();
//   <RowArrows row={row} />   …   <div ref={row.ref} className="overflow-x-auto">
export function useRowScroll() {
  const ref = useRef(null);
  const [more, setMore] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    setMore(!!el && el.scrollWidth > el.clientWidth + 4);
  }, []);

  useEffect(() => {
    check();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  });

  const scroll = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return { ref, more, scroll };
}

export default function RowArrows({ row }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        onClick={() => row.scroll(-1)}
        disabled={!row.more}
        aria-label="Scroll left"
        className="spring-tap rounded-full border border-cyan-400/40 bg-cyan-400/10 p-1 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.4)] transition hover:bg-cyan-400/20 active:scale-95 disabled:opacity-30 disabled:shadow-none"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => row.scroll(1)}
        disabled={!row.more}
        aria-label="Scroll right"
        className="spring-tap rounded-full border border-amber-400/40 bg-amber-400/10 p-1 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)] transition hover:bg-amber-400/20 active:scale-95 disabled:opacity-30 disabled:shadow-none"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
