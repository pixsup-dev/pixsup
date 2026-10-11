import { useEffect, useRef, useState } from "react";

// Watches a ranked row (ids in display order) and reports posts that just
// moved up, as { [id]: places climbed }. Each climb shows for a few seconds.
const SHOW_MS = 2500;

export default function useClimbers(ids) {
  const prev = useRef(null);
  const timers = useRef([]);
  const [climbs, setClimbs] = useState({});
  const key = ids.join(",");

  useEffect(() => {
    const next = new Map(ids.map((id, i) => [id, i]));
    const before = prev.current;
    prev.current = next;
    if (!before) return; // first look: nothing has moved yet

    const up = {};
    for (const [id, i] of next) {
      const was = before.get(id);
      if (was !== undefined && was > i) up[id] = was - i;
    }
    if (!Object.keys(up).length) return;
    setClimbs((c) => ({ ...c, ...up }));
    timers.current.push(
      setTimeout(
        () =>
          setClimbs((c) => {
            const left = { ...c };
            for (const id of Object.keys(up)) if (left[id] === up[id]) delete left[id];
            return left;
          }),
        SHOW_MS
      )
    );
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return climbs;
}
