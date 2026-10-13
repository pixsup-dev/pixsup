// Google Gemini helpers: the image check used by analyzePostMedia (checks an
// upload against the community rules and labels it), the comment/chat text
// check used by postText, and the generic call used by explainNews.

export const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
// Tried in order until one answers. On the free tier Google's newest models
// (what the "latest" aliases point to) are often overloaded (503) or hang, so
// steadier models go first and the aliases are the last resort. A retired
// model (404) or any other failure is skipped too, so a retirement never breaks uploads.
// GEMINI_MODEL (a function secret) puts a model of your choice first.
const GEMINI_MODELS = [
  ...(Deno.env.get("GEMINI_MODEL") ? [Deno.env.get("GEMINI_MODEL")!] : []),
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];
// Per model; a hung model moves on to the next instead of eating the whole wait
const MODEL_TIMEOUT_MS = 25000;

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

// Asks the models in order, starting the next one when the current one fails
// or hasn't answered within HEDGE_MS; the first answer wins and the rest are
// cancelled. So a busy model costs a few seconds, not a whole timeout.
const HEDGE_MS = 4000;
// deno-lint-ignore no-explicit-any
function firstAnswer(request: string): Promise<any> {
  const stop = new AbortController();
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let lastError: unknown = new Error("No Gemini model available");
    let timer: number | undefined;

    const launch = () => {
      clearTimeout(timer);
      if (done || next >= GEMINI_MODELS.length) return;
      const model = GEMINI_MODELS[next++];
      running++;
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": GEMINI_API_KEY!, "Content-Type": "application/json" },
        body: request,
        signal: AbortSignal.any([stop.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)]),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`Gemini ${model} → ${res.status}: ${data?.error?.message || "request failed"}`);
          if (done) return;
          done = true;
          clearTimeout(timer);
          stop.abort();
          resolve(data);
        })
        .catch((e) => {
          if (done) return;
          lastError = e;
          running--;
          if (next < GEMINI_MODELS.length) launch(); // failed: try the next one now
          else if (running === 0) reject(lastError);
        });
      // still waiting: bring in the next model as well
      timer = setTimeout(launch, HEDGE_MS);
    };
    launch();
  });
}

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

  const data = await firstAnswer(request);

  if (data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === "SAFETY") {
    return { blocked: true };
  }
  const textOut = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!textOut) throw new Error("Gemini returned nothing");
  return JSON.parse(textOut);
}

// challengePrompt: when the upload is a Daily Challenge entry, the same call
// also says whether the photo fits today's prompt (fits_challenge)
export async function geminiCheck(imageUrl: string, challengePrompt?: string) {
  const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
  if (!image.ok) throw new Error(`Couldn't read the upload (${image.status})`);
  const mimeType = image.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  const schema = challengePrompt
    ? {
        ...GEMINI_SCHEMA,
        required: [...GEMINI_SCHEMA.required, "fits_challenge"],
        properties: { ...GEMINI_SCHEMA.properties, fits_challenge: { type: "BOOLEAN" } },
      }
    : GEMINI_SCHEMA;
  const prompt = challengePrompt
    ? GEMINI_PROMPT +
      " This photo was entered in today's photo challenge: \"" + challengePrompt.slice(0, 200) + "\". " +
      "Set fits_challenge=true if the photo reasonably matches it (be generous with creative or loose " +
      "interpretations); false if it's clearly unrelated, a blank or meaningless image, or text/ads/spam."
    : GEMINI_PROMPT;

  const out = await callGemini(
    [{ text: prompt }, { inline_data: { mime_type: mimeType, data: btoa(binary) } }],
    schema
  );
  // Google's own safety filters refusing the image is a rejection too
  if (out.blocked) return { flagged: true, categories: ["blocked by safety filter"], labels: {}, fitsChallenge: false };
  if (typeof out.safe !== "boolean") throw new Error("Gemini returned no verdict");
  return {
    flagged: !out.safe,
    categories: Array.isArray(out.violations) ? out.violations.map(String).slice(0, 5) : [],
    labels: out,
    fitsChallenge: out.fits_challenge === true,
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
