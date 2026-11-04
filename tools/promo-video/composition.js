// Draws one frame of the commercial. seek(frame) sets everything from the frame
// number alone: no CSS animations or timers, so the render is exact.
const T = globalThis.PIXSUP_TIMELINE;
const $ = (id) => document.getElementById(id);

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, p) => a + (b - a) * p;
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const outCubic = (p) => 1 - (1 - p) ** 3;
const inCubic = (p) => p ** 3;
const inOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const outBack = (p) => { const c = 1.9; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// One-time setup: the wall of photos, the rings and sparks
// ---------------------------------------------------------------------------

const BOLT = '<svg width="34" height="34" viewBox="0 0 24 24" fill="#22d3ee"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
const HOURGLASS = '<svg width="20" height="24" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h14M5 26h14M7 2v5c0 4 10 6 10 11v8M17 2v5c0 4-10 6-10 11v8"/></svg>';
const LEFT = ["1h 42m", "38m", "2h 05m", "7:12", "54m", "1h 18m", "23m", "3h 10m", "9:40", "1h 03m", "46m", "2h 31m", "15m"];
const COLUMNS = [
  [1, 5, 9, 13, 3, 7, 11, 2],
  [4, 8, 12, 2, 6, 10, 1, 5],
  [3, 11, 7, 1, 9, 13, 4, 8],
  [6, 2, 10, 5, 12, 3, 8, 11],
];
$("wall").innerHTML = COLUMNS.map(
  (col, c) =>
    `<div class="col" id="col${c}">${col
      .map(
        (n, i) =>
          `<div class="tile"><img src="assets/tile${n}.jpg"><div class="pill">${HOURGLASS}${LEFT[(c * 4 + i) % LEFT.length]}</div><div class="hit">${BOLT}</div></div>`
      )
      .join("")}</div>`
).join("");

const RINGS = [0, 0.06, 0.14].map(() => {
  const d = document.createElement("div");
  d.className = "ring";
  $("fx").appendChild(d);
  return d;
});
const r = rng(11);
const SPARKS = Array.from({ length: 54 }, () => {
  const d = document.createElement("div");
  d.className = "spark";
  $("fx").appendChild(d);
  const a = r() * Math.PI * 2;
  return { d, dx: Math.cos(a), dy: Math.sin(a), speed: 260 + r() * 620, size: 7 + r() * 13, life: 0.45 + r() * 0.5 };
});

// ---------------------------------------------------------------------------
// The camera on the phone
// ---------------------------------------------------------------------------

// The quick cuts of scene 2, one for each number
const CUTS = [
  { from: 3.0, s: 1.02, x: 0, y: 0, rx: 4, ry: -6, rz: -1.5 },
  { from: 3.8, s: 1.42, x: 0, y: 130, rx: 0, ry: 4, rz: 1 },
  { from: 4.6, s: 1.3, x: -20, y: -240, rx: 6, ry: -8, rz: -2 },
  { from: 5.4, s: 1.14, x: 20, y: 20, rx: -2, ry: 8, rz: 2 },
  { from: 6.2, s: 1.52, x: 0, y: 170, rx: 0, ry: -3, rz: -1 },
];
const SAVE_SHOT = { s: 1.1, x: 0, y: -170, rx: 5, ry: -2, rz: 0 };

function camera(t) {
  let c;
  if (t < 3) {
    const e = outCubic(ramp(t, 0.15, 2.1));
    c = { s: lerp(0.78, 0.97, e) + 0.035 * (t / 3), x: 0, y: lerp(230, 0, e), rx: lerp(22, 5, e), ry: lerp(-16, -3, e), rz: 0 };
  } else if (t < 7) {
    const cut = [...CUTS].reverse().find((k) => t >= k.from);
    const age = t - cut.from;
    // each cut snaps in over a few frames, then drifts
    const snap = outCubic(ramp(age, 0, 0.13));
    c = { ...cut, s: cut.s * (0.95 + 0.05 * snap) + age * 0.035 };
  } else {
    const e = outCubic(ramp(t, 7, 7.3));
    const last = CUTS[4];
    const push = ramp(t, 7, 9);
    c = {
      s: lerp(last.s, SAVE_SHOT.s, e) + 0.06 * push,
      x: lerp(last.x, SAVE_SHOT.x, e),
      y: lerp(last.y, SAVE_SHOT.y, e) - 40 * push,
      rx: lerp(last.rx, SAVE_SHOT.rx, e),
      ry: lerp(last.ry, SAVE_SHOT.ry, e),
      rz: lerp(last.rz, SAVE_SHOT.rz, e),
    };
    // the tap kicks the camera, then it settles
    if (t >= T.tap) {
      const after = t - T.tap;
      c.s += 0.07 * Math.exp(-after * 7) + 0.03 * ramp(after, 0, 0.9);
      c.rx = lerp(c.rx, 2, ramp(after, 0, 0.5));
    }
  }
  // shake builds with the tension and stops dead at the tap
  const amp = t < 3 ? 0 : t < T.tap ? lerp(2.5, 11, ramp(t, 3, T.tap)) : 0;
  c.x += amp * (Math.sin(t * 61) + 0.6 * Math.sin(t * 97 + 1));
  c.y += amp * (Math.sin(t * 73 + 2) + 0.6 * Math.sin(t * 113));
  c.rz += (amp / 11) * 0.5 * Math.sin(t * 47);
  return c;
}

// ---------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------

function seek(frame) {
  const t = frame / T.fps;
  const saved = t >= T.tap;

  // Which number, and how fresh it is
  const tick = [...T.ticks].reverse().find(([at]) => t >= at);
  const n = tick[1];
  const tickAge = t - tick[0];
  const pulse = t >= 3 && !saved ? Math.exp(-tickAge * 6) : 0;
  const danger = saved ? 0 : (10 - n) / 9; // 0 calm … 1 about to die

  // ── Layers ────────────────────────────────────────────────
  $("scene-phone").style.display = t < 10.25 ? "block" : "none";
  $("scene-wall").style.display = t >= 9.9 && t < 13.2 ? "block" : "none";
  $("scene-end").style.display = t >= 12.9 ? "block" : "none";
  $("blackout").style.opacity = 1 - ramp(t, 0.2, 0.75);

  // ── The phone ─────────────────────────────────────────────
  const c = camera(t);
  const out = inCubic(ramp(t, 9.82, 10.12)); // flies through the screen into scene 4
  $("phone").style.transform = `translate(${c.x}px, ${c.y}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) rotateZ(${c.rz}deg) scale(${c.s * (1 + out * 3.2)})`;
  const emerge = inOut(ramp(t, 0.25, 1.5));
  $("phone").style.filter = `brightness(${lerp(0.06, 1, emerge)})${out > 0 ? ` blur(${out * 26}px)` : ""}`;
  $("scene-phone").style.opacity = 1 - ramp(t, 10.0, 10.2);
  $("wake").style.opacity = 1 - ramp(t, 0.7, 1.15);

  const glow = saved ? "43,255,136" : t < 1.5 ? "34,211,238" : "255,40,60";
  const glowA = saved ? lerp(0.5, 0.26, ramp(t, T.tap, 9.8)) : t < 1.5 ? 0.15 * emerge : 0.1 + 0.1 * danger + 0.14 * pulse;
  $("backlight").style.background = `radial-gradient(circle, rgba(${glow},${glowA}) 0%, rgba(${glow},${glowA * 0.35}) 45%, transparent 72%)`;
  $("floor").style.opacity = emerge;

  // Inside the app
  const label = saved ? "1h 00m left" : `0:${String(n).padStart(2, "0")} left`;
  $("lifetext").textContent = label;
  $("lifelabel").style.color = saved ? "#fff" : "#ff5a68";
  const fill = saved ? lerp(n * 10, 100, outCubic(ramp(t, T.tap, T.tap + 0.25))) : (n - clamp(tickAge / 1, 0, 0.9)) * 10;
  $("lifefill").style.width = `${Math.max(1.5, saved ? fill : t < 3 ? 100 : fill)}%`;
  $("lifefill").style.background = saved ? "linear-gradient(90deg,#22d3ee,#2bff88)" : "#ff2d3f";
  $("lifefill").style.boxShadow = saved ? "0 0 18px rgba(43,255,136,.7)" : "0 0 16px rgba(255,45,63,.8)";

  // The photo drains of colour as it dies, and comes back when saved
  const backIn = outCubic(ramp(t, T.tap, T.tap + 0.3));
  const sat = saved ? lerp(0.2, 1.22, backIn) : lerp(1.08, 0.22, danger);
  const bri = saved ? lerp(0.7, 1.08, backIn) : lerp(1, 0.72, danger);
  $("heroimg").style.filter = `saturate(${sat}) brightness(${bri})`;
  $("heroimg").style.transform = `scale(${1.03 + t * 0.008})`;
  $("savedchip").style.opacity = ramp(t, T.tap + 0.12, T.tap + 0.3);
  $("savedchip").style.transform = `translateY(${(1 - outBack(ramp(t, T.tap + 0.12, T.tap + 0.34))) * 22}px)`;

  // The SAVE button
  const btn = $("savebtn");
  const press = t >= 8.94 && t < T.tap ? lerp(1, 0.93, ramp(t, 8.94, T.tap)) : saved ? lerp(0.93, 1, outBack(ramp(t, T.tap, T.tap + 0.2))) : 1;
  const beat = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * (1.2 + danger * 2));
  btn.style.transform = `scale(${press * (saved ? 1 : 1 + 0.012 * beat)})`;
  btn.style.background = saved ? "linear-gradient(180deg,#5dffa6,#12d96d)" : "linear-gradient(180deg,#ff4a59,#d3132a)";
  btn.style.color = saved ? "#03230f" : "#fff";
  btn.style.boxShadow = saved
    ? "0 0 60px 8px rgba(43,255,136,.7), inset 0 2px 0 rgba(255,255,255,.55)"
    : `0 0 ${34 + 44 * beat * (0.4 + danger)}px ${4 + 8 * danger}px rgba(255,45,63,${0.45 + 0.4 * danger}), inset 0 2px 0 rgba(255,255,255,.3)`;
  $("savelabel").textContent = saved ? "SAVED" : "SAVE";

  // ── The countdown, big and red ────────────────────────────
  const countVisible = t >= T.numberSlam && !saved;
  const count = $("count");
  count.style.display = countVisible ? "block" : "none";
  if (countVisible) {
    count.textContent = n;
    const age = n === 10 ? t - T.numberSlam : tickAge;
    const pop = outCubic(ramp(age, 0, 0.16));
    const size = lerp(n === 10 ? 2.1 : 1.32, 1, pop);
    const top = t < 7 ? 500 : lerp(500, 330, outCubic(ramp(t, 7, 7.3)));
    count.style.top = `${top}px`;
    count.style.opacity = n === 10 ? pop : 1;
    count.style.transform = `scale(${size})`;
    const heat = 0.55 + 0.45 * Math.exp(-age * 5);
    count.style.color = "#ff2b3e";
    count.style.textShadow = `0 0 ${30 + 60 * heat}px rgba(255,30,50,${heat}), 0 0 ${130 * heat + 40}px rgba(255,30,50,.75), 0 10px 44px rgba(0,0,0,.9)`;
    count.style.webkitTextStroke = "3px rgba(255,235,235,.55)";
  }

  const hookIn = outCubic(ramp(t, 1.8, 2.05));
  const hook = $("hooktext");
  hook.style.display = hookIn > 0 && t < 3.0 ? "block" : "none";
  hook.style.top = `${940 + (1 - hookIn) * 30}px`;
  hook.style.opacity = hookIn;

  const redA = saved ? 0 : t < 1.5 ? 0 : 0.1 + 0.2 * danger + 0.2 * pulse;
  const greenA = saved ? lerp(0.5, 0.16, ramp(t, T.tap, 9.7)) : 0;
  $("vignette").style.background = saved
    ? `radial-gradient(ellipse at center, transparent 42%, rgba(43,255,136,${greenA}) 100%)`
    : `radial-gradient(ellipse at center, transparent 40%, rgba(255,16,36,${redA}) 100%)`;
  $("vignette").style.opacity = t < 10 ? 1 : 0;

  // ── The finger ────────────────────────────────────────────
  const b = btn.getBoundingClientRect();
  const tx = b.left + b.width * 0.5;
  const ty = b.top + b.height * 0.5 - 8;
  const fing = $("finger");
  const fshadow = $("fingershadow");
  const fingerOn = t >= 7.1 && t < 9.7;
  fing.style.display = fingerOn ? "block" : "none";
  fshadow.style.display = fingerOn ? "block" : "none";
  if (fingerOn) {
    const inP = inOut(ramp(t, 7.1, 8.5));
    let ox = lerp(600, 215, inP);
    let oy = lerp(1050, 96, inP);
    // hesitates, then commits at the last possible moment
    const hover = ramp(t, 8.5, 8.86);
    oy -= 26 * Math.sin(hover * Math.PI);
    const commit = inCubic(ramp(t, 8.8, T.tap));
    ox = lerp(ox, 0, commit);
    oy = lerp(oy, 0, commit);
    const retreat = inCubic(ramp(t, T.tap + 0.1, 9.65));
    ox += retreat * 640;
    oy += retreat * 1100;
    const squash = t >= T.tap && t < T.tap + 0.1 ? 0.975 : 1;
    fing.style.transform = `translate(${tx + ox}px, ${ty + oy}px) rotate(-23deg) scale(${0.68 * squash})`;
    const near = 1 - clamp(Math.hypot(ox, oy) / 700);
    fshadow.style.transform = `translate(${tx + ox + 34 + (1 - near) * 40}px, ${ty + oy + 90}px) rotate(-23deg) scale(${lerp(1.5, 0.95, near)})`;
    fshadow.style.opacity = 0.2 + 0.55 * near;
  }

  // ── The save: flash, rings, sparks, the word ──────────────
  const after = t - T.tap;
  $("flash").style.background = after >= 0 && after < 0.6 ? `rgba(70,255,150,${0.96 * Math.exp(-after * 8.5)})` : "transparent";
  RINGS.forEach((ring, i) => {
    const age = after - i * 0.07;
    const on = age >= 0 && age < 0.7;
    ring.style.display = on ? "block" : "none";
    if (!on) return;
    const size = 120 + outCubic(age / 0.7) * 1300;
    ring.style.width = ring.style.height = `${size}px`;
    ring.style.borderWidth = `${lerp(26, 2, age / 0.7)}px`;
    ring.style.opacity = 1 - age / 0.7;
    ring.style.transform = `translate(${tx - size / 2}px, ${ty - size / 2}px)`;
  });
  SPARKS.forEach((s) => {
    const on = after >= 0 && after < s.life;
    s.d.style.display = on ? "block" : "none";
    if (!on) return;
    const p = after / s.life;
    const dist = outCubic(p) * s.speed;
    s.d.style.width = s.d.style.height = `${s.size * (1 - p * 0.6)}px`;
    s.d.style.opacity = 1 - p ** 2;
    s.d.style.transform = `translate(${tx + s.dx * dist}px, ${ty + s.dy * dist + 170 * after * after}px)`;
  });

  const wordOn = after >= 0.03 && t < 10.1;
  const word = $("savedword");
  const check = $("bigcheck");
  word.style.display = check.style.display = wordOn ? "block" : "none";
  if (wordOn) {
    const inW = outBack(ramp(after, 0.03, 0.24));
    const leave = ramp(t, 9.84, 10.05);
    word.style.top = "520px";
    word.style.opacity = ramp(after, 0.03, 0.08) * (1 - leave);
    word.style.transform = `scale(${lerp(1.7, 1, inW) * (1 + leave * 0.5)})`;
    word.style.textShadow = "0 0 40px rgba(43,255,136,1), 0 0 110px rgba(43,255,136,.85), 0 10px 40px rgba(0,0,0,.75)";
    check.style.top = "322px";
    check.style.opacity = ramp(after, 0.03, 0.08) * (1 - leave);
    check.style.transform = `scale(${outBack(ramp(after, 0.03, 0.26)) * (1 + leave * 0.5)})`;
    check.style.filter = "drop-shadow(0 0 28px rgba(43,255,136,.95))";
    const path = $("checkpath");
    path.style.strokeDasharray = "90";
    path.style.strokeDashoffset = `${90 * (1 - outCubic(ramp(after, 0.12, 0.32)))}`;
  }

  // ── Scene 4: the wall of moments ──────────────────────────
  if (t >= 9.9 && t < 13.2) {
    const age = t - T.wall;
    const inW = outCubic(ramp(age, -0.1, 0.55));
    $("scene-wall").style.opacity = ramp(t, 9.9, 10.1);
    $("wall").style.transform = `rotateX(24deg) rotateZ(-11deg) scale(${lerp(1.5, 1.04, inW) + age * 0.012})`;
    COLUMNS.forEach((_, i) => {
      const dir = i % 2 ? 1 : -1;
      $(`col${i}`).style.transform = `translateY(${-560 + (i % 2 ? -520 : 120) + dir * (age * 230 + (1 - inW) * 260)}px)`;
    });
    $("sweep").style.transform = `translateX(${lerp(-70, 70, ramp(age, 0.2, 2.8))}%)`;
    const logoIn = outCubic(ramp(age, 0.22, 0.5));
    $("walllogo").style.opacity = logoIn;
    $("walllogo").style.transform = `translateY(${(1 - logoIn) * 30}px)`;
    [...$("diff").children].forEach((line, i) => {
      const p = outCubic(ramp(age, 0.34 + i * 0.17, 0.62 + i * 0.17));
      line.style.opacity = p;
      line.style.transform = `translateY(${(1 - p) * 56}px)`;
      line.style.color = i === 2 ? "#2bff88" : "#fff";
      line.style.textShadow = i === 2 ? "0 0 40px rgba(43,255,136,.6), 0 6px 30px #000" : "0 6px 30px #000";
    });
  }

  // ── Scene 5: the call to action ───────────────────────────
  if (t >= 12.9) {
    const age = t - T.end;
    $("scene-end").style.opacity = ramp(t, 12.9, 13.08);
    const logoP = outCubic(ramp(age, 0.02, 0.36));
    $("endlogo").style.opacity = logoP;
    $("endlogo").style.transform = `scale(${lerp(1.16, 1, logoP)})`;
    const rise = (id, a, b) => {
      const p = outCubic(ramp(age, a, b));
      $(id).style.opacity = p;
      $(id).style.transform = `translateY(${(1 - p) * 26}px)`;
    };
    rise("tag1", 0.16, 0.38);
    rise("tag2", 0.28, 0.5);
    rise("visit", 0.42, 0.62);
    rise("url", 0.46, 0.68);
    const breath = 0.5 + 0.5 * Math.sin(age * 4.2 - 1);
    const lineP = outCubic(ramp(age, 0.62, 0.95));
    $("underline").style.width = `${lineP * 680}px`;
    $("underline").style.marginLeft = `${-(lineP * 680) / 2}px`;
    $("underline").style.opacity = 0.75 + 0.25 * breath;
    $("url").style.textShadow = `0 0 ${14 + 26 * breath}px rgba(43,255,136,${0.3 + 0.4 * breath * lineP})`;
    $("endglow").style.background = `radial-gradient(ellipse 60% 26% at 50% 60%, rgba(43,255,136,${(0.08 + 0.07 * breath) * lineP}), transparent 100%)`;
  }

  // Film grain moves every frame (it also stops banding in the dark gradients)
  const g = rng(frame + 1);
  $("grain").style.transform = `translate(${g() * 60 - 30}px, ${g() * 60 - 30}px)`;
}

// The thumbnail: the moment before the tap, with the brand on top
function thumbnail() {
  seek(Math.round(8.62 * T.fps));
  $("thumbhead").style.display = "block";
  $("count").style.top = "440px";
  $("appbar").style.visibility = "hidden";
  $("lifewrap").style.visibility = "hidden";
  $("status").style.visibility = "hidden";
  $("grain").style.display = "none";
}

window.seek = seek;
window.thumbnail = thumbnail;
window.READY = Promise.all([
  document.fonts.load('900 100px "Inter Variable"'),
  document.fonts.ready,
  ...[...document.images].map((i) => i.decode().catch(() => {})),
]).then(() => seek(0));

// Preview in a browser: open composition.html?play
if (location.search.includes("play")) {
  window.READY.then(() => {
    document.documentElement.style.zoom = String(Math.min(1, innerHeight / 1920));
    const start = performance.now();
    const loop = (now) => {
      seek(Math.floor((((now - start) / 1000) % T.duration) * T.fps));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
