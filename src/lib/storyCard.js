import { formatRemaining } from "@/lib/time";
import { postUrl } from "@/lib/site";

const W = 1080;
const H = 1920;

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous"; // publishers that don't allow it fall back to no photo
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "…");
  }
  return lines;
}

// Draws the card; returns a canvas. withPhoto=false skips the post's photo
// (used when the publisher's image can't be exported).
async function draw(post, remainingMs, withPhoto) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const photo = withPhoto && post.media_type !== "video" ? await loadImage(post.media_url || post.thumbnail_url) : null;

  // Background: the photo, huge and darkened, or a brand gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0e7490");
  bg.addColorStop(0.5, "#0b0f17");
  bg.addColorStop(1, "#c2410c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (photo) {
    const s = Math.max(W / photo.width, H / photo.height) * 1.15;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(photo, (W - photo.width * s) / 2, (H - photo.height * s) / 2, photo.width * s, photo.height * s);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(11,15,23,0.55)";
    ctx.fillRect(0, 0, W, H);
  }

  // Logo
  ctx.textAlign = "center";
  ctx.font = "900 84px system-ui, -apple-system, Segoe UI, sans-serif";
  const pix = ctx.measureText("PIX").width;
  const sup = ctx.measureText("SUP").width;
  ctx.textAlign = "left";
  ctx.fillStyle = "#22d3ee";
  ctx.fillText("PIX", (W - pix - sup) / 2, 190);
  ctx.fillStyle = "#f97316";
  ctx.fillText("SUP", (W - pix - sup) / 2 + pix, 190);
  ctx.textAlign = "center";

  // The photo card
  const box = { x: 90, y: 270, w: W - 180, h: 980 };
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, 48);
  ctx.clip();
  ctx.fillStyle = "#151c28";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  if (photo) {
    const s = Math.max(box.w / photo.width, box.h / photo.height);
    ctx.drawImage(
      photo,
      box.x + (box.w - photo.width * s) / 2,
      box.y + (box.h - photo.height * s) / 2,
      photo.width * s,
      photo.height * s
    );
  } else {
    ctx.font = "260px system-ui, sans-serif";
    ctx.fillText(post.isNews ? "📰" : "📸", W / 2, box.y + box.h / 2 + 90);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, box.x, box.y, box.w, box.h, 48);
  ctx.stroke();

  // Countdown pill over the bottom of the photo
  const dying = remainingMs < 10 * 60 * 1000;
  const label = `⏳ ${formatRemaining(remainingMs)} left`;
  ctx.font = "900 92px ui-monospace, Menlo, Consolas, monospace";
  const pw = ctx.measureText(label).width + 110;
  ctx.fillStyle = dying ? "#dc2626" : "#f97316";
  roundRect(ctx, (W - pw) / 2, box.y + box.h - 75, pw, 150, 75);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, W / 2, box.y + box.h + 30);

  // Title
  ctx.font = "800 58px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#ffffff";
  wrap(ctx, post.title || "A post on Pixsup", W - 180, 2).forEach((l, i) => ctx.fillText(l, W / 2, 1420 + i * 72));

  // Call to action
  ctx.font = "900 70px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = dying ? "#f87171" : "#22d3ee";
  ctx.fillText(dying ? "Help! It's about to die." : "Keep it alive!", W / 2, 1640);
  ctx.font = "700 48px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#e5e7eb";
  ctx.fillText("Hit it on pixsup.com", W / 2, 1720);
  ctx.font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#9ca3af";
  ctx.fillText("Posts only live while people keep them alive", W / 2, 1790);

  return canvas;
}

const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

// The story card as a PNG blob (falls back to a no-photo card if the
// photo's server doesn't allow it to be exported)
export async function storyCardBlob(post) {
  const remaining = Math.max(0, new Date(post.expires_at).getTime() - Date.now());
  let blob = null;
  try {
    blob = await toBlob(await draw(post, remaining, true));
  } catch {
    blob = null;
  }
  return blob || toBlob(await draw(post, remaining, false));
}

// Makes the story card and opens the phone's share sheet (Instagram, WhatsApp,
// Snapchat stories…), or downloads it on computers. Returns "shared" | "downloaded".
export async function shareStoryCard(post) {
  const blob = await storyCardBlob(post);
  const file = new File([blob], "pixsup-story.png", { type: "image/png" });
  const url = postUrl(post.id);
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `Help keep this alive on Pixsup! ${url}` });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pixsup-story.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}
