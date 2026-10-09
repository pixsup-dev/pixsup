// Google Gemini helpers: the image check used by analyzePostMedia (checks an
// upload against the community rules and labels it), the comment/chat text
// check used by postText, and the generic call used by explainNews.

export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// "latest" aliases track Google's current Flash models, so retirements don't
// break uploads. Flash-Lite answers in a few seconds; full Flash is the backup
// when Lite is overloaded, rate-limited or slow.
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest",
  "gemini-flash-latest",
];
const RETRYABLE = new Set([429, 500, 503]);

export const CATEGORIES = [
  "Nature", "Urban", "Art", "Food", "Travel", "Sports", "Gaming", "AI",
  "Fashion", "Beauty", "Pets", "Funny", "Cars", "Music", "Tech", "People",
];

const GEMINI_SCHEMA = {
  type: "OBJECT",
  required: ["safe", "violations", "title", "category", "hashtags", "emojis"],
  properties: {
    safe: { type: "BOOLEAN" },
    violations: { type: "ARRAY", items: { type: "STRING" } },
    title: { type: "STRING" },
    category: { type: "STRING", enum: CATEGORIES },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
    emojis: { type: "ARRAY", items: { type: "STRING" } },
  },
};

const GEMINI_PROMPT =
  "You moderate and label photos for Pixsup, a public social photo grid open to everyone 13+. " +
  "Set safe=false if the image contains any of: nudity or sexual content, graphic violence or gore, " +
  "self-harm, hate symbols or hateful content, weapons used to threaten, illegal drugs, " +
  "or content sexualising minors. List each problem in violations (empty when safe). " +
  "Ordinary photos (people, pets, food, places, memes, art, news events shown without gore) are safe. " +
  "Also return a catchy title (max 60 characters, no hashtags), the single best category, " +
  "3-5 single-word hashtags without the # sign, and 2-3 fitting emojis.";

// One Gemini call with model fallback. Returns the raw response, or
// { blocked: true } when Google's own safety filters refused the input.
// deno-lint-ignore no-explicit-any
export async function callGemini(parts: unknown[], schema: unknown, maxOutputTokens = 2048): Promise<any> {
  const request = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens,
      // These calls don't need long reasoning, and thinking is slow
      thinkingConfig: { thinkingLevel: "low" },
    },
  });

  // deno-lint-ignore no-explicit-any
  let data: any = {};
  for (const [i, model] of GEMINI_MODELS.entries()) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY!, "Content-Type": "application/json" },
        body: request,
        signal: AbortSignal.timeout(15000),
      }
    ).catch((e) => {
      // a slow model counts as unavailable: move on to the next one
      if (i === GEMINI_MODELS.length - 1) throw e;
      return null;
    });
    if (!res) continue;
    data = await res.json().catch(() => ({}));
    if (res.ok) break;
    if (!RETRYABLE.has(res.status) || i === GEMINI_MODELS.length - 1) {
      throw new Error(`Gemini ${model} → ${res.status}: ${data?.error?.message || "request failed"}`);
    }
  }

  if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
    return { blocked: true };
  }
  const textOut = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!textOut) throw new Error("Gemini returned nothing");
  return JSON.parse(textOut);
}

export async function geminiCheck(imageUrl: string) {
  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!image.ok) throw new Error(`Couldn't read the upload (${image.status})`);
  const mimeType = image.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  const out = await callGemini(
    [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeType, data: btoa(binary) } }],
    GEMINI_SCHEMA
  );
  // Google's own safety filters refusing the image is a rejection too
  if (out.blocked) return { flagged: true, categories: ["blocked by safety filter"], labels: {} };
  if (typeof out.safe !== "boolean") throw new Error("Gemini returned no verdict");
  return {
    flagged: !out.safe,
    categories: Array.isArray(out.violations) ? out.violations.map(String).slice(0, 5) : [],
    labels: out,
  };
}

// ---------------------------------------------------------------------------
// Text: comments and live chat
// ---------------------------------------------------------------------------

const TEXT_SCHEMA = {
  type: "OBJECT",
  required: ["allowed", "reason"],
  properties: { allowed: { type: "BOOLEAN" }, reason: { type: "STRING" } },
};

const TEXT_PROMPT =
  "You moderate comments and chat messages on Pixsup, a public social app open to everyone 13+. " +
  "Set allowed=false if the message contains: harassment, insults or bullying aimed at a person; hate " +
  "speech or slurs; sexual content; threats or encouraging violence or self-harm; spam, scams or " +
  "promotional links; or someone's private details (phone number, home address). " +
  "Casual swearing, jokes, strong opinions and criticism of public figures or news are allowed. " +
  "reason: a few words explaining a rejection, empty when allowed. The message:\n\n";

export async function geminiTextCheck(text: string) {
  const out = await callGemini([{ text: TEXT_PROMPT + text }], TEXT_SCHEMA, 512);
  if (out.blocked) return { allowed: false, reason: "blocked by safety filter" };
  if (typeof out.allowed !== "boolean") throw new Error("Gemini returned no verdict");
  return { allowed: out.allowed, reason: String(out.reason || "") };
}
