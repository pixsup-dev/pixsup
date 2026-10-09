import { admin } from "./supabase.ts";
import { callGemini, GEMINI_API_KEY } from "./gemini.ts";

// Keeps the Daily Challenge planned a week ahead with fresh AI-written prompts.
// Only fills empty days, so challenges an admin scheduled (or sponsored) are
// never touched. If the AI is unavailable, todays_challenge() falls back to
// the built-in rotation, so there's always a challenge.

const DAYS_AHEAD = 7;
const TAG = /^#[A-Za-z0-9]{3,24}$/;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    required: ["day", "prompt", "tag"],
    properties: {
      day: { type: "STRING" },
      prompt: { type: "STRING" },
      tag: { type: "STRING" },
    },
  },
};

// Challenge days run on US Eastern time (see challenge_today() in the database)
const isoDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

export async function ensureChallenges(): Promise<number> {
  if (!GEMINI_API_KEY) return 0;

  const today = new Date();
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => isoDay(new Date(today.getTime() + i * 86400000)));
  const { data: planned, error } = await admin.from("daily_challenges").select("day").in("day", days);
  if (error) throw error;
  const missing = days.filter((d) => !planned.some((p) => p.day === d));
  if (!missing.length) return 0;

  // Recent challenges, so the AI doesn't repeat itself
  const { data: recent } = await admin
    .from("daily_challenges")
    .select("prompt, tag")
    .order("day", { ascending: false })
    .limit(60);
  const avoid = (recent || []).map((c) => `${c.tag} (${c.prompt})`).join("; ");

  const out = await callGemini(
    [
      {
        text:
          "You write the Daily Challenge for Pixsup, a social photo app where posts disappear unless people " +
          "keep them alive. Each day everyone gets one photo prompt. Write one challenge for each of these " +
          `dates: ${missing.join(", ")}.\n\n` +
          "Rules: a fun, specific prompt anyone in the world could shoot with a phone that same day (max 80 " +
          "characters, no quotes); safe for ages 13+; no brands, politics, religion or anything risky or " +
          "dangerous; vary the themes (food, places, people's things, nature, colours, moods, small details, " +
          "routines, humour). Match the season and any widely celebrated day on that date (e.g. Halloween, " +
          "New Year, Earth Day). tag: # plus 3-24 letters or numbers in CamelCase, no spaces, unique.\n" +
          `Don't reuse these recent ones: ${avoid || "none yet"}.\n` +
          "Return one item per date with day exactly as given (YYYY-MM-DD).",
      },
    ],
    SCHEMA,
    2048
  );
  if (!Array.isArray(out)) return 0;

  const used = new Set((recent || []).map((c) => c.tag.toLowerCase()));
  const rows = [];
  for (const c of out) {
    const prompt = String(c?.prompt || "").replace(/["“”]/g, "").trim();
    const tag = String(c?.tag || "").trim();
    if (!missing.includes(c?.day) || prompt.length < 8 || prompt.length > 120) continue;
    if (!TAG.test(tag) || used.has(tag.toLowerCase())) continue;
    used.add(tag.toLowerCase());
    rows.push({ day: c.day, prompt, tag });
  }
  if (!rows.length) return 0;

  // ignoreDuplicates: never overwrite a day someone scheduled in the meantime
  const { error: insertError } = await admin
    .from("daily_challenges")
    .upsert(rows, { onConflict: "day", ignoreDuplicates: true });
  if (insertError) throw insertError;
  return rows.length;
}
