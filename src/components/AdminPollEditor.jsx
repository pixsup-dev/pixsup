import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Admins only: put a poll on any post (e.g. a World Pulse story), or remove it.
// Replacing a poll resets its votes. The server re-checks the admin role.
export default function AdminPollEditor({ post, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["Yes", "No"]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const save = async (remove = false) => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    setBusy(true);
    try {
      await base44.rpc("admin_set_poll", {
        p_post_id: post.id,
        p_question: remove ? null : question.trim(),
        p_options: remove ? null : opts,
      });
      onUpdate?.(
        remove
          ? { poll: null, poll_counts: null }
          : { poll: { question: question.trim(), options: opts }, poll_counts: opts.map(() => 0) }
      );
      toast({ title: remove ? "Poll removed" : "Poll added" });
      setOpen(false);
    } catch (e) {
      toast({ title: e.message || "Couldn't save the poll", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-violet-400/30 px-2.5 py-1 text-[11px] font-bold text-violet-300 hover:bg-violet-400/10"
        >
          🛠 {post.poll ? "Replace poll" : "Add poll"} (admin)
        </button>
        {post.poll && (
          <button
            onClick={() => save(true)}
            disabled={busy}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-gray-400 hover:bg-white/5"
          >
            Remove poll
          </button>
        )}
      </div>
    );
  }

  const input =
    "w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-violet-400 focus:outline-none";

  return (
    <div className="space-y-1.5 rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
      <input
        value={question}
        maxLength={120}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Poll question, e.g. Should this be livestreamed?"
        className={input}
      />
      {options.map((o, i) => (
        <input
          key={i}
          value={o}
          maxLength={60}
          onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
          placeholder={`Option ${i + 1}`}
          className={input}
        />
      ))}
      <div className="flex flex-wrap gap-2 pt-1">
        {options.length < 4 && (
          <button
            onClick={() => setOptions([...options, ""])}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-gray-300"
          >
            + Option
          </button>
        )}
        <button
          onClick={() => save(false)}
          disabled={busy || !question.trim() || options.filter((o) => o.trim()).length < 2}
          className="rounded-lg bg-violet-500 px-3 py-1 text-[11px] font-extrabold text-white disabled:opacity-50"
        >
          Save poll
        </button>
        <button onClick={() => setOpen(false)} className="px-2 text-[11px] text-gray-400">
          Cancel
        </button>
      </div>
    </div>
  );
}
