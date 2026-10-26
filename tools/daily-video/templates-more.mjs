// More video designs: a how-to, Pixsup vs other apps, and the Graveyard.
// Same rules as templates.mjs: 360×640 pages that play their own timeline.
import { esc, page } from "./templates.mjs";

// Minutes → "1 hour", "90 minutes", "2 hours"
const span = (m) => (m % 60 === 0 ? (m === 60 ? "1 hour" : `${m / 60} hours`) : `${m} minutes`);

// 👆 "How to save a post in 3 seconds": the real save rule, on a real photo
export function howtoVideo({ post, rules }) {
  const back = esc(span(Number(rules.rescue_minutes) || 60));
  const css = `
    .photo{position:absolute;inset:0;background:#000}
    .photo img{width:100%;height:100%;object-fit:cover;transform:scale(1.04);transition:transform 10s linear}
    .photo.on img{transform:scale(1.14)}
    .shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.6),transparent 30%,transparent 60%,rgba(0,0,0,.85))}
    .life{position:absolute;left:16px;right:16px;top:22px;z-index:4}
    .life .label{font-size:18px;font-weight:900;margin-bottom:6px;text-shadow:0 2px 6px #000}
    .life .bar{height:9px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}
    .life .fill{height:100%;width:2%;border-radius:9px;background:#ef4444;transition:width .6s cubic-bezier(.2,1.2,.4,1),background .3s}
    .step{position:absolute;left:16px;top:150px;z-index:5;background:#22d3ee;color:#04111a;font-size:15px;font-weight:900;
      padding:5px 12px;border-radius:999px;opacity:0;transition:opacity .3s}
    .step.on{opacity:1}
    .tapdot{position:absolute;left:50%;top:52%;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;
      background:rgba(255,255,255,.55);border:4px solid #fff;z-index:6;opacity:0}
    .tapdot.go{animation:tap .45s ease-out 2}
    @keyframes tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
    .bolt{position:absolute;left:50%;top:52%;font-size:120px;z-index:6;opacity:0}
    .bolt.go{animation:bolt .9s cubic-bezier(.2,1.5,.4,1) forwards}
    @keyframes bolt{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}30%{transform:translate(-50%,-50%) scale(1.3);opacity:1}
      100%{transform:translate(-50%,-90%) scale(1);opacity:0}}
    .chip{position:absolute;left:16px;bottom:40px;z-index:5;background:rgba(0,0,0,.75);color:#fde047;font-size:18px;font-weight:900;
      padding:8px 14px;border-radius:999px}
    .gain{display:inline-block;margin-left:8px;background:#22d3ee;color:#04111a;font-size:14px;padding:2px 9px;border-radius:999px;
      opacity:0;transform:scale(.5);transition:all .35s cubic-bezier(.2,1.5,.4,1)}
    .gain.on{opacity:1;transform:none}
  `;
  const body = `
    <div class="scene center on" id="s1">
      <div class="big pop" id="l1">How to save a post</div>
      <div class="big pop cyan" id="l2">in 3 seconds ⚡</div>
    </div>
    <div class="scene" id="s2">
      <div class="photo" id="ph"><img src="${esc(post.media_url)}"></div>
      <div class="shade"></div>
      <div class="life"><div class="label"><span id="lbl">🚨 0:45 left</span><span class="gain" id="gain">+${back}</span></div>
        <div class="bar"><div class="fill" id="fill"></div></div></div>
      <div class="step" id="st"></div>
      <div class="tapdot" id="tap"></div>
      <div class="bolt" id="bolt">⚡</div>
      <div class="chip pop" id="chip">🦸 Saved by @you</div>
    </div>
    <div class="scene center end" id="s3">
      <div class="sub pop" id="e0">No followers needed.<br>Just save what you love.</div>
      <div class="brand pop" id="e1">Pixsup</div>
      <div class="url pop" id="e2">pixsup.com</div>
    </div>`;
  const script = `
    let secs = 45, saved = false;
    setInterval(() => {
      if (saved) return;
      secs--;
      $("#lbl").textContent = "🚨 0:" + String(Math.max(secs, 0)).padStart(2, "0") + " left";
    }, 1000);
    const step = (n, t) => { const s = $("#st"); s.classList.add("on"); s.textContent = n; cap(t); };
    play([
      [0.2, () => on("#l1")],
      [0.9, () => on("#l2")],
      [2.3, () => { off("#s1"); on("#s2"); on("#ph"); step("STEP 1", "Find a post that's dying 🚨"); }],
      [5.0, () => step("STEP 2", "Double-tap it ⚡")],
      [6.0, () => $("#tap").classList.add("go")],
      [6.5, () => {
        saved = true;
        $("#bolt").classList.add("go");
        $("#fill").style.width = "100%";
        $("#fill").style.background = "linear-gradient(90deg,#22d3ee,#34d399)";
        $("#lbl").textContent = "⏳ ${back} left";
        on("#gain");
      }],
      [7.2, () => step("STEP 3", "Saved. Back to ${back} ✅")],
      [9.6, () => { cap("And your name goes on it"); on("#chip"); }],
      [12.0, () => { cap(""); off("#s2"); on("#s3"); on("#e0"); }],
      [12.7, () => on("#e1")],
      [13.2, () => on("#e2")],
    ], 15.6);
  `;
  return page(css, body, script);
}

// ⚔️ "Pixsup vs other apps": what makes it different, over real photos
export function versusVideo({ photos }) {
  const rows = [
    ["Follower counts decide who gets seen", "No followers. The crowd decides"],
    ["Posts stay up forever", "Every post dies unless people care"],
    ["An algorithm picks for you", "You keep the good stuff alive"],
    ["New people get buried", "New faces get seen first 🌱"],
  ];
  const css = `
    .mosaic{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;filter:blur(2px) brightness(.32)}
    .mosaic img{width:100%;height:100%;object-fit:cover}
    .vs{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 18px;z-index:2}
    .head{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center;font-size:17px;font-weight:900;margin-bottom:4px}
    .head .them{color:#9ca3af}.head .us{color:#22d3ee}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .row div{border-radius:12px;padding:9px 10px;font-size:14px;font-weight:800;line-height:1.25}
    .row .them{background:rgba(255,255,255,.07);color:#9ca3af}
    .row .us{background:rgba(34,211,238,.16);border:1.5px solid rgba(34,211,238,.5);color:#fff}
    .row .them:before{content:"✕ ";color:#f87171}
    .row .us:before{content:"✓ ";color:#4ade80}
    .title{font-size:30px;font-weight:900;text-align:center;line-height:1.15;margin-bottom:10px}
  `;
  const mosaic = photos.slice(0, 8).map((p) => `<img src="${esc(p.media_url)}">`).join("");
  const body = `
    <div class="mosaic">${mosaic}</div>
    <div class="scene on" id="s1"><div class="vs">
      <div class="title pop" id="t">Other apps vs <span class="cyan">Pixsup</span></div>
      <div class="head pop" id="h"><span class="them">Other apps</span><span class="us">Pixsup</span></div>
      ${rows
        .map(([a, b], i) => `<div class="row pop" id="r${i}"><div class="them">${esc(a)}</div><div class="us">${esc(b)}</div></div>`)
        .join("")}
    </div></div>
    <div class="scene center end" id="s3">
      <div class="big pop" id="e0">Post something worth<br>keeping alive.</div>
      <div class="brand pop" id="e1">Pixsup</div>
      <div class="url pop" id="e2">pixsup.com</div>
    </div>`;
  const script = `
    play([
      [0.2, () => on("#t")],
      [1.0, () => on("#h")],
      [1.8, () => on("#r0")],
      [3.6, () => on("#r1")],
      [5.4, () => on("#r2")],
      [7.2, () => on("#r3")],
      [10.4, () => { off("#s1"); on("#s3"); on("#e0"); }],
      [11.1, () => on("#e1")],
      [11.6, () => on("#e2")],
    ], 14.2);
  `;
  return page(css, body, script);
}

// 🪦 "Graveyard roll call": real posts that died today, and how long they lived
export function graveyardVideo({ dead }) {
  const shown = dead.slice(0, 4);
  const lived = (p) => {
    const m = Math.max(1, Math.round((new Date(p.expires_at) - new Date(p.created_date)) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m} min`;
  };
  const css = `
    .card{position:absolute;inset:0;opacity:0;transition:opacity .4s}
    .card.on{opacity:1}
    .card img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) brightness(.62) contrast(1.05);transform:scale(1.03);transition:transform 4s linear}
    .card.on img{transform:scale(1.12)}
    .card .info{position:absolute;left:0;right:0;bottom:0;padding:120px 20px 40px;background:linear-gradient(to top,rgba(0,0,0,.92),transparent)}
    .rip{font-size:44px;font-weight:900;letter-spacing:.06em;color:#e5e7eb}
    .ptitle{font-size:22px;font-weight:900;line-height:1.2;margin:4px 0 8px}
    .stats{font-size:15px;font-weight:800;color:#9ca3af}
    .stone{font-size:90px}
  `;
  const body = `
    <div class="scene center on" id="s1">
      <div class="stone pop" id="i0">🪦</div>
      <div class="big pop" id="i1">These posts died today.</div>
      <div class="big pop red" id="i2">Gone forever.</div>
    </div>
    ${shown
      .map(
        (p, i) => `<div class="card" id="c${i}"><img src="${esc(p.media_url)}"><div class="info">
          <div class="rip">R.I.P.</div><div class="ptitle">${esc(p.title || "Untitled")}</div>
          <div class="stats">Lived ${lived(p)} · ⚡ ${p.hits || 0} hit${p.hits === 1 ? "" : "s"}</div></div></div>`
      )
      .join("")}
    <div class="scene center end" id="s3">
      <div class="big pop" id="e0">Don't let the good ones die.</div>
      <div class="url pop" id="e1">pixsup.com</div>
      <div class="sub pop" id="e2">Every post dies.<br>Unless people keep it alive.</div>
    </div>`;
  const script = `
    const n = ${shown.length};
    const steps = [[0.2, () => on("#i0")], [0.8, () => on("#i1")], [1.6, () => on("#i2")]];
    for (let i = 0; i < n; i++) {
      steps.push([3.0 + i * 2.6, () => { if (i === 0) off("#s1"); else off("#c" + (i - 1)); on("#c" + i); }]);
    }
    const end = 3.0 + n * 2.6;
    steps.push([end, () => { off("#c" + (n - 1)); on("#s3"); on("#e0"); }]);
    steps.push([end + 0.6, () => on("#e1")]);
    steps.push([end + 1.1, () => on("#e2")]);
    play(steps, end + 3.4);
  `;
  return page(css, body, script);
}
