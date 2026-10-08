import React, { useRef, useState } from "react";
import { MoreVertical, Flag, Ban, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useBlocklist, authorKeyOf } from "@/hooks/useBlocklist";
import { useToast } from "@/components/ui/use-toast";

const REASONS = ["Spam", "Inappropriate", "Harassment"];

export default function PostActionMenu({ post, className = "" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("Spam");
  const [sending, setSending] = useState(false);
  const btnRef = useRef(null);
  const { block } = useBlocklist();
  const { toast } = useToast();

  const toggle = (e) => {
    e.stopPropagation();
    if (open) return setOpen(false);
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - 150),
      left: Math.max(8, Math.min(r.right - 160, window.innerWidth - 168)),
    });
    setOpen(true);
  };

  const doBlock = (e) => {
    e.stopPropagation();
    block(authorKeyOf(post));
    toast({
      title: "User blocked",
      description: "Their posts are now hidden from your grid.",
    });
    setOpen(false);
  };

  const submitReport = async () => {
    setSending(true);
    try {
      await base44.entities.Flag.create({ post_id: post.id, reason });
      toast({
        title: "Report submitted",
        description: "Thanks — moderators will review this post.",
      });
      setReporting(false);
      setOpen(false);
    } catch (err) {
      toast({ title: "Could not submit report", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-gray-300 backdrop-blur-sm transition hover:text-white ${className}`}
        aria-label="Post actions"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            onPointerDown={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            className="fixed z-[60] w-40 overflow-hidden rounded-xl border border-white/10 bg-[#151c28] py-1 shadow-2xl"
            style={pos}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setReporting(true);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-gray-200 transition hover:bg-white/10"
            >
              <Flag className="h-3.5 w-3.5 text-red-400" /> Report Post
            </button>
            <button
              onClick={doBlock}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-gray-200 transition hover:bg-white/10"
            >
              <Ban className="h-3.5 w-3.5 text-orange-400" /> Block User
            </button>
          </div>
        </>
      )}

      {reporting && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-xs space-y-4 rounded-2xl border border-white/10 bg-[#151c28] p-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-cyan-400">Report Post</h4>
              <button
                onClick={() => setReporting(false)}
                className="text-gray-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400">Why are you reporting this post?</p>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full rounded-xl border px-3 py-2 text-xs font-bold transition ${
                    reason === r
                      ? "border-cyan-400 bg-cyan-400/10 text-cyan-300"
                      : "border-white/10 bg-white/5 text-gray-300 hover:border-cyan-400/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={submitReport}
              disabled={sending}
              className="spring-tap w-full rounded-xl bg-orange-500 py-2 text-xs font-extrabold text-black transition hover:bg-orange-400 active:scale-95 disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              ) : (
                "Submit Report"
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}