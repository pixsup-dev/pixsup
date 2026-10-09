import React, { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { squareAvatar } from "@/lib/compressImage";
import { forgetMember } from "@/hooks/useUsernames";
import Avatar from "@/components/Avatar";

// The member's own avatar on their profile: tap to choose a photo. It's
// cropped square, checked by the AI like any post, then set via set_avatar.
export default function AvatarPicker({ user, name, onChanged, size = 72 }) {
  const { toast } = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const save = async (url) => {
    await base44.rpc("set_avatar", { p_url: url });
    forgetMember(user.id);
    await onChanged?.();
  };

  const choose = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      let upload;
      try {
        upload = await squareAvatar(file);
      } catch {
        toast({ title: "Couldn't read that photo", description: "Try a JPG or PNG.", variant: "destructive" });
        return;
      }
      const { file_url } = await base44.integrations.Core.UploadFile({ file: upload });
      const res = await base44.functions.invoke("analyzePostMedia", { file_url });
      if (res.data?.safe === false) {
        toast({
          title: "That picture can't be used",
          description: "It was flagged by our AI safety check.",
          variant: "destructive",
        });
        return;
      }
      await save(file_url);
      toast({ title: "Profile picture updated" });
    } catch (e) {
      console.error(e);
      toast({
        title: "Couldn't update your picture",
        description: /function|schema/i.test(e?.message || "")
          ? "Profile pictures aren't switched on yet."
          : "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await save(null);
      toast({ title: "Profile picture removed" });
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't remove your picture", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label="Change profile picture"
        className="group relative rounded-full border-4 border-[#151c28]"
      >
        <Avatar url={user.avatar_url} name={name} size={size} className="text-2xl" />
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#151c28] bg-cyan-400 text-black">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </span>
      </button>
      {user.avatar_url && !busy && (
        <button onClick={remove} className="text-[10px] font-semibold text-gray-400 hover:text-red-300">
          Remove
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
    </div>
  );
}
