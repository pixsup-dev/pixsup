// Cloudflare Turnstile: proves a person (not a script) is signing up, logging
// in or resetting a password. Supabase checks the token when CAPTCHA
// protection is on (Authentication → Attack Protection). Usually invisible;
// a checkbox appears only when Cloudflare isn't sure.
// The site key is public by design; the secret key lives only in Supabase.
const SITE_KEY = "";

let scriptPromise = null;

function loadTurnstile() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the security check. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Starts loading early (e.g. when a sign-in form opens) so the check is quick
export function preloadCaptcha() {
  if (SITE_KEY) loadTurnstile().catch(() => {});
}

// A fresh one-time token, or undefined while Turnstile isn't set up
export async function captchaToken() {
  if (!SITE_KEY) return undefined;
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);z-index:200";
    document.body.appendChild(box);
    let id = null;
    const done = (fn, value) => {
      clearTimeout(timer);
      try {
        if (id !== null) turnstile.remove(id);
      } catch {
        // already gone
      }
      box.remove();
      fn(value);
    };
    const fail = () => done(reject, new Error("The security check didn't work. Please try again."));
    const timer = setTimeout(fail, 90 * 1000);
    id = turnstile.render(box, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      theme: "dark",
      callback: (token) => done(resolve, token),
      "error-callback": fail,
      "timeout-callback": fail,
    });
  });
}
