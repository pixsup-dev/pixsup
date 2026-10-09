import React, { useEffect, useState } from "react";
import moment from "moment";
import { supabase } from "@/api/base44Client";

// Admins: crashes people ran into, most frequent first (from log_client_error)
export default function AppErrors() {
  const [errors, setErrors] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    supabase
      .from("client_errors")
      .select("*")
      .order("last_seen", { ascending: false })
      .limit(50)
      .then(({ data }) => setErrors(data || []), () => setErrors([]));
  }, []);

  return (
    <>
      <h2 className="mb-2 mt-8 text-xs font-bold uppercase tracking-widest text-red-400">⚠️ App errors</h2>
      {errors === null ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : errors.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-400">
          No errors reported. 🎉
        </p>
      ) : (
        <div className="space-y-1.5">
          {errors.map((e) => (
            <button
              key={e.id}
              onClick={() => setOpen(open === e.id ? null : e.id)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left"
            >
              <p className="flex items-start justify-between gap-2 text-xs font-bold text-gray-100">
                <span className="break-words">{e.message}</span>
                <span className="shrink-0 rounded-full bg-red-500/20 px-2 text-red-300">×{e.count}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                {e.url} · last {moment(e.last_seen).fromNow()} · first {moment(e.first_seen).fromNow()}
              </p>
              {open === e.id && (
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[10px] text-gray-300">
                  {e.user_agent}
                  {"\n\n"}
                  {e.stack || "(no stack)"}
                </pre>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
