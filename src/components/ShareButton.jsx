import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Share2, X, Link2, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { postUrl } from "@/lib/site";
import { shareStoryCard } from "@/lib/storyCard";

// Phones: the phone's own share sheet (every installed app). Computers: a
// menu of one-tap social links, copy link, and the story card download.
const isPhone = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !!navigator.share;

const enc = encodeURIComponent;

const TARGETS = [
  { name: "WhatsApp", icon: "💬", color: "bg-[#25D366]", href: (u, t) => `https://wa.me/?text=${enc(`${t} ${u}`)}` },
  { name: "X", icon: "𝕏", color: "bg-black border border-white/20", href: (u, t) => `https://twitter.com/intent/tweet?text=${enc(t)}&url=${enc(u)}` },
  { name: "Facebook", icon: "f", color: "bg-[#1877F2]", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { name: "Reddit", icon: "👽", color: "bg-[#FF4500]", href: (u, t) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t)}` },
  { name: "Telegram", icon: "✈️", color: "bg-[#229ED9]", href: (u, t) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { name: "Email", icon: "✉️", color: "bg-gray-600", href: (u, t) => `mailto:?subject=${enc(t)}&body=${enc(`${t}\n\n${u}`)}` },
];

function ShareMenu({ post, onClose }) {
  const { toast } = useToast();
  const [making, setMaking] = useState(false);
  const url = postUrl(post.id);
  const text = post.title ? `${post.title} — keep it alive on Pixsup` : "Keep this alive on Pixsup";

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: url });
      onClose();
    } catch {
      toast({ title: "Couldn't copy the link", description: url, variant: "destructive" });
    }
  };

  const story = async () => {
    setMaking(true);
    try {
      const how = await shareStoryCard(post);
      if (how === "downloaded") {
        toast({ title: "Story card saved", description: "Post it to Instagram, TikTok or Snapchat stories." });
      }
      onClose();
    } catch {
      toast({ title: "Couldn't make the story card", variant: "destructive" });
    } finally {
      setMaking(false);
    }
  };

  return createPortal(
    // React passes portal events up to the tile underneath: stop them here so
    // using the menu doesn't also open the post or start a long-press
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151c28] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-white">Share this post</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {TARGETS.map((t) => (
            <a
              key={t.name}
              href={t.href(url, text)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setTimeout(onClose, 300)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition hover:bg-white/5"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-black text-white ${t.color}`}>
                {t.icon}
              </span>
              <span className="text-[11px] font-semibold text-gray-300">{t.name}</span>
            </a>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={story}
            disabled={making}
            className="spring-tap flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 py-2.5 text-sm font-extrabold text-fuchsia-200 transition hover:bg-fuchsia-500/20 disabled:opacity-60"
          >
            {making ? <Loader2 className="h-4 w-4 animate-spin" /> : "📷"} Story card for Instagram, TikTok & Snapchat
          </button>
          <div className="flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300"
            />
            <button
              onClick={copy}
              className="spring-tap flex shrink-0 items-center gap-1 rounded-xl bg-cyan-400 px-3 text-xs font-extrabold text-black"
            >
              <Link2 className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// Shows a share icon unless children (e.g. a label) are given.
export default function ShareButton({ post, className, children }) {
  const [open, setOpen] = useState(false);

  const share = async (e) => {
    e.stopPropagation();
    if (isPhone()) {
      try {
        await navigator.share({
          title: post.title || "Pixsup",
          text: post.title || "Check this out on Pixsup",
          url: postUrl(post.id),
        });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return; // they closed the share sheet
      }
    }
    setOpen(true);
  };

  return (
    <>
      <button onClick={share} title="Share" aria-label="Share" className={className}>
        {children || <Share2 className="h-3 w-3" />}
      </button>
      {open && <ShareMenu post={post} onClose={() => setOpen(false)} />}
    </>
  );
}
