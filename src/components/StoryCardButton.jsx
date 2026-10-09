import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { shareStoryCard } from "@/lib/storyCard";
import { useToast } from "@/components/ui/use-toast";
import { postUrl } from "@/lib/site";

// "Save my post": a story-sized image (photo, countdown, call to action) for
// Instagram, WhatsApp or Snapchat stories: free advertising with a reason to tap.
export default function StoryCardButton({ post, className, label = "📸 Story card" }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const make = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const result = await shareStoryCard(post);
      if (result === "downloaded") {
        toast({
          title: "Story card saved",
          description: `Post it to your story and add a link sticker: ${postUrl(post.id)}`,
        });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Couldn't make the story card", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button onClick={make} disabled={busy} className={className} title="Share to your story">
      {busy ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : label}
    </button>
  );
}
