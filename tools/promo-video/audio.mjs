// The commercial's sound, synthesized from scratch (no samples, nothing to
// license). Two stems: sound effects, and music. makeAudio() writes
// full.wav (both) and sfx.wav (effects only), timed from timeline.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./timeline.js";

const T = globalThis.PIXSUP_TIMELINE;
const SR = 48000;
const LEN = Math.round(T.duration * SR);
const TAU = Math.PI * 2;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

// A stereo bus with a reverb send
class Bus {
  constructor() {
    this.l = new Float64Array(LEN);
    this.r = new Float64Array(LEN);
    this.sl = new Float64Array(LEN);
    this.sr = new Float64Array(LEN);
  }
  put(i, v, pan = 0, send = 0) {
    if (i < 0 || i >= LEN) return;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = Math.sin(((pan + 1) * Math.PI) / 4);
    this.l[i] += v * gl;
    this.r[i] += v * gr;
    if (send) {
      this.sl[i] += v * gl * send;
      this.sr[i] += v * gr * send;
    }
  }
  // A small plate-like reverb: parallel combs into allpasses
  reverb(mix = 0.3, decay = 0.82) {
    const run = (input, out, spread) => {
      const wet = new Float64Array(LEN);
      for (const ms of [29.7, 37.1, 41.1, 43.7]) {
        const d = Math.round((ms + spread) * 48);
        const buf = new Float64Array(d);
        let p = 0, damp = 0;
        for (let i = 0; i < LEN; i++) {
          const y = buf[p];
          damp = y * 0.72 + damp * 0.28;
          buf[p] = input[i] + damp * decay;
          p = (p + 1) % d;
          wet[i] += y * 0.25;
        }
      }
      for (const ms of [5.0, 1.7]) {
        const d = Math.round((ms + spread * 0.1) * 48);
        const buf = new Float64Array(d);
        let p = 0;
        for (let i = 0; i < LEN; i++) {
          const y = buf[p];
          const x = wet[i] + y * 0.5;
          buf[p] = x;
          p = (p + 1) % d;
          wet[i] = y - x * 0.5;
        }
      }
      for (let i = 0; i < LEN; i++) out[i] += wet[i] * mix;
    };
    run(this.sl, this.l, 0);
    run(this.sr, this.r, 1.3);
  }
}

// Oscillators with a pitch curve: f(age) → Hz, g(age) → gain
function voice(bus, start, dur, { f, g, pan = 0, send = 0, shape = "sine" }) {
  const s = Math.round(start * SR);
  const n = Math.round(dur * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const age = i / SR;
    phase += (f(age) * TAU) / SR;
    let v;
    if (shape === "sine") v = Math.sin(phase);
    else if (shape === "saw") v = 2 * ((phase / TAU) % 1) - 1;
    else if (shape === "square") v = Math.sin(phase) > 0 ? 1 : -1;
    else v = 1 - 4 * Math.abs(((phase / TAU) % 1) - 0.5);
    bus.put(s + i, v * g(age), pan, send);
  }
}

// Filtered noise with a moving band: fc(age) → Hz, g(age) → gain
function noise(bus, start, dur, { fc, q = 1, g, pan = 0, send = 0, seed = 1, mode = "band" }) {
  const rnd = seeded(seed);
  const s = Math.round(start * SR);
  const n = Math.round(dur * SR);
  let low = 0, band = 0;
  for (let i = 0; i < n; i++) {
    const age = i / SR;
    const k = 2 * Math.sin((Math.PI * clamp(fc(age), 20, 12000)) / SR);
    const x = rnd();
    low += k * band;
    const high = x - low - band / q;
    band += k * high;
    const v = mode === "band" ? band : mode === "high" ? high : low;
    bus.put(s + i, v * g(age), pan, send);
  }
}

const expo = (rate) => (age) => Math.exp(-age * rate);
const ad = (attack, rate) => (age) => (age < attack ? age / attack : Math.exp(-(age - attack) * rate));

// A bell: a few inharmonic partials
function bell(bus, start, freq, gain, { pan = 0, send = 0.5, decay = 6 } = {}) {
  [[1, 1], [2.01, 0.5], [3.02, 0.25], [4.2, 0.12]].forEach(([mul, amp], i) =>
    voice(bus, start, 1.6, {
      f: () => freq * mul,
      g: (a) => gain * amp * (a < 0.003 ? a / 0.003 : Math.exp(-a * decay * (1 + i * 0.7))),
      pan,
      send,
    })
  );
}

function impact(bus, start, gain, seed = 3) {
  voice(bus, start, 1.1, { f: (a) => 42 + 90 * Math.exp(-a * 28), g: (a) => gain * Math.exp(-a * 4.2), send: 0.12 });
  noise(bus, start, 0.5, { fc: (a) => 300 + 5200 * Math.exp(-a * 16), q: 0.7, g: (a) => gain * 0.5 * Math.exp(-a * 13), send: 0.5, seed, mode: "low" });
}

function whoosh(bus, start, dur, gain, seed = 9, up = true) {
  noise(bus, start, dur, {
    fc: (a) => {
      const p = a / dur;
      return up ? 300 + 6500 * p * p : 6000 - 5400 * p;
    },
    q: 2.2,
    g: (a) => gain * Math.sin((Math.PI * clamp(a / dur)) ** 1.1),
    pan: 0,
    send: 0.35,
    seed,
  });
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

function effects() {
  const b = new Bus();
  const tap = T.tap;

  // A deep cinematic opening
  voice(b, 0.12, 2.8, { f: (a) => 28 + 44 * Math.exp(-a * 2.4), g: (a) => 0.85 * clamp(a / 0.03) * Math.exp(-a * 1.25), send: 0.1 });
  noise(b, 0.12, 2.4, { fc: () => 95, q: 1.5, g: (a) => 1.0 * clamp(a / 0.5) * Math.exp(-a * 1.3), seed: 21, mode: "low", send: 0.2 });
  // Electronic rise into the big red 10
  noise(b, 0.55, T.numberSlam - 0.55, {
    fc: (a) => 200 + 5200 * (a / (T.numberSlam - 0.55)) ** 2,
    q: 3.5,
    g: (a) => 0.3 * (a / (T.numberSlam - 0.55)) ** 2,
    seed: 5,
    send: 0.3,
  });
  voice(b, 0.7, T.numberSlam - 0.7, { f: (a) => 110 * 2 ** (a * 2.4), g: (a) => 0.09 * (a / 0.8) ** 2, shape: "saw", send: 0.3 });
  impact(b, T.numberSlam, 0.95, 31);
  bell(b, T.numberSlam, midi(45), 0.3, { decay: 3, send: 0.7 });

  // Digital ticks, one for each number, climbing in pitch
  T.ticks.slice(1).forEach(([at, n], i) => {
    const pitch = midi(84 + (10 - n) * 1.2);
    voice(b, at, 0.05, { f: () => pitch, g: (a) => 0.3 * Math.exp(-a * 70), shape: "square", pan: i % 2 ? 0.28 : -0.28, send: 0.14 });
    voice(b, at, 0.1, { f: (a) => 150 * Math.exp(-a * 22) + 60, g: (a) => 0.65 * Math.exp(-a * 30), send: 0.06 });
    noise(b, at, 0.03, { fc: () => 7000, q: 1, g: (a) => 0.3 * Math.exp(-a * 160), seed: 40 + i, mode: "high" });
  });

  // Tension climbing all through the countdown
  const riseEnd = tap - 0.14;
  const riseLen = riseEnd - 3;
  noise(b, 3, riseLen, {
    fc: (a) => 240 + 6200 * (a / riseLen) ** 2.2,
    q: 4,
    g: (a) => 0.04 + 0.27 * (a / riseLen) ** 2.2,
    seed: 77,
    send: 0.25,
  });
  [0, 0.08].forEach((det, i) =>
    voice(b, 3, riseLen, {
      f: (a) => (110 + det) * 2 ** ((a / riseLen) * 3),
      g: (a) => 0.022 + 0.05 * (a / riseLen) ** 2,
      shape: "saw",
      pan: i ? 0.4 : -0.4,
      send: 0.2,
    })
  );

  // The tap: a sharp, dry click on a silent beat
  noise(b, tap, 0.012, { fc: () => 6500, q: 0.8, g: (a) => 1.0 * Math.exp(-a * 420), seed: 12, mode: "high" });
  voice(b, tap, 0.06, { f: (a) => 900 * Math.exp(-a * 60) + 160, g: (a) => 0.9 * Math.exp(-a * 70) });

  // The confirmation: a rising chime, the most satisfying moment
  impact(b, tap + 0.012, 0.8, 55);
  [72, 76, 79, 84, 88].forEach((note, i) => {
    bell(b, tap + 0.02 + i * 0.058, midi(note), 0.34 - i * 0.02, { pan: (i - 2) * 0.16, send: 0.6, decay: 4.5 });
  });
  noise(b, tap + 0.02, 0.5, { fc: (a) => 8000 + 2500 * a, q: 2, g: (a) => 0.14 * Math.exp(-a * 7), seed: 88, send: 0.7 });

  // Into scene 4
  whoosh(b, T.wall - 0.28, 0.5, 0.55, 91);
  impact(b, T.wall + 0.02, 0.42, 92);

  // Into the ending
  whoosh(b, T.end - 0.3, 0.42, 0.42, 93);
  impact(b, T.end + 0.05, 0.62, 94);
  // A clean ending sound as the name and the website land
  [60, 67, 72, 76].forEach((note, i) => bell(b, T.end + 0.06 + i * 0.015, midi(note), 0.2, { pan: (i - 1.5) * 0.2, send: 0.8, decay: 1.5 }));
  bell(b, T.end + 0.5, midi(84), 0.15, { send: 0.8, decay: 2.6 });

  b.reverb(0.42, 0.84);
  return b;
}

// ---------------------------------------------------------------------------
// Music: 128 BPM, the bar lines fall on the tap
// ---------------------------------------------------------------------------

const BEAT = 60 / 128;

function kick(b, at, gain) {
  voice(b, at, 0.28, { f: (a) => 48 + 150 * Math.exp(-a * 38), g: (a) => gain * Math.exp(-a * 11), });
  noise(b, at, 0.012, { fc: () => 5000, q: 1, g: (a) => gain * 0.3 * Math.exp(-a * 300), seed: 3, mode: "high" });
}
function hat(b, at, gain, seed, open = false) {
  noise(b, at, open ? 0.14 : 0.05, { fc: () => 9500, q: 1.1, g: (a) => gain * Math.exp(-a * (open ? 28 : 80)), seed, mode: "high", pan: seed % 2 ? 0.2 : -0.2 });
}
function clap(b, at, gain, seed) {
  [0, 0.011, 0.023].forEach((d, i) => noise(b, at + d, 0.2, { fc: () => 1900, q: 1.2, g: (a) => gain * (i === 2 ? 1 : 0.6) * Math.exp(-a * (i === 2 ? 20 : 90)), seed: seed + i, send: 0.3 }));
}
function bass(b, at, dur, note, gain) {
  const f = midi(note);
  voice(b, at, dur, { f: () => f, g: (a) => gain * clamp(a / 0.006) * clamp((dur - a) / 0.02), shape: "tri" });
  voice(b, at, dur, { f: () => f * 2, g: (a) => gain * 0.22 * clamp(a / 0.006) * clamp((dur - a) / 0.02) * Math.exp(-a * 8), shape: "saw" });
}
// A wide, detuned chord through a lowpass whose opening follows cutoff(t)
function supersaw(b, at, dur, notes, gain, cutoff, send = 0.35) {
  const s = Math.round(at * SR);
  const n = Math.round(dur * SR);
  const dets = [-0.11, -0.05, 0.0, 0.05, 0.11];
  notes.forEach((note, ni) => {
    dets.forEach((d, di) => {
      const f = midi(note + d);
      const pan = (di - 2) * 0.22;
      let phase = (ni * 0.37 + di * 0.21) % 1;
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const age = i / SR;
        phase = (phase + f / SR) % 1;
        const k = 1 - Math.exp((-TAU * cutoff(at + age)) / SR);
        lp += k * (2 * phase - 1 - lp);
        const env = clamp(age / 0.012) * clamp((dur - age) / 0.05);
        b.put(s + i, lp * env * gain, pan, send);
      }
    });
  });
}
function pluck(b, at, note, gain, pan, send = 0.35) {
  const f = midi(note);
  voice(b, at, 0.22, { f: () => f, g: (a) => gain * Math.exp(-a * 15), shape: "saw", pan, send });
  voice(b, at, 0.22, { f: () => f * 2, g: (a) => gain * 0.4 * Math.exp(-a * 20), pan, send });
}

function music() {
  const b = new Bus();
  const tap = T.tap;
  // Everything sits on the grid running back from the tap
  const beats = (from, to, step = 1) => {
    const out = [];
    for (let k = Math.ceil((from - tap) / (BEAT * step)); tap + k * BEAT * step < to - 1e-6; k++) out.push(tap + k * BEAT * step);
    return out;
  };

  // A low pulse under the hook
  beats(1.6, 3.05, 0.5).forEach((at) => bass(b, at, BEAT * 0.42, 33, 0.2));

  // The countdown: A minor, getting faster and brighter, then cut dead before
  // the tap so the click lands in silence
  const cutAt = tap - 0.14;
  beats(3, cutAt, 0.5).forEach((at) => bass(b, at, BEAT * 0.42, 33, 0.3));
  beats(3, cutAt).forEach((at) => kick(b, at, 0.55 + 0.25 * ramp(at, 3, tap)));
  beats(5.4, cutAt, 0.5).forEach((at, i) => hat(b, at, 0.1 + 0.1 * ramp(at, 5, tap), 100 + i));
  beats(7.5, cutAt, 0.25).forEach((at, i) => hat(b, at, 0.1, 200 + i));
  const arpMinor = [57, 60, 64, 69, 72, 69, 64, 60];
  beats(3, cutAt, 0.25).forEach((at, i) => pluck(b, at, arpMinor[((i % 8) + 8) % 8] + (at > 6.2 ? 12 : 0), 0.035 + 0.05 * ramp(at, 3, tap), i % 2 ? 0.35 : -0.35));
  const tensionCut = (t) => 300 + 4200 * ramp(t, 3, tap) ** 2;
  supersaw(b, 3, cutAt - 3, [45, 57, 60, 64], 0.022, tensionCut);

  // The release: bright, major, full energy
  const prog = [
    [48, [60, 64, 67, 72]], // C
    [43, [59, 62, 67, 71]], // G
    [45, [60, 64, 69, 72]], // Am
    [41, [60, 65, 69, 72]], // F
  ];
  const barLen = BEAT * 2;
  const endMusic = T.end;
  for (let i = 0, at = tap; at < endMusic - 1e-6; i++, at += barLen) {
    const [root, chord] = prog[i % 4];
    const len = Math.min(barLen, endMusic - at);
    supersaw(b, at, len, chord, 0.036, (t) => 2600 + 2600 * ramp(t, tap, endMusic));
    for (let e = 0; e < 4; e++) {
      const when = at + (e * BEAT) / 2;
      if (when < endMusic && e % 2) bass(b, when, BEAT * 0.44, root - 12 + 12, 0.34);
    }
    const arp = [chord[0], chord[2], chord[1], chord[3], chord[2] + 12, chord[1], chord[3], chord[2]];
    for (let s = 0; s < 8; s++) {
      const when = at + (s * BEAT) / 4;
      if (when < endMusic) pluck(b, when, arp[s] + 12, 0.05, s % 2 ? 0.45 : -0.45, 0.4);
    }
  }
  beats(tap, endMusic).forEach((at) => kick(b, at, 0.85));
  beats(tap + BEAT, endMusic, 2).forEach((at, i) => clap(b, at, 0.28, 300 + i * 3));
  beats(tap + BEAT / 2, endMusic).forEach((at, i) => hat(b, at, 0.2, 400 + i, true));
  beats(tap, endMusic, 0.25).forEach((at, i) => hat(b, at, 0.07, 500 + i));

  // The ending: one held chord, then clean silence
  supersaw(b, T.end, 1.9, [48, 60, 64, 67, 72], 0.03, (t) => 3200 - 2400 * ramp(t, T.end, T.end + 1.9), 0.6);
  bass(b, T.end, 1.2, 36, 0.3);

  b.reverb(0.26, 0.78);
  return b;
}

// ---------------------------------------------------------------------------
// Mixing and writing
// ---------------------------------------------------------------------------

function writeWav(file, l, r) {
  const data = Buffer.alloc(LEN * 4);
  for (let i = 0; i < LEN; i++) {
    data.writeInt16LE(Math.round(clamp(l[i], -1, 1) * 32767), i * 4);
    data.writeInt16LE(Math.round(clamp(r[i], -1, 1) * 32767), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}

// Soft-limits, then peaks at -1 dB, with a tiny fade at the very end
function master(parts) {
  const l = new Float64Array(LEN);
  const r = new Float64Array(LEN);
  for (const [bus, gain] of parts) {
    for (let i = 0; i < LEN; i++) {
      l[i] += bus.l[i] * gain;
      r[i] += bus.r[i] * gain;
    }
  }
  let peak = 0;
  for (let i = 0; i < LEN; i++) {
    const fade = clamp((LEN - i) / (SR * 0.05));
    l[i] = Math.tanh(l[i] * 1.15) * fade;
    r[i] = Math.tanh(r[i] * 1.15) * fade;
    peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  }
  const norm = 0.89 / (peak || 1);
  for (let i = 0; i < LEN; i++) {
    l[i] *= norm;
    r[i] *= norm;
  }
  return [l, r];
}

export function makeAudio(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const fx = effects();
  const mu = music();
  const full = path.join(dir, "full.wav");
  const sfx = path.join(dir, "sfx.wav");
  writeWav(full, ...master([[fx, 0.9], [mu, 0.8]]));
  writeWav(sfx, ...master([[fx, 1.0]]));
  return { full, sfx };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(makeAudio(path.join(path.dirname(fileURLToPath(import.meta.url)), ".cache")));
}
