// Renders the commercial: every frame from composition.html, the sound from
// audio.mjs, then the finished MP4s and the thumbnail.
//
//   node render.mjs                 everything
//   node render.mjs --stills 45,90  just these frames, as PNGs in .cache/stills
//   node render.mjs --encode        re-encode without redrawing the frames
//
// Output goes to Desktop/Pixsup videos/Promo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import ffmpeg from "ffmpeg-static";
import "./timeline.js";
import { makeAudio } from "./audio.mjs";

const T = globalThis.PIXSUP_TIMELINE;
const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, ".cache");
const FRAMES = path.join(CACHE, "frames");
const OUT = path.join(os.homedir(), "Desktop", "Pixsup videos", "Promo");
const TOTAL = T.duration * T.fps;
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1] ?? "";
};

async function openPage() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--hide-scrollbars", "--allow-file-access-from-files", "--force-color-profile=srgb"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
  await page.goto(pathToFileURL(path.join(here, "composition.html")).href, { waitUntil: "networkidle0" });
  await page.evaluate(() => window.READY);
  return { browser, page };
}

async function renderFrames() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const { browser, page } = await openPage();
  const started = Date.now();
  for (let f = 0; f < TOTAL; f++) {
    await page.evaluate((n) => window.seek(n), f);
    await page.screenshot({ path: path.join(FRAMES, `f${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 98 });
    if (f % 30 === 0) console.log(`  frame ${f}/${TOTAL} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  await page.evaluate(() => window.thumbnail());
  await page.screenshot({ path: path.join(OUT, "pixsup_thumbnail.png"), type: "png" });
  await browser.close();
}

async function stills(list) {
  const dir = path.join(CACHE, "stills");
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage();
  for (const f of list) {
    await page.evaluate((n) => window.seek(n), f);
    await page.screenshot({ path: path.join(dir, `s${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 85 });
  }
  await page.evaluate(() => window.thumbnail());
  await page.screenshot({ path: path.join(dir, "thumb.jpg"), type: "jpeg", quality: 85 });
  await browser.close();
}

const COLOR = "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuv420p";
const TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

function encode(name, wav, videoArgs, audioFilter) {
  const out = path.join(OUT, name);
  execFileSync(ffmpeg, [
    "-y", "-loglevel", "error",
    "-framerate", String(T.fps), "-i", path.join(FRAMES, "f%04d.jpg"),
    "-i", wav,
    "-map", "0:v", "-map", "1:a",
    "-vf", COLOR, ...TAGS,
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.2", "-r", String(T.fps), "-g", String(T.fps), "-bf", "2", ...videoArgs,
    ...(audioFilter ? ["-af", audioFilter] : []),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
    "-t", String(T.duration), "-movflags", "+faststart", out,
  ]);
  console.log(`  ✓ ${name} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
}

fs.mkdirSync(OUT, { recursive: true });
if (arg("--stills") !== null) {
  await stills(arg("--stills").split(",").map(Number));
  process.exit(0);
}
if (!process.argv.includes("--encode")) {
  console.log("Drawing frames…");
  await renderFrames();
}
console.log("Making the sound…");
const { full, sfx } = makeAudio(CACHE);
console.log("Encoding…");
const MASTER = ["-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p"];
// -14 LUFS is where the platforms aim; the limit keeps peaks from crackling
const LOUDNESS = "alimiter=limit=0.7:attack=2:release=40:level=false,loudnorm=I=-14:TP=-2:LRA=11";
// Master and no-music version
encode("pixsup_promo_15sec.mp4", full, MASTER, LOUDNESS);
encode("pixsup_promo_15sec_no_music.mp4", sfx, MASTER, LOUDNESS);
// For TikTok and Shorts: a steady bitrate they recompress cleanly
encode(
  "pixsup_promo_15sec_tiktok_shorts.mp4",
  full,
  ["-preset", "slow", "-b:v", "12M", "-maxrate", "15M", "-bufsize", "24M", "-pix_fmt", "yuv420p"],
  LOUDNESS
);
console.log(`\nDone: ${OUT}`);
