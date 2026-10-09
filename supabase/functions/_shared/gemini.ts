// Google Gemini image check shared by analyzePostMedia: one call checks an
// image against the community rules and labels it.

export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// "latest" aliases track Google's current Flash models, so retirements don't
// break uploads. When the first is overloaded or rate-limited, try the next.
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest",
  "gemini-flash-lite-latest",
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

export async function geminiCheck(imageUrl: string) {
  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!image.ok) throw new Error(`Couldn't read the upload (${image.status})`);
  const mimeType = image.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  const request = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeType, data: btoa(binary) } }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
      maxOutputTokens: 2048,
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
        signal: AbortSignal.timeout(25000),
      }
    );
    data = await res.json().catch(() => ({}));
    if (res.ok) break;
    if (!RETRYABLE.has(res.status) || i === GEMINI_MODELS.length - 1) {
      throw new Error(`Gemini ${model} → ${res.status}: ${data?.error?.message || "request failed"}`);
    }
  }

  // Google's own safety filters refusing the image is a rejection too
  const blocked = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY";
  if (blocked) return { flagged: true, categories: ["blocked by safety filter"], labels: {} };

  const textOut = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!textOut) throw new Error("Gemini returned no verdict");
  const out = JSON.parse(textOut);
  if (typeof out.safe !== "boolean") throw new Error("Gemini returned no verdict");
  return {
    flagged: !out.safe,
    categories: Array.isArray(out.violations) ? out.violations.map(String).slice(0, 5) : [],
    labels: out,
  };
}

