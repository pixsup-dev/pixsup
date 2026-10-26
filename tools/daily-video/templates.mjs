// The video designs. Each returns a full HTML page (360×640, recorded at 3×
// = 1080×1920) that plays its own timeline and sets window.__done at the end.
// Everything shown comes from real Pixsup data passed in.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:360px;height:640px;overflow:hidden;background:#0b0f17;color:#fff;
    font-family:Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .scene{position:absolute;inset:0;opacity:0;transition:opacity .3s ease}
  .scene.on{opacity:1}
  .pop{opacity:0;transform:scale(.7) translateY(10px);transition:all .45s cubic-bezier(.2,1.5,.4,1)}
  .pop.on{opacity:1;transform:none}
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 26px;gap:16px}
  .big{font-size:31px;font-weight:900;line-height:1.15}
  .cyan{color:#22d3ee}.red{color:#f87171}.amber{color:#fbbf24}.green{color:#4ade80}
  .cap{position:absolute;left:18px;right:18px;top:96px;display:flex;justify-content:center;z-index:5}
  .cap span{background:rgba(0,0,0,.8);color:#fff;font-size:22px;font-weight:900;line-height:1.2;padding:9px 15px;
    border-radius:12px;text-align:center;box-shadow:0 4px 22px rgba(0,0,0,.5);animation:capIn .3s cubic-bezier(.2,1.4,.4,1)}
  .cap span.redbg{background:#dc2626}
  @keyframes capIn{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
  .brand{font-size:56px;font-weight:900;background:linear-gradient(90deg,#22d3ee,#fbbf24);-webkit-background-clip:text;color:transparent}
  .url{font-size:30px;font-weight:900;color:#22d3ee}
  .sub{font-size:19px;font-weight:800;color:#e5e7eb;line-height:1.35}
  .end{background:radial-gradient(circle at 50% 35%,#1b2a44,#0b0f17 70%)}
`;

// The timeline runner shared by every design: [seconds, fn] steps
const RUNNER = `
  const $ = (s) => document.querySelector(s);
  const on = (s) => document.querySelectorAll(s).forEach((e) => e.classList.add("on"));
  const off = (s) => document.querySelectorAll(s).forEach((e) => e.classList.remove("on"));
  const cap = (text, cls = "") => { $("#cap").innerHTML = text ? '<span class="' + cls + '">' + text + "</span>" : ""; };
  // The recorder sets __hold and calls __start() once it's recording
  function play(steps, total) {
    const go = () => {
      for (const [at, fn] of steps) setTimeout(fn, at * 1000);
      setTimeout(() => (window.__done = true), total * 1000);
    };
    if (window.__hold) window.__start = go;
    else go();
  }
`;

export const page = (css, body, script) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;800;900&display=swap" rel="stylesheet">
<style>${BASE_CSS}${css}</style></head><body>${body}
<div id="cap" class="cap"></div>
<script>${RUNNER}${script}</script></body></html>`;

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

// ⏳ "Will it survive?": one real live post and its real countdown
export function surviveVideo({ post, username, remainingMs }) {
  const where = [username ? `@${esc(username)}` : post.isNews ? esc(post.guest_author_id) : "", post.city ? `📍 ${esc(post.city)}` : ""]
    .filter(Boolean)
    .join(" · ");
  const lifeSpan = post.isNews ? 6 * 3600e3 : 2 * 3600e3;
  const css = `
    .photo{position:absolute;inset:0;background:#000}
    .photo img{width:100%;height:100%;object-fit:cover;transform:scale(1.02);transition:transform 9s linear}
    .photo.on img{transform:scale(1.14)}
    .shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent 28%,transparent 55%,rgba(0,0,0,.9))}
    .life{position:absolute;left:16px;right:16px;top:22px;z-index:4}
    .life .label{display:flex;align-items:center;gap:6px;font-size:17px;font-weight:900;margin-bottom:6px;text-shadow:0 2px 6px #000}
    .life .bar{height:8px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}
    .life .fill{height:100%;border-radius:9px;background:linear-gradient(90deg,#22d3ee,#34d399);transition:width 1s linear,background .4s}
    .meta{position:absolute;left:18px;right:18px;bottom:34px;z-index:4}
    .meta .who{font-size:15px;font-weight:800;color:#d1d5db;margin-bottom:6px;text-shadow:0 2px 6px #000}
    .meta .title{font-size:26px;font-weight:900;line-height:1.15;text-shadow:0 2px 10px #000}
    .tap{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);z-index:4;background:#dc2626;color:#fff;
      font-size:20px;font-weight:900;padding:12px 26px;border-radius:999px;box-shadow:0 0 30px rgba(220,38,38,.7);
      animation:pulse 1s ease-in-out infinite}
    @keyframes pulse{50%{transform:translateX(-50%) scale(1.07)}}
  `;
  const body = `
    <div class="scene center on" id="s1">
      <div class="big pop" id="l1">Every photo on this app <span class="red">dies.</span></div>
      <div class="big pop cyan" id="l2">Unless strangers save it.</div>
    </div>
    <div class="scene" id="s2">
      <div class="photo" id="ph"><img src="${esc(post.media_url)}"></div>
      <div class="shade"></div>
      <div class="life"><div class="label"><span>⏳</span><span id="left"></span><span>left</span></div>
        <div class="bar"><div class="fill" id="fill"></div></div></div>
      <div class="meta"><div class="who">${where}</div><div class="title">${esc(post.title || "Untitled")}</div></div>
      <div class="tap pop" id="tap">⚡ SAVE IT</div>
    </div>
    <div class="scene center end" id="s3">
      <div class="big pop" id="e1">Go save it 👉</div>
      <div class="url pop" id="e2">pixsup.com</div>
      <div class="sub pop" id="e3">Every post dies.<br>Unless people keep it alive.</div>
    </div>`;
  const script = `
    let left = ${Math.round(remainingMs)};
    const span = ${lifeSpan};
    const clock = ${clock.toString()};
    const draw = () => {
      $("#left").textContent = clock(left);
      $("#fill").style.width = Math.max(3, Math.min(100, (left / span) * 100)) + "%";
      if (left < 10 * 60e3) $("#fill").style.background = "#ef4444";
    };
    draw();
    setInterval(() => { left -= 1000; draw(); }, 1000);
    play([
      [0.25, () => on("#l1")],
      [1.3, () => on("#l2")],
      [2.7, () => { off("#s1"); on("#s2"); on("#ph"); cap("This photo is on the clock ⏳"); }],
      [6.0, () => cap("When it hits zero, it's gone forever")],
      [8.8, () => { cap("Will anyone save it?", "redbg"); on("#tap"); }],
      [11.6, () => { cap(""); off("#s2"); on("#s3"); on("#e1"); }],
      [12.2, () => on("#e2")],
      [12.8, () => on("#e3")],
    ], 15.2);
  `;
  return page(css, body, script);
}

// 📸 "Today's challenge": the real prompt and any real entries
export function challengeVideo({ challenge, entries }) {
  const shown = entries.slice(0, 4);
  const css = `
    .kicker{font-size:15px;font-weight:900;letter-spacing:.14em;color:#fb923c}
    .prompt{font-size:29px;font-weight:900;line-height:1.2}
    .prompt .w{opacity:0;display:inline-block;transform:translateY(8px);transition:all .25s}
    .prompt .w.on{opacity:1;transform:none}
    .tag{font-size:20px;font-weight:900;color:#22d3ee;background:rgba(34,211,238,.12);border:2px solid rgba(34,211,238,.45);
      padding:6px 14px;border-radius:999px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;padding:0 14px}
    .grid.g1{grid-template-columns:1fr;padding:0 34px}
    .grid.g1 img{aspect-ratio:4/5}
    .grid.g3 img:last-child{grid-column:1/3;aspect-ratio:2/1}
    .grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,.12)}
    .grid .pop{transition-duration:.5s}
    .cam{font-size:96px;animation:bob 1.2s ease-in-out infinite}
    @keyframes bob{50%{transform:translateY(-10px) rotate(-6deg)}}
  `;
  const words = esc(challenge.prompt).split(" ").map((w) => `<span class="w">${w}</span>`).join(" ");
  const middle = shown.length
    ? `<div class="sub pop" id="m1">${shown.length === 1 ? "The first entry 👇" : "Entries so far 👇"}</div>
       <div class="grid g${shown.length}">${shown.map((p, i) => `<img class="pop" id="g${i}" src="${esc(p.media_url)}">`).join("")}</div>`
    : `<div class="cam pop" id="m1">📸</div>
       <div class="big pop" id="g0">Nobody has entered yet.</div>
       <div class="big pop cyan" id="g1">Be the first ✨</div>`;
  const body = `
    <div class="scene center on" id="s1">
      <div class="kicker pop" id="k">TODAY'S PHOTO CHALLENGE 📸</div>
      <div class="prompt">${words}</div>
      <div class="tag pop" id="tg">${esc(challenge.tag)}</div>
    </div>
    <div class="scene center" id="s2">${middle}</div>
    <div class="scene center end" id="s3">
      <div class="sub pop" id="e0">One photo. 24 hours.<br>The crowd decides what lives.</div>
      <div class="brand pop" id="e1">Pixsup</div>
      <div class="url pop" id="e2">pixsup.com</div>
    </div>`;
  const n = shown.length || 2;
  const script = `
    const ws = [...document.querySelectorAll(".w")];
    const steps = [[0.2, () => on("#k")]];
    ws.forEach((w, i) => steps.push([0.7 + i * 0.16, () => w.classList.add("on")]));
    const after = 0.7 + ws.length * 0.16 + 0.3;
    steps.push([after, () => on("#tg")]);
    const s2 = Math.max(after + 1.6, 4.2);
    steps.push([s2, () => { off("#s1"); on("#s2"); on("#m1"); }]);
    for (let i = 0; i < ${n}; i++) steps.push([s2 + 0.6 + i * 0.45, () => on("#g" + i)]);
    const s3 = s2 + 5.2;
    steps.push([s3, () => { off("#s2"); on("#s3"); on("#e0"); }]);
    steps.push([s3 + 0.7, () => on("#e1")]);
    steps.push([s3 + 1.2, () => on("#e2")]);
    play(steps, s3 + 3.6);
  `;
  return page(css, body, script);
}
