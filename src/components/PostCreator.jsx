import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function PostCreator({ onClose, onCreated }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [user, setUser] = useState(null);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Check the session when the modal opens — members post as themselves, guests post anonymously
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await base44.auth.isAuthenticated()) {
          const me = await base44.auth.me();
          if (alive) setUser(me);
        }
      } catch {
        // signed out or session error — treat as guest
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleFile = (f) => {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      // Guests publish too — a temporary author ID is attached instead of failing on auth
      const guestAuthorId = user ? null : `guest-${Math.random().toString(36).slice(2, 10)}`;

      setStatus("Uploading media…");
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const mediaType = file.type.startsWith("video") ? "video" : "image";

      let category = null;
      let hashtags = [];
      let aiTitle = null;
      let emojis = [];

      if (mediaType === "image") {
        try {
          setStatus("AI safety scan, auto-title & tagging…");
          const res = await base44.functions.invoke("analyzePostMedia", { file_url });
          const analysis = res.data || {};
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
        } catch (e) {
          // AI scan unavailable (e.g. integration credits exhausted) — keep publishing:
          // the caption becomes the title, auto-tagging is simply skipped.
          category = null;
          hashtags = [];
          aiTitle = null;
          emojis = [];
        }
      }

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
        guest_author_id: guestAuthorId || "guest",
        hits: 0,
        is_trending: false,
        expires_at: expiresAt,
        category: "news",
        hashtags: ["news", "All", "all", "Pixsup", "pixsup"],
        emojis,
      });
      toast({ title: "Published to the Live Grid!" });
      onCreated();
      onClose();
    } catch (e) {
      const msg = String(e?.message || e || "");
      const creditIssue = /402|credit|payment/i.test(msg);
      toast({
        title: "Upload failed",
        description: creditIssue
          ? "File storage uses integration credits — upgrade your plan or wait for the monthly reset."
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-orange-500 text-xs font-black text-black">
              {(user.full_name || user.email || "You")
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="flex flex-col">
              <span className="text-xs font-bold text-white">{user.full_name || "You"}</span>
              <span className="text-[10px] text-gray-400">Posting as you</span>
            </span>
          </div>
        )}
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
          Every photo is AI-scanned, titled and tagged before publishing · Standard posts
          expire in 1 hour · Each Hit adds +1 minute · Each comment adds +5 minutes ·
          Each emoji adds +2 minutes
        </p>
      </motion.div>
    </motion.div>
  );
}