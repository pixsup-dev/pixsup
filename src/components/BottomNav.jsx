import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Compass, Plus, Zap, User } from "lucide-react";
import Avatar from "@/components/Avatar";

export default function BottomNav({ onUpload, onHome, unread, user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const go = (to) => {
    if (to === "/") onHome();
    if (path !== to) navigate(to);
  };

  const Item = ({ icon: Icon, label, active, dot, onClick, tour }) => (
    <button
      onClick={onClick}
      data-tour={tour}
      className={`flex flex-col items-center gap-0.5 transition-all active:scale-95 ${
        active
          ? "text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]"
          : "text-gray-400 hover:text-cyan-400"
      }`}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {dot && (
          <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
        )}
      </span>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0f172a]/75 px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <Item icon={Home} label="Home" active={path === "/"} onClick={() => go("/")} />
        <Item
          icon={Compass}
          label="Explore"
          active={path === "/explore"}
          onClick={() => go("/explore")}
        />
        <button
          onClick={onUpload}
          data-tour="upload"
          aria-label="Post a photo"
          className="-translate-y-3 -mb-1 rounded-full border-2 border-[#0b0f17] bg-gradient-to-tr from-cyan-400 to-orange-500 p-3 text-black shadow-[0_0_20px_rgba(34,211,238,0.55)] transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" strokeWidth={3} />
        </button>
        <Item
          icon={Zap}
          label="Hits"
          active={path === "/hits"}
          dot={unread > 0}
          onClick={() => go("/hits")}
        />
        <Item
          // the member's own picture, once they've set one
          icon={user?.avatar_url ? () => <Avatar url={user.avatar_url} name={user.username} size={20} /> : User}
          label="Profile"
          tour="profile"
          active={path === "/profile"}
          onClick={() => go("/profile")}
        />
      </div>
    </nav>
  );
}