import { json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

// The Morning Pulse email: once a day (pg_cron), the posts people kept alive
// over the last 24 hours, sent to members who opted in from Settings. Sends
// at most once per UTC day however often it's called, so a stray call can't
// spam anyone. Needs the RESEND_API_KEY secret; without it nothing is sent.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE = "https://www.pixsup.com";
const FROM = "Pixsup <noreply@pixsup.com>";

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Post = {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  media_type: string | null;
  hits: number;
  reactions: Record<string, number> | null;
  comment_count: number;
  isNews: boolean;
  guest_author_id: string | null;
};

const score = (p: Post) =>
  (p.hits || 0) +
  2 * Object.values(p.reactions || {}).reduce((s, n) => s + (n || 0), 0) +
  5 * (p.comment_count || 0);

function emailHtml(posts: Post[], challenge: { prompt: string; tag: string } | null, unsubscribeUrl: string) {
  const rows = posts
    .map((p, i) => {
      const img = p.media_type === "image" ? p.thumbnail_url || p.media_url : null;
      return `
      <tr><td style="padding:10px 0;border-bottom:1px solid #1f2937">
        <a href="${SITE}/p/${p.id}" style="text-decoration:none;color:#e5e7eb">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${img ? `<td width="96" style="padding-right:12px"><img src="${esc(img)}" width="96" height="96" style="display:block;border-radius:10px;object-fit:cover" alt=""></td>` : ""}
            <td style="font-family:Arial,sans-serif">
              <div style="font-size:12px;color:#22d3ee;font-weight:bold">#${i + 1} · ${p.isNews ? esc(p.guest_author_id || "News") : "Community"}</div>
              <div style="font-size:15px;font-weight:bold;color:#ffffff;margin:4px 0">${esc(p.title || "Untitled")}</div>
              <div style="font-size:12px;color:#9ca3af">⚡ ${p.hits || 0} hits · 💬 ${p.comment_count || 0}</div>
            </td>
          </tr></table>
        </a>
      </td></tr>`;
    })
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#0b0f17">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" style="max-width:560px;background:#151c28;border-radius:16px;padding:24px" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:Arial,sans-serif">
        <div style="font-size:24px;font-weight:900"><span style="color:#22d3ee">PIX</span><span style="color:#f97316">SUP</span></div>
        <div style="font-size:18px;font-weight:bold;color:#ffffff;margin-top:12px">☀️ Your Morning Pulse</div>
        <div style="font-size:13px;color:#9ca3af;margin:4px 0 12px">What the world kept alive in the last 24 hours.</div>
      </td></tr>
      ${rows}
      ${
        challenge
          ? `<tr><td style="padding-top:18px;font-family:Arial,sans-serif">
        <div style="background:#1e293b;border-radius:12px;padding:14px">
          <div style="font-size:12px;color:#f97316;font-weight:bold">📸 TODAY'S CHALLENGE</div>
          <div style="font-size:15px;color:#ffffff;font-weight:bold;margin:4px 0">${esc(challenge.prompt)}</div>
          <div style="font-size:13px;color:#22d3ee">${esc(challenge.tag)}</div>
        </div></td></tr>`
          : ""
      }
      <tr><td align="center" style="padding-top:20px">
        <a href="${SITE}" style="display:inline-block;background:#22d3ee;color:#000000;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:12px 24px;border-radius:999px;text-decoration:none">Open Pixsup</a>
      </td></tr>
      <tr><td align="center" style="padding-top:20px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280">
        You get this because you turned on Morning Pulse in Settings.
        <a href="${esc(unsubscribeUrl)}" style="color:#9ca3af">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async () => {
  try {
    if (!RESEND_API_KEY) return json({ sent: 0, reason: "RESEND_API_KEY not set" });

    // Once per UTC day
    const today = new Date().toISOString().slice(0, 10);
    const { data: last } = await admin.from("app_settings").select("value").eq("key", "morning_pulse_last_sent").maybeSingle();
    if (last?.value === today) return json({ sent: 0, reason: "already sent today" });

    const { data: subscribers, error: subError } = await admin
      .from("profiles")
      .select("id, unsubscribe_token")
      .eq("morning_pulse", true)
      .eq("banned", false);
    if (subError) throw subError;
    if (!subscribers?.length) return json({ sent: 0, reason: "no subscribers" });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: postError } = await admin
      .from("posts")
      .select('id, title, thumbnail_url, media_url, media_type, hits, reactions, comment_count, "isNews", guest_author_id')
      .gte("created_date", since)
      .is("hidden_at", null)
      .limit(1000);
    if (postError) throw postError;
    const top = (recent as Post[]).filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a)).slice(0, 5);
    if (!top.length) return json({ sent: 0, reason: "nothing was kept alive yesterday" });

    const { data: challenge } = await admin.rpc("todays_challenge");

    // Emails live in auth.users; look up each subscriber
    const messages = [];
    for (const s of subscribers) {
      const { data } = await admin.auth.admin.getUserById(s.id);
      const email = data?.user?.email;
      if (!email) continue;
      const unsubscribeUrl = `${SITE}/unsubscribe?t=${s.unsubscribe_token}`;
      messages.push({
        from: FROM,
        to: [email],
        subject: `☀️ Morning Pulse: ${top[0].title || "what the world kept alive"}`,
        html: emailHtml(top, challenge?.tag ? challenge : null, unsubscribeUrl),
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      });
    }

    // Claim today right before sending, so a repeat call can't send twice
    if (!messages.length) return json({ sent: 0, reason: "no subscriber emails" });
    await admin.from("app_settings").upsert({ key: "morning_pulse_last_sent", value: today });

    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error("Resend batch failed", res.status, await res.text());
        continue;
      }
      sent += batch.length;
    }
    return json({ sent, subscribers: subscribers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
