import React, { useEffect, useState } from "react";
import { BellRing, Loader2, Share } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { disablePush, enablePush, pushEnabled, pushSupport } from "@/lib/push";
import { canPromptInstall, promptInstall } from "@/lib/pwa";

// Settings: switch phone alerts on or off for this device
export default function AlertsSection() {
  const { toast } = useToast();
  const [support, setSupport] = useState(() => pushSupport());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushEnabled().then(setOn, () => setOn(false));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        toast({ title: "Alerts turned off on this device" });
      } else {
        await enablePush();
        setOn(true);
        toast({ title: "Alerts on 🔔", description: "We'll tell you when a post of yours needs saving." });
      }
    } catch (e) {
      if (e?.message === "blocked") setSupport("blocked");
      else if (e?.message !== "dismissed") {
        console.error(e);
        toast({ title: "Couldn't turn on alerts", description: "Please try again.", variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-400">📲 Phone alerts</h2>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1 text-xs font-bold text-gray-200">
              <BellRing className="h-3.5 w-3.5 text-orange-400" /> Alerts on this device
            </p>
            <p className="text-[11px] text-gray-400">
              When your post has a few minutes left, gets rescued, starts trending or gets a comment.
              Never for every single hit.
            </p>
          </div>
          {support === "ok" && (
            <button
              role="switch"
              aria-checked={on}
              onClick={toggle}
              disabled={busy}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-orange-500" : "bg-white/15"}`}
            >
              <span
                className={`absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white transition-all ${
                  on ? "left-[22px]" : "left-0.5"
                }`}
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin text-gray-500" />}
              </span>
            </button>
          )}
        </div>

        {support === "install" && (
          <p className="mt-3 rounded-xl bg-cyan-400/10 p-3 text-[11px] leading-relaxed text-cyan-100">
            On iPhone, alerts work once Pixsup is on your home screen: in Safari tap{" "}
            <Share className="mx-0.5 inline h-3.5 w-3.5 -translate-y-0.5" /> <b>Share</b>, then{" "}
            <b>“Add to Home Screen”</b>. Open Pixsup from that icon and switch alerts on here.
          </p>
        )}
        {support === "unsupported" && (
          <p className="mt-3 text-[11px] text-gray-400">This browser can't show alerts. Try Chrome or Safari.</p>
        )}
        {support === "blocked" && (
          <p className="mt-3 rounded-xl bg-orange-400/10 p-3 text-[11px] leading-relaxed text-orange-100">
            Alerts are blocked for Pixsup. Allow notifications for pixsup.com in your phone or browser
            settings, then come back here.
          </p>
        )}
        {support === "ok" && canPromptInstall() && (
          <button onClick={promptInstall} className="mt-3 text-[11px] font-bold text-cyan-300 hover:underline">
            📲 Install Pixsup on this device
          </button>
        )}
      </div>
    </section>
  );
}
