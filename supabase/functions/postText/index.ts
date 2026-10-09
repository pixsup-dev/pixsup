import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, callerOf, SUPABASE_URL } from "../_shared/supabase.ts";
import { GEMINI_API_KEY, geminiTextCheck } from "../_shared/gemini.ts";

// Posts a comment or live-chat message after an AI check. Rejected text is
// never saved. The approved text goes through the usual RPC as the caller,
// with a secret header the database checks once text_moderation_required is
// on, so the AI check can't be skipped by calling the RPC directly.
//
// Body: { kind: "comment" | "chat", post_id, text }

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RPC = { comment: "add_comment", chat: "send_chat" } as const;
const MAX = { comment: 1000, chat: 200 } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const user = await callerOf(req);
    if (!user) return json({ error: "Sign in first" }, 401);

    const body = await req.json().catch(() => ({}));
    const kind = body.kind as keyof typeof RPC;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!RPC[kind] || typeof body.post_id !== "string") return json({ error: "Invalid request" }, 400);
    if (!text) return json({ error: "Write something first" }, 400);
    if (text.length > MAX[kind]) return json({ error: `Keep it under ${MAX[kind]} characters` }, 400);

    if (GEMINI_API_KEY) {
      try {
        const verdict = await geminiTextCheck(text);
        if (!verdict.allowed) {
          return json(
            { error: "That message breaks the community guidelines, so it wasn't posted.", reason: verdict.reason },
            422
          );
        }
      } catch (checkError) {
        // The AI being down shouldn't silence everyone; reports and blocks still apply
        console.error("text check unavailable, allowing:", checkError);
      }
    }

    const { data: secretRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "text_check_secret")
      .maybeSingle();

    // Act as the caller so auth.uid(), bans and rate limits apply as usual
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: req.headers.get("Authorization")!,
          ...(secretRow?.value ? { "x-pixsup-text-check": String(secretRow.value) } : {}),
        },
      },
    });
    const { data, error } = await asUser.rpc(RPC[kind], { p_post_id: body.post_id, p_text: text });
    if (error) return json({ error: error.message }, error.code === "42501" ? 403 : 400);
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
