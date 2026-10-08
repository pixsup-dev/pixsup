import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Image } from "@/components/ui/image";
import { X, Hourglass, ExternalLink, Bookmark } from "lucide-react";
import { categoryFor } from "@/components/CategoryChips";
import ShareButton from "@/components/ShareButton";
import PostActionMenu from "@/components/PostActionMenu";
import useSavedPosts from "@/hooks/useSavedPosts";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import { formatRemaining } from "@/lib/time";
import useUsernames from "@/hooks/useUsernames";
import BoostPanel from "@/components/BoostPanel";
import { moodSummary, reactionPalette } from "@/lib/reactions";

export default function PostDetail({ post, onClose, onVote, onReact, onSignIn }) {
  useBodyScrollLock();
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState([]);
  const names = useUsernames([post.created_by_id, ...comments.map((c) => c.created_by_id)]);
  const [text, setText] = useState("");
  const [voted, setVoted] = useState(false);
  const [current, setCurrent] = useState(post);
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();
  const { isSaved, toggleSave } = useSavedPosts();

  const palette = reactionPalette(current);
  const mood = current.isNews ? moodSummary(current.reactions) : null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadComments = async () => {
    try {
      const c = await base44.entities.Comment.filter({ post_id: post.id });
      setComments(c);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadComments();
  }, [post.id]);

  const vote = async () => {
    if (voted) return;
    const updates = await onVote(current);
    if (updates) {
      setVoted(true);
      setCurrent((c) => ({ ...c, ...updates }));
    }
  };

  const react = async (emoji) => {
    const updates = await onReact(current, emoji);
    if (updates) {
      setCurrent((c) => ({ ...c, ...updates }));
    }
  };

  const addComment = async () => {
    if (!text.trim()) return;
    try {
      // a comment adds +10 bonus minutes of life and bumps the engagement score
      // (add_comment saves the comment, updates the post and notifies its owner)
      const updated = await base44.rpc("add_comment", { p_post_id: post.id, p_text: text });
      setText("");
      const updates = { comment_count: updated.comment_count, expires_at: updated.expires_at };
      setCurrent((c) => ({ ...c, ...updates }));
      loadComments();
    } catch (e) {
      console.error(e);
    }
  };

  const remaining = current.expires_at
    ? Math.max(0, new Date(current.expires_at) - now)
    : 0;
  const timer = formatRemaining(remaining);
  const cat = categoryFor(current);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="no-scrollbar relative max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#151c28] shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white transition hover:bg-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          {current.media_type === "video" ? (
            <video
              src={current.media_url}
              controls
              autoPlay
              className="max-h-80 w-full bg-black object-contain"
            />
          ) : (
            <Image
              src={current.media_url}
              alt={current.title}
              fittingType="fill"
              className="aspect-[4/3] max-h-[42vh] w-full object-cover"
            />
          )}
        </div>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-cyan-800 bg-cyan-950/60 px-2.5 py-0.5 text-xs font-bold uppercase text-cyan-400">
              {cat || "Pixsup"}
            </span>
            <div className="flex items-center gap-2">
              <PostActionMenu post={current} />
              <button
                aria-label="Save post"
                onClick={() => toggleSave(current.id)}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${
                    isSaved(current.id) ? "fill-cyan-400 text-cyan-400" : ""
                  }`}
                />
              </button>
              <ShareButton
                post={current}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300 transition hover:border-cyan-400/40 hover:text-cyan-300"
              />
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-orange-400">
                <Hourglass className="h-3.5 w-3.5" /> {timer} remaining
              </span>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-200">
            {current.title || "Untitled"}
          </p>
          <p className="-mt-2 text-xs text-gray-400">
            {current.isNews
              ? `via ${current.guest_author_id || "the news"}`
              : names[current.created_by_id]
                ? `by @${names[current.created_by_id]}`
                : null}
            {current.saved_by_name && (
              <span className="ml-2 font-bold text-yellow-300">
                🦸 Saved by @{current.saved_by_name}
              </span>
            )}
          </p>
          {current.isNews && current.summary && (
            <p className="text-sm leading-relaxed text-gray-300">{current.summary}</p>
          )}
          {current.isNews && current.source_url && (
            <a
              href={current.source_url}
              target="_blank"
              rel="noreferrer"
              className="spring-tap flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 py-2 text-sm font-extrabold text-cyan-300 transition hover:bg-cyan-400/20 active:scale-95"
            >
              <ExternalLink className="h-4 w-4" /> Read the full story
              {current.guest_author_id ? ` at ${current.guest_author_id}` : ""}
            </a>
          )}

          <BoostPanel post={current} user={user} />

          <div className="flex justify-around gap-2 rounded-xl bg-white/5 p-2 text-lg">
            {palette.map((r) => (
              <button
                key={r}
                onClick={() => react(r)}
                className="spring-tap flex items-center gap-1 transition-transform hover:scale-125 active:scale-95"
              >
                <span>{r}</span>
                <span className="text-[10px] font-bold text-gray-400">
                  {(current.reactions || {})[r] || 0}
                </span>
              </button>
            ))}
          </div>

          {mood && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                How people feel
              </p>
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-white/5">
                {mood.map((m, i) => (
                  <div
                    key={m.emoji}
                    className={["bg-cyan-400", "bg-orange-400", "bg-violet-400"][i]}
                    style={{ width: `${m.pct}%` }}
                  />
                ))}
              </div>
              <p className="text-xs font-semibold text-gray-300">
                {mood.map((m) => `${m.pct}% ${m.emoji}`).join("  ·  ")}
              </p>
            </div>
          )}

          <button
            onClick={vote}
            disabled={voted}
            className="spring-tap w-full rounded-xl bg-gradient-to-r from-cyan-500 to-orange-500 py-2 text-sm font-extrabold text-black shadow-lg transition-all hover:from-cyan-400 hover:to-orange-400 active:scale-95 disabled:opacity-70"
          >
            ⚡ HIT POST ({current.hits || 0})
          </button>

          <div className="pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              Comments ({comments.length})
            </p>
            <div className="mb-3 space-y-2">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-200"
                >
                  <span className="mr-1.5 text-xs font-bold text-cyan-300">
                    @{names[c.created_by_id] || "member"}
                  </span>
                  {c.text}
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-xs text-gray-500">No comments yet</p>
              )}
            </div>
            {isAuthenticated ? (
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  onClick={addComment}
                  className="spring-tap rounded-xl bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 active:scale-95"
                >
                  Send
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                className="spring-tap w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 active:scale-95"
              >
                Sign in to comment
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}