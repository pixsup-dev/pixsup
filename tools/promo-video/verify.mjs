// Checks the finished videos: length, size, frame rate, audio, loudness, and
// that the sound of the tap lands on the green flash.
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import "./timeline.js";

const T = globalThis.PIXSUP_TIMELINE;
const OUT = path.join(os.homedir(), "Desktop", "Pixsup videos", "Promo");
const FILES = ["pixsup_promo_15sec.mp4", "pixsup_promo_15sec_no_music.mp4", "pixsup_promo_15sec_tiktok_shorts.mp4"];
const run = (...args) => spawnSync(ffmpeg, args, { encoding: "buffer", maxBuffer: 1 << 30 });
const text = (...args) => run(...args).stderr.toString();
const check = (ok, label) => console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);

// Average colour of one frame
function frameColor(file, frame) {
  const r = run("-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame}),scale=1:1`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-");
  return [...r.stdout.subarray(0, 3)];
}

// When the loudest click happens in a window of the sound (in seconds)
function onset(file, from, to) {
  const r = run("-v", "error", "-ss", String(from), "-t", String(to - from), "-i", file, "-map", "0:a", "-ac", "1", "-ar", "48000", "-f", "s16le", "-");
  const s = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 2));
  let at = -1;
  const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (let i = 0; i < s.length; i++) {
    if (Math.abs(s[i]) > peak * 0.5) {
      at = i;
      break;
    }
  }
  return from + at / 48000;
}

for (const name of FILES) {
  const file = path.join(OUT, name);
  console.log(`\n${name}`);
  const info = text("-hide_banner", "-i", file);
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const seconds = +dur[1] * 3600 + +dur[2] * 60 + +dur[3];
  const video = /Stream.*Video: (\w+).*?(\d{3,4})x(\d{3,4}).*?([\d.]+) fps/.exec(info);
  const audio = /Stream.*Audio: (\w+).*?(\d+) Hz, (\w+)/.exec(info);
  const count = +[...text("-hide_banner", "-i", file, "-map", "0:v", "-f", "null", "-").matchAll(/frame=\s*(\d+)/g)].pop()?.[1];
  check(Math.abs(seconds - T.duration) < 0.05, `length ${seconds}s (${count} frames)`);
  check(count === T.duration * T.fps, `exactly ${T.duration * T.fps} frames`);
  check(video?.[2] === "1080" && video?.[3] === "1920", `size ${video?.[2]}×${video?.[3]}`);
  check(video?.[1] === "h264" && +video?.[4] === T.fps, `${video?.[1]} at ${video?.[4]} fps`);
  check(audio?.[1] === "aac" && audio?.[3] === "stereo", `audio ${audio?.[1]} ${audio?.[2]} Hz ${audio?.[3]}`);

  const loud = text("-hide_banner", "-nostats", "-i", file, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-");
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(loud.slice(loud.lastIndexOf("Summary")))?.[1];
  const tp = /Peak:\s+(-?[\d.]+) dBFS/.exec(loud.slice(loud.lastIndexOf("Summary")))?.[1];
  check(+tp <= -1 && Math.abs(+lufs + 14) < 1.5, `loudness ${lufs} LUFS, true peak ${tp} dB (no clipping)`);

  // Sync: dark red just before the tap, green on the tap frame, sound with it
  const tapFrame = T.tap * T.fps;
  const before = frameColor(file, tapFrame - 1);
  const on = frameColor(file, tapFrame);
  check(on[1] > 180 && on[1] > on[0] * 1.3 && before[1] < 110, `green flash on frame ${tapFrame}: rgb ${before} → rgb ${on}`);
  const click = onset(file, T.tap - 0.1, T.tap + 0.1);
  check(Math.abs(click - T.tap) < 1 / T.fps, `tap sound at ${click.toFixed(3)}s (flash at ${T.tap}s, off by ${Math.abs(click - T.tap) * 1000 | 0} ms)`);
}
