import React, { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Link } from "react-router-dom";
import { base44, supabase } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { pushEnabled } from "@/lib/push";

// The member's watched post ids, loaded once per visit and shared by every bell
let watched = null;
let loading = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(new Set(watched)));

function loadWatches() {
  loading ??= supabase
    .from("post_watches")
    .select("post_id")
    .then(({ data }) => {
      watched = new Set((data || []).map((w) => w.post_id));
      emit();
    });
  return loading;
}

// 🔔 Watch a post: a phone alert when it's about to die, so you can save it
export default function WatchButton({ post, user, onSignIn, className = "" }) {
  const { toast } = useToast();
  const [ids, setIds] = useState(() => new Set(watched || []));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    listeners.add(setIds);
    loadWatches();
    return () => listeners.delete(setIds);
  }, [user?.id]);

  if (user && post.created_by_id === user.id) return null; // you get alerts for your own posts anyway
  const on = ids.has(post.id);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!user) return onSignIn?.();
    setBusy(true);
    try {
      const now = await base44.rpc("toggle_watch", { p_post_id: post.id });
      watched = new Set(watched || []);
      if (now) watched.add(post.id);
      else watched.delete(post.id);
      emit();
      if (now) {
        const alertsOn = await pushEnabled().catch(() => false);
        toast({
          title: "🔔 Watching this post",
          description: alertsOn ? (
            "We'll ping you if it's about to die."
          ) : (
            <span>
              Turn on <Link to="/settings" className="font-bold underline">phone alerts</Link> to get pinged when it's
              about to die.
            </span>
          ),
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't update", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={on ? "Stop watching" : "Watch this post"}
      aria-pressed={on}
      title={on ? "Watching: you'll get an alert if it's about to die" : "Watch: get an alert if it's about to die"}
      className={className}
    >
      {on ? <BellRing className="h-3.5 w-3.5 fill-orange-400 text-orange-400" /> : <Bell className="h-3.5 w-3.5" />}
    </button>
  );
}
