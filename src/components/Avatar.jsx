import React, { useState } from "react";

// A member's round profile picture, or their initial on the brand gradient
// when they haven't set one (or it fails to load).
export default function Avatar({ url, name, size = 24, className = "" }) {
  const [broken, setBroken] = useState(false);
  const initial = (String(name || "").replace(/^@/, "")[0] || "?").toUpperCase();
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) };

  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        style={style}
        className={`shrink-0 rounded-full bg-white/10 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-orange-500 font-black text-black ${className}`}
    >
      {initial}
    </span>
  );
}
