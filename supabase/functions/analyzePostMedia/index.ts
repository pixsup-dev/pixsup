import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, callerOf, SUPABASE_URL } from "../_shared/supabase.ts";

// Moderates an uploaded image and suggests a title, category, hashtags and
// emojis for it. The verdict is recorded in media_approvals; the posts table
// only accepts an image whose file was approved here for the same user.
//
// Secrets (set with `supabase secrets set`, never in VITE_ vars):
//   OPENAI_API_KEY   required
//   OPENAI_MODEL     optional vision model override (default below)

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

const CATEGORIES = ["Nature", "Urban", "Art", "Food", "Travel", "Sports", "Gaming", "AI"];

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "category", "hashtags", "emojis"],
  properties: {
    title: { type: "string", description: "Catchy title, max 60 characters, no hashtags" },
    category: { type: "string", enum: CATEGORIES },
    hashtags: {
      type: "array",
      items: { type: "string" },
      description: "3-5 single-word hashtags without the # sign",
    },
    emojis: { type: "array", items: { type: "string" }, description: "2-3 fitting emojis" },
  },
};

async function openai(path: string, body: unknown) {
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${path} → ${res.status}: ${data?.error?.message || "request failed"}`);
  return data;
}

// Free endpoint; omni-moderation understands images (sexual, violence, self-harm…)
async function moderate(imageUrl: string) {
  const data = await openai("moderations", {
    model: "omni-moderation-latest",
    input: [{ type: "image_url", image_url: { url: imageUrl } }],
  });
  const result = data.results?.[0];
  if (!result) throw new Error("OpenAI moderation returned no result");
  const flagged = Object.entries(result.categories || {})
    .filter(([, hit]) => hit)
    .map(([name]) => name);
  return { flagged: Boolean(result.flagged), categories: flagged };
}

async function describe(imageUrl: string) {
  const data = await openai("chat/completions", {
    model: OPENAI_MODEL,
    max_completion_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You label photos for Pixsup, a fast-moving social photo grid. " +
          "Return a short catchy title, the single best category, 3-5 hashtags and 2-3 emojis.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Label this image." },
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "post_analysis", strict: true, schema: ANALYSIS_SCHEMA },
    },
  });
  return JSON.parse(data.choices[0].message.content);
}

function cleanHashtags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) {
    const body = String(t).replace(/[^a-z0-9]/gi, "");
    if (body.length >= 2) out.add(`#${body.charAt(0).toUpperCase()}${body.slice(1)}`);
  }
  return [...out].slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // AI not configured yet: let the upload continue unlabelled. The database
    // only demands an approval once app_settings.ai_moderation_required is on.
    if (!OPENAI_API_KEY) {
      return json({ safe: true, reason: "AI moderation not configured", title: null, category: null, hashtags: [], emojis: [] });
    }

    const user = await callerOf(req);
    if (!user) return json({ error: "Sign in to upload" }, 401);

    const body = await req.json().catch(() => ({}));
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    if (!fileUrl) return json({ error: "file_url is required" }, 400);

    // Only the caller's own uploads — this endpoint must not analyze arbitrary URLs on our bill
    const ownPrefix = `${SUPABASE_URL}/storage/v1/object/public/media/${user.id}/`;
    if (!fileUrl.startsWith(ownPrefix)) return json({ error: "file_url must be your own upload" }, 403);

    const [moderation, labels] = await Promise.allSettled([moderate(fileUrl), describe(fileUrl)]);

    // Fail closed: if moderation itself is unavailable, nothing gets approved
    if (moderation.status === "rejected") {
      console.error(moderation.reason);
      return json({ error: "Image check is unavailable — please try again shortly." }, 503);
    }

    const { flagged, categories } = moderation.value;
    const reason = flagged ? `Flagged: ${categories.join(", ") || "unsafe content"}` : "ok";

    const { error: saveError } = await admin
      .from("media_approvals")
      .upsert({ file_url: fileUrl, created_by_id: user.id, approved: !flagged, reason });
    if (saveError) throw saveError;

    if (flagged) {
      // Remove the rejected file so it can't be linked anywhere
      const path = fileUrl.slice(`${SUPABASE_URL}/storage/v1/object/public/media/`.length);
      await admin.storage.from("media").remove([decodeURIComponent(path)]);
      return json({ safe: false, reason });
    }

    // Labels are a nice-to-have: an approved image still posts if labelling failed
    if (labels.status === "rejected") console.error(labels.reason);
    const l = labels.status === "fulfilled" ? labels.value : {};
    return json({
      safe: true,
      reason,
      title: typeof l.title === "string" ? l.title.slice(0, 80) : null,
      category: CATEGORIES.includes(l.category) ? l.category : null,
      hashtags: cleanHashtags(l.hashtags),
      emojis: Array.isArray(l.emojis) ? l.emojis.slice(0, 3).map(String) : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
