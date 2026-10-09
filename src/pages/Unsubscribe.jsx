import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// One-click unsubscribe from the Morning Pulse email (no sign-in needed)
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const [state, setState] = useState("working"); // working | done | invalid

  useEffect(() => {
    const token = params.get("t");
    if (!token) return setState("invalid");
    base44
      .rpc("unsubscribe_morning_pulse", { p_token: token })
      .then((ok) => setState(ok ? "done" : "invalid"))
      .catch(() => setState("invalid"));
  }, [params]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm items-center px-4">
      <div className="w-full rounded-2xl border border-white/10 bg-[#151c28] p-6 text-center">
        {state === "working" && <Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-400" />}
        {state === "done" && (
          <>
            <p className="mb-2 text-3xl">👋</p>
            <h1 className="mb-1 text-lg font-black text-white">You're unsubscribed</h1>
            <p className="text-xs text-gray-400">
              No more Morning Pulse emails. You can turn them back on any time in Settings.
            </p>
          </>
        )}
        {state === "invalid" && (
          <>
            <h1 className="mb-1 text-lg font-black text-white">That link didn't work</h1>
            <p className="text-xs text-gray-400">
              Turn the Morning Pulse email off in Settings instead.
            </p>
          </>
        )}
        <Link to="/" className="mt-4 inline-block rounded-xl bg-cyan-400 px-4 py-2 text-xs font-extrabold text-black">
          Back to Pixsup
        </Link>
      </div>
    </main>
  );
}
