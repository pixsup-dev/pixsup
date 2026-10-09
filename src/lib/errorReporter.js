import { supabase } from "@/api/base44Client";

// Sends crashes from people's browsers to Pixsup (log_client_error), so they
// show on the Admin page and in the hourly error email. Harmless noise from
// browser extensions, dropped connections and the like is ignored, and each
// page load reports at most 10 errors.
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network connection was lost/i,
  /AbortError|The operation was aborted/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];
const sent = new Set();

export function reportError(error, where = "") {
  try {
    const message = `${where ? `[${where}] ` : ""}${error?.message || String(error || "Unknown error")}`.slice(0, 300);
    const stack = String(error?.stack || "").slice(0, 2000);
    if (IGNORE.some((re) => re.test(message) || re.test(stack))) return;
    if (sent.has(message) || sent.size >= 10) return;
    sent.add(message);
    supabase
      .rpc("log_client_error", {
        p_message: message,
        p_stack: stack,
        p_url: window.location.pathname,
        p_user_agent: navigator.userAgent,
      })
      .then(() => {}, () => {});
  } catch {
    // reporting must never cause an error of its own
  }
}

export function installErrorReporter() {
  window.addEventListener("error", (e) => reportError(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, "promise"));
}
