import React from "react";
import { useBlocklist } from "@/hooks/useBlocklist";

// The newest comment on a post, e.g. "💬 @sam: this is insane".
// Hidden when its author is on your block list.
export default function TopComment({ post, className = "" }) {
  const { blocked } = useBlocklist();
  const c = post?.top_comment;
  if (!c?.text || blocked.includes(c.author_id)) return null;
  return (
    <p className={`truncate ${className}`}>
      💬 <span className="font-bold">@{c.username || "member"}</span>: {c.text}
    </p>
  );
}
