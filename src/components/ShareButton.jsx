import React from "react";
import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { postUrl } from "@/lib/site";

// Native Web Share pointing at the post's permalink, with a Copy Link fallback
export default function ShareButton({ post, className }) {
  const { toast } = useToast();

  const share = async (e) => {
    e.stopPropagation();
    const url = postUrl(post.id);
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title || "Pixsup",
          text: post.title || "Check this out on Pixsup",
          url,
        });
      } catch (err) {
        /* user dismissed the share sheet */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!", description: url });
      } catch (err) {
        toast({ title: "Couldn't copy the link", variant: "destructive" });
      }
    }
  };

  return (
    <button onClick={share} title="Share" className={className}>
      <Share2 className="h-3 w-3" />
    </button>
  );
}