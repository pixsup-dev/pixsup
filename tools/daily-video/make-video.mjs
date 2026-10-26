// Makes today's Pixsup videos from real posts, ready for TikTok / Reels /
// Shorts (1080×1920 MP4, no sound: add a trending sound in the app).
//
//   node make-video.mjs             all of them
//   node make-video.mjs survive     only "Will it survive?"
//   (or: challenge, howto, versus, graveyard; several work too)
//
// Videos and a ready-to-paste caption land in Desktop/Pixsup videos/Daily.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import { surviveVideo, challengeVideo } from "./templates.mjs";
import { howtoVideo, versusVideo, graveyardVideo } from "./templates-more.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(os.homedir(), "Desktop", "Pixsup videos", "Daily");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

// The public website keys (the same ones the app ships with)
const env = fs.readFileSync(path.join(here, "..", "..", ".env"), "utf8");
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const URL_ = envVal("VITE_SUPABASE_URL");
const KEY = envVal("VITE_SUPABASE_ANON_KEY");
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = async (q) => (await fetch(`${URL_}/rest/v1/${q}`, { headers })).json();
const rpc = async (name, body = {}) =>
  (await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(body) })).json();

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // 2026-10-25

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// A live member photo with time left to save it (at least 30 minutes, so
// people who see the video later can still get there). The one with the
// least time left is the most dramatic. News is the fallback.
async function pickSurvivor() {
  const soon = new Date(Date.now() + 30 * 60e3).toISOString();
  const cols = "id,title,media_url,media_type,expires_at,created_by_id,city,isNews,guest_author_id,is_trending";
  const live = (q) => rest(`posts?select=${cols}&media_type=eq.image&expires_at=gt.${soon}&${q}&order=expires_at.asc&limit=20`);
  // Normal member posts first (a trending one is safe for hours), then
  // trending member posts, then news
  const members = (await live("isNews=eq.false")).filter((p) => p.media_url);
  let posts = members.filter((p) => !p.is_trending);
  if (!posts.length) posts = members;
  if (!posts.length) posts = (await live("isNews=eq.true")).filter((p) => p.media_url);
  const post = posts[0];
  if (!post) return null;
  let username = null;
  if (!post.isNews && post.created_by_id) {
    const rows = await rpc("get_usernames", { p_ids: [post.created_by_id] });
    username = rows?.[0]?.username || null;
  }
  return { post, username, remainingMs: new Date(post.expires_at).getTime() - Date.now() };
}

async function pickChallenge() {
  const challenge = await rpc("todays_challenge");
  if (!challenge?.prompt) return null;
  const tag = encodeURIComponent(`{"${challenge.tag}"}`);
  const now = new Date().toISOString();
  const entries = (
    await rest(`posts?select=id,media_url,created_date&hashtags=cs.${tag}&media_type=eq.image&expires_at=gt.${now}&order=created_date.desc&limit=4`)
  ).filter((p) => p.media_url);
  return { challenge, entries };
}

// Any live photo for the how-to (member photos first)
async function pickHowto() {
  const now = new Date().toISOString();
  const live = (q) => rest(`posts?select=media_url&media_type=eq.image&expires_at=gt.${now}&${q}&order=created_date.desc&limit=5`);
  const post = (await live("isNews=eq.false")).find((p) => p.media_url) || (await live("isNews=eq.true")).find((p) => p.media_url);
  if (!post) return null;
  return { post, rules: await rpc("game_rules") };
}

// A wall of live photos behind the comparison
async function pickVersus() {
  const now = new Date().toISOString();
  const members = await rest(`posts?select=media_url&media_type=eq.image&isNews=eq.false&expires_at=gt.${now}&order=created_date.desc&limit=8`);
  const news = await rest(`posts?select=media_url&media_type=eq.image&isNews=eq.true&expires_at=gt.${now}&order=created_date.desc&limit=8`);
  const photos = [...members, ...news].filter((p) => p.media_url).slice(0, 8);
  return photos.length >= 2 ? { photos } : null;
}

// Posts that died in the last 24 hours (member photos first, then news)
async function pickGraveyard() {
  const now = new Date().toISOString();
  const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
  const died = (q) =>
    rest(`posts?select=title,media_url,created_date,expires_at,hits&media_type=eq.image&expires_at=lt.${now}&expires_at=gt.${dayAgo}&${q}&order=expires_at.desc&limit=4`);
  let dead = (await died("isNews=eq.false")).filter((p) => p.media_url);
  if (dead.length < 2) dead = [...dead, ...(await died("isNews=eq.true")).filter((p) => p.media_url)].slice(0, 4);
  return dead.length ? { dead } : null;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

async function record(browser, html, outFile) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "pixsup-video-"));
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3 });
  // Load everything, but hold the timeline until the photos are ready
  await page.setContent(html.replace("<script>", "<script>window.__hold = true;</script><script>"), { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  });

  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(work, `f${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await page.evaluate(() => window.__start());
  await page.waitForFunction(() => window.__done === true, { timeout: 60000, polling: 200 });
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send("Page.stopScreencast");
  await page.close();

  // Frames arrive at an uneven rate; give each its real duration, then 30 fps
  const list = frames
    .map((f, i) => `file '${path.basename(f.file)}'\nduration ${Math.max((frames[i + 1]?.t ?? f.t + 0.5) - f.t, 0.001).toFixed(4)}`)
    .join("\n") + `\nfile '${path.basename(frames.at(-1).file)}'\n`;
  fs.writeFileSync(path.join(work, "list.txt"), list);
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(work, "list.txt"),
    "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0b0f17,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", outFile,
  ]);
  fs.rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------

// Each video: its name, how to get its data, its design and its caption
const VIDEOS = [
  {
    key: "survive",
    name: "Will it survive",
    pick: pickSurvivor,
    make: surviveVideo,
    skip: "No live photo with 30+ minutes left right now.",
    done: (d) => `"${d.post.title}"${d.username ? ` by @${d.username}` : ""}`,
    caption: () =>
      "This photo dies when its timer hits zero ⏳ Will anyone keep it alive? Go save it 👉 pixsup.com\n" +
      "#pixsup #savethepost #newapp #photography #willitsurvive",
  },
  {
    key: "challenge",
    name: "Todays challenge",
    pick: pickChallenge,
    make: challengeVideo,
    skip: "No challenge today.",
    done: (d) => `${d.challenge.tag}: ${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"}`,
    caption: (d) =>
      `Today's photo challenge: ${d.challenge.prompt} 📸 ${d.entries.length ? "The crowd decides which one lives." : "Nobody has entered yet. Be the first!"} pixsup.com\n` +
      `#pixsup ${d.challenge.tag} #photochallenge #newapp`,
  },
  {
    key: "howto",
    name: "How to save a post",
    pick: pickHowto,
    make: howtoVideo,
    skip: "No live photo to use.",
    done: () => "3 steps",
    caption: (d) =>
      `How to save a post on Pixsup ⚡ Find one that's dying, double-tap it, and it's back to ${d.rules.rescue_minutes} minutes with your name on it. pixsup.com\n` +
      "#pixsup #howto #newapp #savethepost",
  },
  {
    key: "versus",
    name: "Pixsup vs other apps",
    pick: pickVersus,
    make: versusVideo,
    skip: "Not enough live photos.",
    done: (d) => `${d.photos.length} photos behind it`,
    caption: () =>
      "No followers. No algorithm games. On Pixsup every post dies unless people care 💀⚡ pixsup.com\n" +
      "#pixsup #newapp #socialmedia #nofollowers",
  },
  {
    key: "graveyard",
    name: "Graveyard roll call",
    pick: pickGraveyard,
    make: graveyardVideo,
    skip: "Nothing died in the last 24 hours.",
    done: (d) => `${d.dead.length} posts`,
    caption: () =>
      "These posts died today 🪦 Gone forever. Don't let the good ones die 👉 pixsup.com\n" +
      "#pixsup #rip #newapp #graveyard",
  },
];

const wanted = process.argv.slice(2);
const chosen = wanted.length ? VIDEOS.filter((v) => wanted.includes(v.key)) : VIDEOS;
if (!chosen.length) {
  console.error(`Pick one of: ${VIDEOS.map((v) => v.key).join(", ")}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
if (!CHROME) {
  console.error("Couldn't find Chrome or Edge on this computer.");
  process.exit(1);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars"] });
const made = [];

try {
  for (const v of chosen) {
    console.log(`🎬 ${v.name}…`);
    const data = await v.pick();
    if (!data) {
      console.log(`   ${v.skip} Skipped.`);
      continue;
    }
    const file = path.join(OUT_DIR, `${today} - ${v.name}.mp4`);
    await record(browser, v.make(data), file);
    // A caption file next to each video, ready to paste
    fs.writeFileSync(file.replace(/\.mp4$/, " - caption.txt"), v.caption(data) + "\n");
    made.push(file);
    console.log(`   ✓ ${v.done(data)}`);
  }
} finally {
  await browser.close();
}

console.log(made.length ? `\nDone! ${made.length} video${made.length > 1 ? "s" : ""} in ${OUT_DIR}` : "\nNo videos made today.");
