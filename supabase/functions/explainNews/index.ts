import { corsHeaders, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";
import { callGemini, GEMINI_API_KEY } from "../_shared/gemini.ts";

// "Explain it": a 3-sentence plain-language explainer for a news post,
// written from the article itself where the publisher allows it, otherwise
// from the headline and summary. Cached on the post, so each story costs one
// AI call however many people tap the button.
//
// Body: { post_id }

const SCHEMA = {
  type: "OBJECT",
  required: ["explainer"],
  properties: { explainer: { type: "STRING" } },
};

const PROMPT =
  "Explain this news story to a curious 16-year-old in exactly 3 short sentences: what happened, " +
  "why it matters, and what happens next (only if the text says). Use ONLY the information below; " +
  "never add facts, numbers or names that aren't in it. Neutral tone, no opinions. If the text is too " +
  "thin to explain, say so in one sentence.\n\n";

// Readable paragraph text from an article page, capped for the prompt
async function articleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PixsupBot/1.0; +https://www.pixsup.com)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return "";
    const html = await res.text();
    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) =>
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter((p) => p.length > 60);
    return paragraphs.join("\n").slice(0, 6000);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { post_id } = await req.json().catch(() => ({}));
    if (typeof post_id !== "string") return json({ error: "post_id is required" }, 400);

    const base = 'id, title, summary, source_url, guest_author_id, "isNews"';
    let { data: post, error } = await admin.from("posts").select(`${base}, explainer`).eq("id", post_id).maybeSingle();
    if (error?.code === "42703") {
      // explainer column not added yet: explain without caching
      ({ data: post, error } = await admin.from("posts").select(base).eq("id", post_id).maybeSingle());
    }
    if (error) throw error;
    if (!post || !post.isNews) return json({ error: "Only news stories can be explained" }, 404);
    if (post.explainer) return json({ explainer: post.explainer, cached: true });
    if (!GEMINI_API_KEY) return json({ error: "Explanations aren't available yet" }, 503);

    const article = post.source_url ? await articleText(post.source_url) : "";
    const out = await callGemini(
      [
        {
          text:
            PROMPT +
            `Headline: ${post.title}\nSource: ${post.guest_author_id || "unknown"}\n` +
            (post.summary ? `Summary: ${post.summary}\n` : "") +
            (article ? `Article:\n${article}` : ""),
        },
      ],
      SCHEMA,
      1024
    );
    if (out.blocked || typeof out.explainer !== "string" || !out.explainer.trim()) {
      return json({ error: "Couldn't explain this one. Try reading the full story." }, 422);
    }
    const explainer = out.explainer.trim().slice(0, 700);
    await admin.from("posts").update({ explainer }).eq("id", post.id);
    return json({ explainer, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
