// Home-screen app helpers: service worker registration, "is it installed?",
// and the browser's install prompt (Android/desktop Chrome only).

export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// On iPhone only Safari can add a site to the home screen
export const isIOSSafari = () => isIOS() && !/CriOS|FxiOS|EdgiOS|GSA\//.test(navigator.userAgent);

let deferredPrompt = null;
const listeners = new Set();

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

export const canPromptInstall = () => !!deferredPrompt;

export function onInstallAvailable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Shows the browser's install dialog; resolves true if they installed
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === "accepted";
}
