import React, { useEffect, useRef, useState } from "react";
import { Flag, Send, UserX } from "lucide-react";
import { base44, supabase } from "@/api/base44Client";
import { useBlocklist } from "@/hooks/useBlocklist";
import { useToast } from "@/components/ui/use-toast";
import { useMembers } from "@/hooks/useUsernames";
import Avatar from "@/components/Avatar";

const LIFETIME_MS = 10 * 60 * 1000;

// A quick chat on a post. Messages vanish after 10 minutes (the server stops
// serving them, and purges them soon after). Shows who's here right now.
export default function LiveChat({ post, user, onSignIn, onPresence }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const { blocked, block } = useBlocklist();
  const { toast } = useToast();
  const listRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Recent messages, then live inserts and presence on one channel
  useEffect(() => {
    let alive = true;
    base44.entities.ChatMessage.filter({ post_id: post.id }, "created_date", 200)
      .then((rows) => alive && setMessages(rows))
      .catch(() => {});

    const channel = supabase.channel(`chat-${post.id}`, {
      config: { presence: { key: user?.id || `guest-${Math.random().toString(36).slice(2)}` } },
    });
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `post_id=eq.${post.id}` },
        ({ new: m }) =>
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      )
      .on("presence", { event: "sync" }, () => {
        onPresence?.(Object.keys(channel.presenceState()).length);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
      });
    return () => {
      alive = false;
      onPresence?.(0);
      supabase.removeChannel(channel);
    };
  }, [post.id, user?.id]);

  const visible = messages.filter(
    (m) => now - new Date(m.created_date).getTime() < LIFETIME_MS && !blocked.includes(m.user_id)
  );

  const members = useMembers(visible.map((m) => m.user_id));

  // Keep the newest message in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // postText runs the AI check before send_chat saves the message
      const { data: m } = await base44.functions.invoke("postText", {
        kind: "chat",
        post_id: post.id,
        text: body,
      });
      setText("");
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    } catch (e) {
      toast({ title: e.message || "Couldn't send", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const report = async (m) => {
    setMenuFor(null);
    try {
      await base44.rpc("report_chat", { p_message_id: m.id });
      toast({ title: "Reported", description: "Thanks — a moderator will review it." });
    } catch (e) {
      toast({ title: e.message || "Couldn't report", variant: "destructive" });
    }
  };

  const blockUser = (m) => {
    setMenuFor(null);
    block(m.user_id);
    toast({ title: `Blocked @${m.username}` });
  };

  return (
    <div>
      <div
        ref={listRef}
        className="no-scrollbar mb-2 max-h-56 space-y-1.5 overflow-y-auto overscroll-contain"
      >
        {visible.map((m) => {
          const age = now - new Date(m.created_date).getTime();
          const mine = m.user_id === user?.id;
          return (
            <div
              key={m.id}
              className="group relative rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition-opacity"
              style={{ opacity: age > LIFETIME_MS - 60 * 1000 ? 0.45 : 1 }}
            >
              <Avatar
                url={members[m.user_id]?.avatar_url}
                name={m.username}
                size={18}
                className="mr-1.5 inline-flex align-middle"
              />
              <span className={`mr-1.5 text-xs font-bold ${mine ? "text-orange-300" : "text-violet-300"}`}>
                @{m.username}
              </span>
              {m.text}
              {user && !mine && (
                <button
                  aria-label="Message options"
                  onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                  className="absolute right-1.5 top-1.5 rounded px-1 text-xs text-gray-500 hover:text-gray-200"
                >
                  ⋯
                </button>
              )}
              {menuFor === m.id && (
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => report(m)}
                    className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold text-orange-300"
                  >
                    <Flag className="h-3 w-3" /> Report
                  </button>
                  <button
                    onClick={() => blockUser(m)}
                    className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold text-red-300"
                  >
                    <UserX className="h-3 w-3" /> Block @{m.username}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="py-3 text-center text-xs text-gray-500">
            Quiet in here. Say something — it vanishes in 10 minutes.
          </p>
        )}
      </div>

      {user ? (
        <div className="flex gap-2">
          <input
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Chat live (vanishes in 10 min)..."
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-gray-400 focus:border-violet-400 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="spring-tap rounded-xl bg-violet-500 px-3 text-white transition hover:bg-violet-400 active:scale-95 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onSignIn}
          className="spring-tap w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-bold text-gray-200 transition hover:bg-white/10 active:scale-95"
        >
          Sign in to chat
        </button>
      )}
    </div>
  );
}
