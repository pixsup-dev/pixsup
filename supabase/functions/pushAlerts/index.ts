import webpush from "npm:web-push@3.6.7";
import { json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

// Sends phone notifications (web push) every minute (pg_cron):
//  - someone commented on, rescued or trended your post (from notifications)
//  - your own post is about to die (2-5 minutes left, not trending)
//  - 💀 your post just died: share it so people can revive it from the Graveyard
//  - 🔔 a post you're watching is about to die
//  - 🛟 Rescue Radar: a post in your topics or city is dying (3 a day at most)
// Each row is claimed before sending, so overlapping runs never double-send.
// Needs the VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets.

const PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@pixsup.com";
const PUSHED_TYPES = ["comment", "rescue", "trending", "revive"];
const MAX_PER_USER_PER_RUN = 3;
const RADAR_PER_DAY = 3;

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
  if (n.type === "revive") return { title: "🧟 Your post is back from the dead!", body: `The crowd revived “${title}”. It has 30 more minutes.`, url, tag: `revive-${n.post_id}` };
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

    // 2b) 💀 Members' posts that just died (Graveyard, once per post). Optional
    // until the Graveyard columns exist.
    try {
      const { data: dead, error: deadError } = await admin
        .from("posts")
        .update({ death_alert_at: nowIso })
        .eq("isNews", false)
        .is("hidden_at", null)
        .is("revived_at", null)
        .is("death_alert_at", null)
        .not("created_by_id", "is", null)
        .gt("expires_at", new Date(now.getTime() - 3 * 60 * 1000).toISOString())
        .lte("expires_at", nowIso)
        .select("id, title, created_by_id, expires_at");
      if (deadError) throw deadError;
      for (const p of dead || []) {
        const left = Math.max(1, 10 - Math.round((now.getTime() - Date.parse(p.expires_at)) / 60000));
        queue(p.created_by_id, {
          title: "💀 Your post just died",
          body: `“${short(p.title)}” is in the Graveyard. Share it: if 3 people revive it in ${left} minutes, it's back!`,
          url: `/p/${p.id}`,
          tag: `dead-${p.id}`,
        });
      }
    } catch (deadError) {
      console.error("death alerts skipped:", deadError);
    }

    // Posts about to die that others could still save (1-5 minutes left)
    const { data: endangered, error: endangeredError } = await admin
      .from("posts")
      .select("id, title, category, hashtags, city, created_by_id, expires_at")
      .eq("is_trending", false)
      .is("hidden_at", null)
      .gt("expires_at", new Date(now.getTime() + 60 * 1000).toISOString())
      .lte("expires_at", new Date(now.getTime() + 5 * 60 * 1000).toISOString())
      .limit(200);
    if (endangeredError) throw endangeredError;
    const byId = new Map((endangered || []).map((p) => [p.id, p]));
    const minsLeft = (p: { expires_at: string }) =>
      Math.max(1, Math.round((Date.parse(p.expires_at) - now.getTime()) / 60000));

    // Watch and Radar are extras: if they fail, the alerts above still go out
    if (byId.size) try {
      // 3) 🔔 Watched posts (claimed by marking them alerted; again after 30 min)
      const { data: watches, error: watchError } = await admin
        .from("post_watches")
        .update({ alerted_at: nowIso })
        .in("post_id", [...byId.keys()])
        .or(`alerted_at.is.null,alerted_at.lt.${new Date(now.getTime() - 30 * 60 * 1000).toISOString()}`)
        .select("post_id, user_id");
      if (watchError) throw watchError;
      for (const w of watches || []) {
        const p = byId.get(w.post_id);
        if (!p || p.created_by_id === w.user_id) continue; // owners get their own alert
        queue(w.user_id, {
          title: `🔔 ${minsLeft(p)} minutes left!`,
          body: `“${short(p.title)}” is about to disappear. Hit it to save it!`,
          url: `/p/${p.id}`,
          tag: `dying-${p.id}`,
        });
      }

      // 4) 🛟 Rescue Radar: members with topics or their city, alerts on
      const { data: radar, error: radarError } = await admin
        .from("profiles")
        .select("id, radar_topics, radar_city, city")
        .or("radar_city.eq.true,radar_topics.neq.{}")
        .eq("banned", false);
      if (radarError) throw radarError;
      const radarIds = (radar || []).map((r) => r.id);
      if (radarIds.length) {
        const [{ data: withPush }, { data: today }, { data: hits }, { data: watched }] = await Promise.all([
          admin.from("push_subscriptions").select("user_id").in("user_id", radarIds),
          admin
            .from("radar_alerts")
            .select("user_id, post_id")
            .in("user_id", radarIds)
            .gt("created_date", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),
          admin.from("votes").select("created_by_id, post_id").in("post_id", [...byId.keys()]).in("created_by_id", radarIds),
          admin.from("post_watches").select("user_id, post_id").in("post_id", [...byId.keys()]).in("user_id", radarIds),
        ]);
        const reachable = new Set((withPush || []).map((r) => r.user_id));
        const usedToday = new Map<string, number>();
        for (const a of today || []) usedToday.set(a.user_id, (usedToday.get(a.user_id) || 0) + 1);
        const touched = new Set([
          ...(hits || []).map((h) => `${h.created_by_id}:${h.post_id}`),
          ...(watched || []).map((w) => `${w.user_id}:${w.post_id}`),
          ...(today || []).map((a) => `${a.user_id}:${a.post_id}`),
        ]);
        // most urgent first
        const posts = [...byId.values()].sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));

        for (const r of radar || []) {
          if (!reachable.has(r.id) || (usedToday.get(r.id) || 0) >= RADAR_PER_DAY) continue;
          const topics = (r.radar_topics || []).map((t: string) => t.toLowerCase());
          const match = posts.find((p) => {
            if (p.created_by_id === r.id || touched.has(`${r.id}:${p.id}`)) return false;
            const inTopic =
              topics.includes(String(p.category || "").toLowerCase()) ||
              (p.hashtags || []).some((h: string) => topics.includes(h.replace(/^#/, "").toLowerCase()));
            const inCity = r.radar_city && r.city && p.city && p.city.toLowerCase() === r.city.toLowerCase();
            return inTopic || inCity;
          });
          if (!match) continue;
          // claim it: the primary key stops a second run sending the same one
          const { error: claimError } = await admin.from("radar_alerts").insert({ user_id: r.id, post_id: match.id });
          if (claimError) continue;
          const where = r.radar_city && r.city && match.city?.toLowerCase() === r.city.toLowerCase()
            ? `📍 ${match.city}`
            : match.category || "your topics";
          queue(r.id, {
            title: `🛟 Rescue Radar · ${where}`,
            body: `“${short(match.title)}” has ${minsLeft(match)} minutes left and needs saving!`,
            url: `/p/${match.id}`,
            tag: `dying-${match.id}`,
          });
        }
      }
    } catch (extraError) {
      console.error("watch/radar alerts skipped:", extraError);
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
