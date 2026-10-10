import { supabase } from "@/api/base44Client";

// How many people have Pixsup open right now (Supabase Realtime presence on
// one shared channel). Joined once per visit; listeners get the count.
let channel = null;
let count = 0;
const listeners = new Set();

export function joinPresence(userId) {
  if (channel) return;
  channel = supabase.channel("pixsup-online", {
    config: { presence: { key: userId || `guest-${Math.random().toString(36).slice(2)}` } },
  });
  channel
    .on("presence", { event: "sync" }, () => {
      count = Object.keys(channel.presenceState()).length;
      listeners.forEach((fn) => fn(count));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
    });
}

export function onPresence(fn) {
  listeners.add(fn);
  fn(count);
  return () => listeners.delete(fn);
}
