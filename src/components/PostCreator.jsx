import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/compressImage";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import Avatar from "@/components/Avatar";

export default function PostCreator({ challenge, onClose, onCreated }) {
  useBodyScrollLock();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  // Optional poll: a question plus 2–4 options (empty options are dropped)
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [user, setUser] = useState(null);
  // One challenge entry per person per day: true once we know they've entered
  const [alreadyEntered, setAlreadyEntered] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Check the session when the modal opens — only members can post
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await base44.auth.isAuthenticated()) {
          const me = await base44.auth.me();
          if (alive) setUser(me);
          if (challenge?.tag) {
            const entered = await base44.rpc("my_challenge_entry_today").catch(() => false);
            if (alive) setAlreadyEntered(entered === true);
          }
        }
      } catch {
        // signed out or session error — treat as guest
      }
    })();
    return () => {
      alive = false;
    };
  }, [challenge?.tag]);

  const entering = !!challenge?.tag && !alreadyEntered;

  const handleFile = (f) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) return;
    if (!user) {
      toast({ title: "Sign in to post", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setStatus("Uploading media…");
      // Photos are resized and stripped of location data before upload
      const upload = await compressImage(file);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: upload });
      const mediaType = file.type.startsWith("video") ? "video" : "image";

      let category = null;
      let hashtags = [];
      let aiTitle = null;
      let emojis = [];
      // videos aren't AI-checked, so they can't enter the challenge
      let fitsChallenge = entering && !file.type.startsWith("video") ? null : false;

      if (mediaType === "image") {
        // Images must pass the AI safety scan — the database rejects unapproved
        // images, so if the scan is unavailable there's no point publishing.
        setStatus("AI safety scan, auto-title & tagging…");
        let analysis;
        try {
          const res = await base44.functions.invoke("analyzePostMedia", { file_url, challenge: entering });
          analysis = res.data || {};
        } catch (e) {
          console.error(e);
          toast({
            title: "Couldn't check this image",
            description: "The safety scan is unavailable right now — please try again in a moment.",
            variant: "destructive",
          });
          return;
        }
        if (analysis.safe === false) {
          toast({
            title: "Content Flagged",
            description: "This image can't be posted — it was flagged by AI moderation.",
            variant: "destructive",
          });
          setFile(null);
          setPreview(null);
          return;
        }
        category = analysis.category || null;
        hashtags = analysis.hashtags || [];
        aiTitle = analysis.title || null;
        emojis = analysis.emojis || [];
        if (entering) fitsChallenge = analysis.fits_challenge !== false;
      }
      const isEntry = entering && fitsChallenge !== false;

      const pollChoices = pollOptions.map((o) => o.trim()).filter(Boolean);
      const poll =
        pollOpen && pollQuestion.trim() && pollChoices.length >= 2
          ? { question: pollQuestion.trim(), options: pollChoices }
          : null;

      setStatus("Publishing to the Live Grid…");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await base44.entities.Post.create({
        title:
          title.trim() ||
          aiTitle ||
          (mediaType === "video" ? "Video Drop" : "New Post"),
        media_url: file_url,
        media_type: mediaType,
        thumbnail_url: file_url,
        hits: 0,
        is_trending: false,
        expires_at: expiresAt,
        category,
        // a challenge entry carries the challenge's tag (the database also checks it)
        hashtags: isEntry ? [...new Set([challenge.tag, ...hashtags])].slice(0, 6) : hashtags,
        emojis,
        ...(poll ? { poll } : {}),
      });
      if (entering && !isEntry) {
        toast({
          title: "Posted, but not as a challenge entry",
          description: file.type.startsWith("video")
            ? "Only photos can enter the Daily Challenge."
            : `The AI didn't think this photo matches "${challenge.prompt}". It's live as a normal post.`,
        });
      } else {
        toast({ title: isEntry ? "You're in today's challenge! 📸" : "Published to the Live Grid!" });
      }
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
      const tooBig = /exceeded the maximum|too large|413/i.test(String(e?.message || ""));
      const slowDown = /slow down/i.test(String(e?.message || ""));
      toast({
        title: "Upload failed",
        description: slowDown
          ? "You can post up to 10 times an hour. Try again a little later."
          : tooBig
          ? "That file is too big — the limit is 50 MB."
          : "Something went wrong — please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#151c28] p-5"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-cyan-400">
            {user ? "Create Post" : "Post Anonymously"}
          </h3>
          <button onClick={onClose} className="text-gray-400 transition hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        {user && (
          <div className="-mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <Avatar url={user.avatar_url} name={user.username || user.full_name} size={36} />
            <span className="flex flex-col">
              <span className="text-xs font-bold text-white">
                {user.username ? `@${user.username}` : user.full_name || "You"}
              </span>
              <span className="text-[10px] text-gray-400">Posting as you</span>
            </span>
          </div>
        )}
        {challenge?.tag &&
          (alreadyEntered ? (
            <div className="-mt-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-300">
                ✅ You've already entered today's challenge
              </p>
              <p className="text-xs text-gray-400">
                One entry per person per day. This one will post as a normal post.
              </p>
            </div>
          ) : (
            <div className="-mt-1 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-orange-300">
                📸 Joining today's challenge
              </p>
              <p className="text-xs font-bold text-white">
                {challenge.prompt} <span className="text-cyan-300">{challenge.tag}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                One entry per day, so pick your best shot. Photos that don't match the prompt post normally.
              </p>
            </div>
          ))}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging
              ? "border-cyan-400 bg-cyan-400/10"
              : "border-white/15 hover:border-cyan-400/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
          />
          {preview ? (
            file.type.startsWith("video") ? (
              <video src={preview} className="mx-auto max-h-48 rounded-lg" />
            ) : (
              <img src={preview} alt="preview" className="mx-auto max-h-48 rounded-lg" />
            )
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <UploadCloud className="h-8 w-8" />
              <span className="text-xs">Drag & drop or tap to upload an image or video</span>
            </div>
          )}
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a caption... (AI writes a title if empty)"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
        />
        {pollOpen ? (
          <div className="space-y-1.5 rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
            <input
              value={pollQuestion}
              maxLength={120}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Ask something, e.g. Which outfit?"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-violet-400 focus:outline-none"
            />
            {pollOptions.map((o, i) => (
              <input
                key={i}
                value={o}
                maxLength={60}
                onChange={(e) =>
                  setPollOptions(pollOptions.map((x, j) => (j === i ? e.target.value : x)))
                }
                placeholder={`Option ${i + 1}`}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:border-violet-400 focus:outline-none"
              />
            ))}
            <div className="flex gap-3 pt-0.5 text-[11px] font-bold">
              {pollOptions.length < 4 && (
                <button onClick={() => setPollOptions([...pollOptions, ""])} className="text-violet-300">
                  + Add option
                </button>
              )}
              <button onClick={() => setPollOpen(false)} className="text-gray-400">
                Remove poll
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setPollOpen(true)}
            className="w-full rounded-xl border border-dashed border-violet-400/30 py-1.5 text-xs font-bold text-violet-300 transition hover:bg-violet-400/10"
          >
            📊 Add a poll (optional)
          </button>
        )}
        <button
          onClick={submit}
          disabled={!file || busy}
          className="spring-tap w-full rounded-xl bg-orange-500 py-2 text-sm font-extrabold text-black transition-all hover:bg-orange-400 active:scale-95 disabled:opacity-50"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Publish to Live Grid"}
        </button>
        {busy && status && (
          <p className="flex items-center justify-center gap-2 text-xs font-semibold text-cyan-400">
            <Loader2 className="h-3 w-3 animate-spin" /> {status}
          </p>
        )}
        <p className="text-center text-[10px] text-gray-400">
          Every photo is AI-scanned, titled and tagged before publishing · Posts live 1
          hour · Other people keep them alive: each person's Hit adds +5 minutes, their
          first emoji +3 and their first comment +10
        </p>
      </motion.div>
    </motion.div>
  );
}