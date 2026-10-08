import { corsHeaders, json } from "../_shared/cors.ts";

// Ported as-is from base44/functions/analyzePostMedia: still a stub that marks
// every image safe. Real moderation would call a vision model here, with its
// API key stored as a function secret (`supabase secrets set ...`), never in VITE_ vars.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    if (!fileUrl) {
      return json({ error: "file_url is required" }, 400);
    }

    return json({
      safe: true,
      reason: "Local dev bypass",
      category: "All",
      hashtags: ["#local", "#test", "#pixsup"],
      title: "Uploaded Image",
      emojis: ["📸", "✨"],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
