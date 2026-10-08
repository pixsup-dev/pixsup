import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Real-time notification feed + unread counter, shared app-wide from the layout.
// Returns empty data for guests. `refresh` lets consumers force a refetch
// (e.g. the Hits hub after marking activity as read).
export default function useNotifications() {
  const [authed, setAuthed] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const fetchRef = useRef(async () => {});

  useEffect(() => {
    base44.auth.isAuthenticated().then(setAuthed).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const fetchList = async () => {
      try {
        const me = await base44.auth.me();
        const list = await base44.entities.Notification.filter(
          { recipient_id: me.id },
          "-created_date",
          30
        );
        if (!alive) return;
        setNotifications(list);
        setUnread(list.filter((n) => !n.read).length);
      } catch (e) {
        /* notifications are non-critical — ignore */
      }
    };
    fetchRef.current = fetchList;
    fetchList();
    const unsub = base44.entities.Notification.subscribe(() => fetchList());
    return () => {
      alive = false;
      fetchRef.current = async () => {};
      unsub();
    };
  }, [authed]);

  const refresh = useCallback(() => fetchRef.current(), []);

  return { notifications, unread, refresh };
}