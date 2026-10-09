import React from "react";
import { useBlocklist } from "@/hooks/useBlocklist";

// A post's top comment, e.g. "💬 @sam: this is insane", or "🔥 Hot take" once
// it has votes (the most-voted comment wins).
// Hidden when its author is on your block list.
export default function TopComment({ post, className = "" }) {
  const { blocked } = useBlocklist();
  const c = post?.top_comment;
  if (!c?.text || blocked.includes(c.author_id)) return null;
  return (
    <p className={`truncate ${className}`}>
      {c.votes > 0 ? "🔥" : "💬"} <span className="font-bold">@{c.username || "member"}</span>: {c.text}
    </p>
  );
}
