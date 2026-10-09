import { json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

// Emails support@ about errors people hit in the app that haven't been
// reported yet. Runs hourly (pg_cron) and sends at most once every 55 minutes
// however often it's called. Needs the RESEND_API_KEY secret.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO = "support@pixsup.com";
const FROM = "Pixsup Alerts <noreply@pixsup.com>";
const GAP_MS = 55 * 60 * 1000;

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

Deno.serve(async () => {
  try {
    if (!RESEND_API_KEY) return json({ sent: false, reason: "RESEND_API_KEY not set" });

    const { data: last } = await admin.from("app_settings").select("value").eq("key", "error_alert_last_sent").maybeSingle();
    if (last?.value && Date.now() - Date.parse(String(last.value)) < GAP_MS) {
      return json({ sent: false, reason: "sent recently" });
    }

    const { data: fresh, error } = await admin
      .from("client_errors")
      .select("id, message, url, user_agent, count, first_seen")
      .is("emailed_at", null)
      .order("count", { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!fresh?.length) return json({ sent: false, reason: "no new errors" });

    const now = new Date().toISOString();
    await admin.from("app_settings").upsert({ key: "error_alert_last_sent", value: now });

    const rows = fresh
      .slice(0, 10)
      .map(
        (e) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px">
          <b>${esc(e.message)}</b> <span style="color:#dc2626">×${e.count}</span><br>
          <span style="color:#6b7280;font-size:11px">${esc(e.url || "")} · ${esc((e.user_agent || "").slice(0, 90))}</span>
        </td></tr>`
      )
      .join("");
    const html = `<div style="font-family:Arial,sans-serif">
      <h2 style="margin:0 0 4px">⚠️ ${fresh.length} new error${fresh.length === 1 ? "" : "s"} on Pixsup</h2>
      <p style="color:#6b7280;margin:0 0 12px">People ran into these in the last hour. Full details are on the Admin page.</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <p><a href="https://www.pixsup.com/admin">Open the Admin page</a></p></div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: `⚠️ Pixsup: ${fresh.length} new error${fresh.length === 1 ? "" : "s"} — ${fresh[0].message.slice(0, 60)}`,
        html,
      }),
    });
    if (!res.ok) throw new Error(`Resend → ${res.status}: ${await res.text()}`);

    await admin.from("client_errors").update({ emailed_at: now }).in("id", fresh.map((e) => e.id));
    return json({ sent: true, errors: fresh.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
