// Makes today's Pixsup videos from real posts, ready for TikTok / Reels /
// Shorts (1080×1920 MP4, no sound: add a trending sound in the app).
//
//   node make-video.mjs            both videos
//   node make-video.mjs survive    only "Will it survive?"
//   node make-video.mjs challenge  only "Today's challenge"
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

const which = process.argv[2] || "all";
fs.mkdirSync(OUT_DIR, { recursive: true });
if (!CHROME) {
  console.error("Couldn't find Chrome or Edge on this computer.");
  process.exit(1);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] });
const made = [];
// Each video gets a caption file next to it, ready to paste
const caption = (videoFile, text) => fs.writeFileSync(videoFile.replace(/\.mp4$/, " - caption.txt"), text + "\n");

try {
  if (which === "all" || which === "survive") {
    console.log("⏳ Finding a live photo for \"Will it survive?\"…");
    const data = await pickSurvivor();
    if (!data) console.log("   No live photo with 30+ minutes left right now. Skipped.");
    else {
      const file = path.join(OUT_DIR, `${today} - Will it survive.mp4`);
      await record(browser, surviveVideo(data), file);
      made.push(file);
      caption(
        file,
        `This photo dies when its timer hits zero ⏳ Will anyone keep it alive? Go save it 👉 pixsup.com\n` +
          `#pixsup #savethepost #newapp #photography #willitsurvive`
      );
      console.log(`   ✓ "${data.post.title}"${data.username ? ` by @${data.username}` : ""}`);
    }
  }
  if (which === "all" || which === "challenge") {
    console.log("📸 Making \"Today's challenge\"…");
    const data = await pickChallenge();
    if (!data) console.log("   No challenge today. Skipped.");
    else {
      const file = path.join(OUT_DIR, `${today} - Todays challenge.mp4`);
      await record(browser, challengeVideo(data), file);
      made.push(file);
      caption(
        file,
        `Today's photo challenge: ${data.challenge.prompt} 📸 ${data.entries.length ? "The crowd decides which one lives." : "Nobody has entered yet. Be the first!"} pixsup.com\n` +
          `#pixsup ${data.challenge.tag} #photochallenge #newapp`
      );
      console.log(`   ✓ ${data.challenge.tag}: ${data.entries.length} entr${data.entries.length === 1 ? "y" : "ies"}`);
    }
  }
} finally {
  await browser.close();
}

console.log(made.length ? `\nDone! ${made.length} video${made.length > 1 ? "s" : ""} in ${OUT_DIR}` : "\nNo videos made today.");
