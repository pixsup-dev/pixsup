import { base44 } from "@/api/base44Client";
import { isIOS, isStandalone } from "@/lib/pwa";

// Phone alerts (web push). The public key pairs with the VAPID private key
// stored as a Supabase secret; it's meant to be public.
const VAPID_PUBLIC_KEY = "BA5LueV_qEbF7VRA_M6uQ_KYLYkJO6W77CaCbdGQJuzRuO8OWl9guyqVcVSmoYadS0Wdj6T6qm4OKV63BYYg3-Y";

const toBytes = (base64) => {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

// "ok" | "install" (iPhone: add to home screen first) | "unsupported" | "blocked"
export function pushSupport() {
  if (isIOS() && !isStandalone()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ok";
}

export async function pushEnabled() {
  if (pushSupport() !== "ok") return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription()) && Notification.permission === "granted";
}

// Asks permission (must be called from a tap) and saves this device
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "blocked" : "dismissed");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }));
  const { endpoint, keys } = sub.toJSON();
  await base44.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: navigator.userAgent,
  });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await base44.rpc("remove_push_subscription", { p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
