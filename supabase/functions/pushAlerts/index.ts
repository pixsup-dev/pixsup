import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

// Sends phone notifications (web push) every minute (pg_cron):
//  - someone commented on, rescued or trended your post (from notifications)
//  - your own post is about to die (2-5 minutes left, not trending)
// Each row is claimed before sending, so overlapping runs never double-send.
// Needs the VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets.

const PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@pixsup.com";
const PUSHED_TYPES = ["comment", "rescue", "trending"];
const MAX_PER_USER_PER_RUN = 3;

type Message = { title: string; body: string; url: string; tag: string };

const short = (s: string | null, n = 50) => {
  const t = (s || "your post").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function messageFor(n: { type: string; post_id: string; post_title: string | null; actor_name: string | null }): Message {
  const who = n.actor_name ? `@${n.actor_name}` : "Someone";
  const title = short(n.post_title);
  const url = `/p/${n.post_id}`;
  if (n.type === "rescue") return { title: "🦸 Your post was saved!", body: `${who} rescued “${title}” at the last second.`, url, tag: `rescue-${n.post_id}` };
  if (n.type === "trending") return { title: "🔥 Your post is trending!", body: `“${title}” made the 24-hour Trending Belt.`, url, tag: `trending-${n.post_id}` };
  return { title: "💬 New comment", body: `${who} commented on “${title}”.`, url, tag: `comment-${n.post_id}` };
}

Deno.serve(async () => {
  try {
    if (!PUBLIC || !PRIVATE) return json({ sent: 0, reason: "VAPID keys not set" });
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    const now = new Date();
    const nowIso = now.toISOString();
    const outbox = new Map<string, Message[]>(); // user id → messages

    const queue = (userId: string, m: Message) => {
      const list = outbox.get(userId) || [];
      if (list.length < MAX_PER_USER_PER_RUN) list.push(m);
      outbox.set(userId, list);
    };

    // 1) Fresh notifications worth a buzz (claimed by marking them pushed)
    const { data: notes, error: noteError } = await admin
      .from("notifications")
      .update({ pushed_at: nowIso })
      .is("pushed_at", null)
      .in("type", PUSHED_TYPES)
      .gt("created_date", new Date(now.getTime() - 15 * 60 * 1000).toISOString())
      .select("recipient_id, type, post_id, post_title, actor_name");
    if (noteError) throw noteError;
    for (const n of notes || []) queue(n.recipient_id, messageFor(n));

    // 2) Members' own posts that are about to die
    const { data: dying, error: dyingError } = await admin
      .from("posts")
      .update({ dying_alert_at: nowIso })
      .eq("isNews", false)
      .eq("is_trending", false)
      .is("hidden_at", null)
      .not("created_by_id", "is", null)
      .gt("expires_at", new Date(now.getTime() + 2 * 60 * 1000).toISOString())
      .lte("expires_at", new Date(now.getTime() + 5 * 60 * 1000).toISOString())
      .or(`dying_alert_at.is.null,dying_alert_at.lt.${new Date(now.getTime() - 30 * 60 * 1000).toISOString()}`)
      .select("id, title, created_by_id, expires_at");
    if (dyingError) throw dyingError;
    for (const p of dying || []) {
      const mins = Math.max(1, Math.round((Date.parse(p.expires_at) - now.getTime()) / 60000));
      queue(p.created_by_id, {
        title: `⏳ ${mins} minutes left!`,
        body: `“${short(p.title)}” is about to disappear. Share it so people can save it.`,
        url: `/p/${p.id}`,
        tag: `dying-${p.id}`,
      });
    }

    if (!outbox.size) return json({ sent: 0 });

    const { data: subs, error: subError } = await admin
      .from("push_subscriptions")
      .select("endpoint, user_id, p256dh, auth")
      .in("user_id", [...outbox.keys()]);
    if (subError) throw subError;

    let sent = 0;
    const gone: string[] = [];
    await Promise.all(
      (subs || []).flatMap((s) =>
        (outbox.get(s.user_id) || []).map(async (m) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify(m),
              { TTL: 600, urgency: "high" }
            );
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number })?.statusCode;
            if (status === 404 || status === 410) gone.push(s.endpoint); // they turned alerts off
            else console.error("push failed", status, (e as Error)?.message);
          }
        })
      )
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("endpoint", [...new Set(gone)]);

    return json({ sent, users: outbox.size, removed: gone.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
