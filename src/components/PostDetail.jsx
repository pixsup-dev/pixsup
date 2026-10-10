import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Image } from "@/components/ui/image";
import { X, Hourglass, ExternalLink, Bookmark, ChevronUp, ChevronDown } from "lucide-react";
import { categoryFor } from "@/components/CategoryChips";
import ShareButton from "@/components/ShareButton";
import PostActionMenu from "@/components/PostActionMenu";
import useSavedPosts from "@/hooks/useSavedPosts";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import { formatRemaining } from "@/lib/time";
import { useMembers } from "@/hooks/useUsernames";
import Avatar from "@/components/Avatar";
import WatchButton from "@/components/WatchButton";
import BoostPanel from "@/components/BoostPanel";
import EmojiBurst from "@/components/EmojiBurst";
import { isBreaking } from "@/lib/breaking";
import ExplainIt from "@/components/ExplainIt";
import StoryCardButton from "@/components/StoryCardButton";
import useMoodTrends, { moodLabel } from "@/hooks/useMoodTrends";
import LastBreath, { inLastBreath } from "@/components/LastBreath";
import PollCard from "@/components/PollCard";
import LiveChat from "@/components/LiveChat";
import AdminPollEditor from "@/components/AdminPollEditor";
import { useBlocklist } from "@/hooks/useBlocklist";
import { moodSummary, reactionPalette } from "@/lib/reactions";

// One post's card. PostDetail (below) slides between these when people swipe.
function PostCard({ post, onClose, onVote, onReact, onSignIn, dir = 0, onSwipe }) {
  const { user, isAuthenticated } = useAuth();
  const touch = useRef({ x: 0, y: 0 });
  const wheel = useRef({ sum: 0, timer: null, locked: false });
  const [comments, setComments] = useState([]);
  const members = useMembers([post.created_by_id, ...comments.map((c) => c.created_by_id)]);
  const names = Object.fromEntries(Object.entries(members).map(([id, m]) => [id, m.username]));
  const [text, setText] = useState("");
  const [voted, setVoted] = useState(false);
  const [current, setCurrent] = useState(post);
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();
  const { isSaved, toggleSave } = useSavedPosts();
  const { blocked } = useBlocklist();
  const [tab, setTab] = useState("comments");
  const [hereNow, setHereNow] = useState(0);
  const [myCommentVotes, setMyCommentVotes] = useState(() => new Set());
  const merge = (updates) => setCurrent((c) => ({ ...c, ...updates }));

  const palette = reactionPalette(current);
  const rising = moodLabel(useMoodTrends([post.id])[post.id]);
  const mood = current.isNews ? moodSummary(current.reactions) : null;

  // Live counts: other people's hits, reactions and comments arrive via the feed
  useEffect(() => {
    setCurrent((c) => (c.id === post.id ? { ...c, ...post } : post));
  }, [post]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadComments = async () => {
    try {
      const c = await base44.entities.Comment.filter({ post_id: post.id });
      setComments(c);
      if (user && c.length) {
        const mine = await base44.entities.CommentVote.filter(
          { comment_id: c.map((x) => x.id), user_id: user.id },
          undefined,
          1000
        );
        setMyCommentVotes(new Set(mine.map((v) => v.comment_id)));
      }
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

  const [sendingComment, setSendingComment] = useState(false);
  const addComment = async () => {
    if (!text.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      // postText runs the AI check, then add_comment saves the comment, adds
      // +10 minutes of life and notifies the owner
      const { data: updated } = await base44.functions.invoke("postText", {
        kind: "comment",
        post_id: post.id,
        text,
      });
      setText("");
      const updates = { comment_count: updated.comment_count, expires_at: updated.expires_at };
      setCurrent((c) => ({ ...c, ...updates }));
      loadComments();
    } catch (e) {
      toast({ title: e.message || "Couldn't post your comment", variant: "destructive" });
    } finally {
      setSendingComment(false);
    }
  };

  // 🔥 a comment; the most-voted one becomes the post's Hot Take
  const voteComment = async (c) => {
    if (!isAuthenticated) return onSignIn?.();
    if (myCommentVotes.has(c.id) || c.created_by_id === user?.id) return;
    setMyCommentVotes((prev) => new Set(prev).add(c.id));
    try {
      const votes = await base44.rpc("vote_comment", { p_comment_id: c.id });
      if (votes != null) {
        setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, votes } : x)));
      }
    } catch (e) {
      toast({ title: e.message || "Couldn't vote", variant: "destructive" });
    }
  };
  const shownComments = comments
    .filter((c) => !blocked.includes(c.created_by_id))
    .sort(
      (a, b) =>
        (b.votes || 0) - (a.votes || 0) ||
        new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
    );
  const hotTakeId = shownComments[0]?.votes > 0 ? shownComments[0].id : null;

  const remaining = current.expires_at
    ? Math.max(0, new Date(current.expires_at) - now)
    : 0;
  const timer = formatRemaining(remaining);
  const cat = categoryFor(current);

  return (
      <motion.div
        // Opening: a gentle pop. Switching posts: a short slide with no fade, so
        // the screen never flashes dark between posts
        initial={dir ? { y: dir * 40 } : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={dir ? { type: "tween", ease: "easeOut", duration: 0.18 } : { type: "spring", stiffness: 300, damping: 28 }}
        // Phones: photo on top, everything scrolls. Computers: big photo on the
        // left, details and comments scrolling on the right.
        className="no-scrollbar relative max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#151c28] shadow-2xl md:flex md:h-[88vh] md:max-w-6xl md:overflow-hidden"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-30 rounded-full bg-black/60 p-2 text-white transition hover:bg-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div
          className="relative touch-pan-x bg-black md:h-full md:min-w-0 md:flex-1"
          // swipe up on the photo for the next post, down for the previous one
          onTouchStart={(e) => {
            touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            const dx = t.clientX - touch.current.x;
            const dy = t.clientY - touch.current.y;
            if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) onSwipe?.(dy < 0 ? 1 : -1);
          }}
          // computers: the mouse wheel or trackpad over the photo moves between
          // posts (one post per scroll gesture)
          onWheel={(e) => {
            if (!onSwipe || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
            wheel.current.sum += e.deltaY;
            clearTimeout(wheel.current.timer);
            wheel.current.timer = setTimeout(() => (wheel.current = { sum: 0, timer: null, locked: false }), 250);
            if (!wheel.current.locked && Math.abs(wheel.current.sum) > 60) {
              wheel.current.locked = true;
              onSwipe(wheel.current.sum > 0 ? 1 : -1);
            }
          }}
        >
          <EmojiBurst post={current} size="text-3xl" />
          {inLastBreath(current, remaining) && <LastBreath remaining={remaining} big />}
          {current.media_type === "video" ? (
            <video
              src={current.media_url}
              controls
              autoPlay
              className="max-h-80 w-full bg-black object-contain md:h-full md:max-h-none"
            />
          ) : (
            // The whole picture, never cropped: tall or wide photos sit on a
            // blurred copy of themselves instead of being zoomed to fill
            <div className="relative flex h-[42vh] max-h-[440px] items-center justify-center overflow-hidden bg-black md:h-full md:max-h-none">
              <img
                src={current.media_url}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
              />
              <Image
                src={current.media_url}
                alt={current.title}
                fittingType="fit"
                className="relative h-full w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className="no-scrollbar space-y-3 p-4 md:w-[400px] md:shrink-0 md:overflow-y-auto md:overscroll-contain md:border-l md:border-white/10 md:pt-14">
          <div className="flex items-center justify-between">
            {isBreaking(current, now) ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Breaking news
              </span>
            ) : current.revived_at ? (
              <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-black">
                🧟 Revived by the crowd
              </span>
            ) : (
              <span className="rounded-full border border-cyan-800 bg-cyan-950/60 px-2.5 py-0.5 text-xs font-bold uppercase text-cyan-400">
                {cat || "Pixsup"}
              </span>
            )}
            <div className="flex items-center gap-2">
              <PostActionMenu post={current} />
              <WatchButton
                post={current}
                user={user}
                onSignIn={onSignIn}
                className="rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300 transition hover:border-orange-400/40 hover:text-orange-300"
              />
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
              <span
                className={`flex items-center gap-1 font-mono text-xs font-bold ${
                  inLastBreath(current, remaining) ? "animate-pulse text-red-400" : "text-orange-400"
                }`}
              >
                <Hourglass className="h-3.5 w-3.5" /> {timer} remaining
              </span>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-200">
            {current.title || "Untitled"}
          </p>
          <p className="-mt-2 flex flex-wrap items-center gap-x-1 text-xs text-gray-400">
            {current.isNews ? (
              `via ${current.guest_author_id || "the news"}`
            ) : names[current.created_by_id] ? (
              <>
                <Avatar
                  url={members[current.created_by_id]?.avatar_url}
                  name={names[current.created_by_id]}
                  size={18}
                />
                by @{names[current.created_by_id]}
              </>
            ) : null}
            {!current.isNews && current.city && ` · 📍 ${current.city}`}
            {current.saved_by_name && (
              <span className="ml-2 font-bold text-yellow-300">
                🦸 Saved by @{current.saved_by_name}
              </span>
            )}
          </p>
          {current.isNews && current.summary && (
            <p className="text-sm leading-relaxed text-gray-300">{current.summary}</p>
          )}
          <ExplainIt key={current.id} post={current} />
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

          <PollCard post={current} user={user} onSignIn={onSignIn} onUpdate={merge} />
          {user?.role === "admin" && <AdminPollEditor post={current} onUpdate={merge} />}

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
              <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-gray-400">
                How people feel
                {rising && (
                  <span className="animate-pulse rounded-full bg-red-500/15 px-2 py-0.5 normal-case tracking-normal text-red-200">
                    {rising}
                  </span>
                )}
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

          <div className="flex gap-2">
            <button
              onClick={vote}
              disabled={voted}
              className="spring-tap flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-orange-500 py-2 text-sm font-extrabold text-black shadow-lg transition-all hover:from-cyan-400 hover:to-orange-400 active:scale-95 disabled:opacity-70"
            >
              ⚡ HIT POST ({current.hits || 0})
            </button>
            {remaining > 0 && (
              <StoryCardButton
                post={current}
                className="spring-tap shrink-0 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 text-xs font-extrabold text-fuchsia-200 transition hover:bg-fuchsia-500/20 active:scale-95"
              />
            )}
          </div>

          <div className="pt-1">
            <div className="mb-2 flex gap-1.5">
              {[
                ["comments", `💬 Comments (${shownComments.length})`],
                ["live", `🔴 Live chat${hereNow > 1 ? ` · 👀 ${hereNow} here` : ""}`],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                    tab === id
                      ? "bg-white text-black"
                      : "border border-white/10 bg-white/5 text-gray-300 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Always mounted so "N here" counts everyone viewing the post */}
            <div hidden={tab !== "live"}>
              <LiveChat post={current} user={user} onSignIn={onSignIn} onPresence={setHereNow} />
            </div>

            <div hidden={tab !== "comments"}>
              <div className="mb-3 space-y-2">
                {shownComments.map((c) => {
                  const votedThis = myCommentVotes.has(c.id);
                  const own = c.created_by_id === user?.id;
                  return (
                    <div
                      key={c.id}
                      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-gray-200 ${
                        c.id === hotTakeId ? "border border-orange-400/40 bg-orange-400/10" : "bg-white/5"
                      }`}
                    >
                      <Avatar
                        url={members[c.created_by_id]?.avatar_url}
                        name={names[c.created_by_id] || "member"}
                        size={22}
                        className="mt-0.5"
                      />
                      <p className="min-w-0 flex-1">
                        {c.id === hotTakeId && (
                          <span className="mr-1.5 rounded bg-orange-500 px-1 py-0.5 text-[9px] font-black text-black">
                            HOT TAKE
                          </span>
                        )}
                        <span className="mr-1.5 text-xs font-bold text-cyan-300">
                          @{names[c.created_by_id] || "member"}
                        </span>
                        {c.text}
                      </p>
                      <button
                        onClick={() => voteComment(c)}
                        disabled={own || votedThis}
                        aria-label="Vote for this comment"
                        className={`flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold transition ${
                          votedThis ? "bg-orange-500/30 text-orange-200" : "bg-white/5 text-gray-400 hover:text-orange-300"
                        } disabled:cursor-default`}
                      >
                        🔥 {c.votes || 0}
                      </button>
                    </div>
                  );
                })}
                {shownComments.length === 0 && (
                  <p className="text-xs text-gray-500">No comments yet. Drop the first hot take.</p>
                )}
              </div>
              {isAuthenticated ? (
                <div className="flex gap-2">
                  <input
                    value={text}
                    enterKeyHint="send"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addComment()}
                    placeholder="Add a comment..."
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    onClick={addComment}
                    disabled={sendingComment}
                    className="spring-tap shrink-0 rounded-xl bg-cyan-400 px-4 text-xs font-extrabold text-black transition hover:bg-cyan-300 active:scale-95 disabled:opacity-50"
                  >
                    {sendingComment ? "…" : "Send"}
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
        </div>
      </motion.div>
  );
}

const HINT_KEY = "pixsup_swipe_hint";

// The open post. With a list (the screen it was opened from), people swipe up
// on the photo for the next post and down for the previous one; computers get
// ▲/▼ buttons and the arrow keys.
export default function PostDetail({ post, list, onNavigate, onClose, ...rest }) {
  useBodyScrollLock();
  const [dir, setDir] = useState(0);
  const [hint, setHint] = useState(() => {
    try {
      return Number(localStorage.getItem(HINT_KEY) || 0) < 3;
    } catch {
      return false;
    }
  });
  const idx = list && onNavigate ? list.findIndex((p) => p.id === post.id) : -1;
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  const go = useCallback(
    (d) => {
      const target = d > 0 ? next : prev;
      if (!target) return;
      setDir(d);
      onNavigate(target);
      if (hint) {
        setHint(false);
        try {
          localStorage.setItem(HINT_KEY, "3");
        } catch {
          // fine
        }
      }
    },
    [next, prev, onNavigate, hint]
  );

  // Count how often the hint has been shown, so it stops after a few times
  useEffect(() => {
    if (!hint || !next) return;
    try {
      localStorage.setItem(HINT_KEY, String(Number(localStorage.getItem(HINT_KEY) || 0) + 1));
    } catch {
      // fine
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Load the next photo early so the swipe feels instant
  useEffect(() => {
    if (next?.media_type === "image" && next.media_url) new window.Image().src = next.media_url;
  }, [next]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <AnimatePresence initial={false}>
        <PostCard key={post.id} post={post} onClose={onClose} {...rest} dir={dir} onSwipe={go} />
      </AnimatePresence>

      {idx >= 0 && (
        <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 flex-col gap-2 md:flex">
          <button
            onClick={() => go(-1)}
            disabled={!prev}
            aria-label="Previous post"
            className="rounded-full border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(1)}
            disabled={!next}
            aria-label="Next post"
            className="rounded-full border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/20 disabled:opacity-20"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      )}

      {hint && next && (
        // centred by the wrapper (the animation owns the pill's transform)
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+2.25rem)] flex justify-center md:hidden">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-black text-black shadow-lg"
          >
            ☝️ Swipe up on the photo for the next post
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
