import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { compressImage } from "@/lib/compressImage";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";

export default function PostCreator({ onClose, onCreated }) {
  useBodyScrollLock();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [user, setUser] = useState(null);
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

      if (mediaType === "image") {
        // Images must pass the AI safety scan — the database rejects unapproved
        // images, so if the scan is unavailable there's no point publishing.
        setStatus("AI safety scan, auto-title & tagging…");
        let analysis;
        try {
          const res = await base44.functions.invoke("analyzePostMedia", { file_url });
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
        hits: 0,
        is_trending: false,
        expires_at: expiresAt,
        category,
        hashtags,
        emojis,
      });
      toast({ title: "Published to the Live Grid!" });
      onCreated();
      onClose();
    } catch (e) {
      console.error(e);
      const tooBig = /exceeded the maximum|too large|413/i.test(String(e?.message || ""));
      toast({
        title: "Upload failed",
        description: tooBig
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