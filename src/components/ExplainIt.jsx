import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

// "Explain it": a 3-sentence AI explainer for a news story, generated once
// per story and cached on the server.
export default function ExplainIt({ post }) {
  const [text, setText] = useState(post.explainer || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!post.isNews) return null;

  const explain = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await base44.functions.invoke("explainNews", { post_id: post.id });
      setText(data.explainer);
    } catch (e) {
      setError(e.message || "Couldn't explain this one right now.");
    } finally {
      setBusy(false);
    }
  };

  if (text) {
    return (
      <div className="rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
        <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-violet-300">
          <Sparkles className="h-3 w-3" /> Explained
        </p>
        <p className="text-sm leading-relaxed text-gray-200">{text}</p>
        <p className="mt-1.5 text-[10px] text-gray-500">
          Written by AI from the article. It can make mistakes, so read the full story for details.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={explain}
        disabled={busy}
        className="spring-tap flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/40 bg-violet-400/10 py-2 text-sm font-extrabold text-violet-200 transition hover:bg-violet-400/20 active:scale-95 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Explaining…" : "Explain it in 3 sentences"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
