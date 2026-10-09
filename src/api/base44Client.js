// Supabase-backed drop-in for the old Base44 SDK client.
// Components keep calling base44.entities / auth / integrations / functions with
// the same shapes; everything below translates those calls to Supabase.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

const MEDIA_BUCKET = "media";

// Base44 entity name → Postgres table
const TABLES = {
  Post: "posts",
  Vote: "votes",
  Comment: "comments",
  Flag: "flags",
  Notification: "notifications",
  Profile: "profiles",
  Block: "blocks",
  SavedPost: "saved_posts",
  CommentVote: "comment_votes",
  PollVote: "poll_votes",
  ChatMessage: "chat_messages",
  ChatReport: "chat_reports",
  DailyChallenge: "daily_challenges",
};

// Normalize Supabase/PostgREST errors into thrown Errors with a status, like the Base44 SDK
function toError(error, fallbackStatus) {
  const err = new Error(error?.message || "Request failed");
  err.status = error?.status ?? fallbackStatus;
  err.code = error?.code;
  err.data = error;
  return err;
}

function unwrap({ data, error }) {
  if (error) throw toError(error);
  return data;
}

// "-created_date" → order by created_date desc
function applySort(q, sort) {
  if (!sort) return q.order("created_date", { ascending: false });
  const desc = sort.startsWith("-");
  return q.order(desc ? sort.slice(1) : sort, { ascending: !desc });
}

function applyRange(q, limit, skip = 0) {
  if (limit == null && !skip) return q;
  const from = skip || 0;
  const to = limit == null ? from + 999 : from + limit - 1;
  return q.range(from, to);
}

// Exact matches, or "any of" for arrays — fail loudly on Base44 query
// operators we don't translate
function applyQuery(q, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("$") || (value && typeof value === "object" && !Array.isArray(value))) {
      throw new Error(`Unsupported filter for "${key}" — only exact matches are supported`);
    }
    if (value === null) q = q.is(key, null);
    else if (Array.isArray(value)) q = q.in(key, value);
    else q = q.eq(key, value);
  }
  return q;
}

function requireFilter(query, op) {
  if (!query || Object.keys(query).length === 0) {
    throw new Error(`${op} needs at least one filter`);
  }
}

let channelSeq = 0;
const REALTIME_EVENT = { INSERT: "create", UPDATE: "update", DELETE: "delete" };

function makeEntity(table) {
  return {
    async list(sort, limit, skip) {
      if (typeof sort === "number") {
        [sort, limit, skip] = [undefined, sort, limit];
      }
      let q = supabase.from(table).select("*");
      q = applyRange(applySort(q, sort), limit, skip);
      return unwrap(await q);
    },

    async filter(query, sort, limit, skip) {
      let q = applyQuery(supabase.from(table).select("*"), query);
      q = applyRange(applySort(q, sort), limit, skip);
      return unwrap(await q);
    },

    async get(id) {
      return unwrap(await supabase.from(table).select("*").eq("id", id).single());
    },

    async create(data) {
      return unwrap(await supabase.from(table).insert(data).select().single());
    },

    async bulkCreate(rows) {
      return unwrap(await supabase.from(table).insert(rows).select());
    },

    async update(id, data) {
      return unwrap(await supabase.from(table).update(data).eq("id", id).select().single());
    },

    async delete(id) {
      unwrap(await supabase.from(table).delete().eq("id", id));
    },

    async deleteMany(query) {
      requireFilter(query, "deleteMany");
      unwrap(await applyQuery(supabase.from(table).delete(), query));
    },

    // updateMany(query, { $set: {...} }) — plain objects are accepted too
    async updateMany(query, update) {
      requireFilter(query, "updateMany");
      const values = update?.$set ?? update;
      unwrap(await applyQuery(supabase.from(table).update(values), query));
    },

    // Calls cb({ type: "create"|"update"|"delete", id, data }) on any row change.
    // Returns an unsubscribe function. Rows hidden by RLS are not delivered.
    subscribe(cb) {
      const channel = supabase
        .channel(`${table}-changes-${++channelSeq}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
          cb({
            type: REALTIME_EVENT[payload.eventType] || payload.eventType,
            id: payload.new?.id ?? payload.old?.id,
            data: payload.new,
          });
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
}

const entities = Object.fromEntries(
  Object.entries(TABLES).map(([name, table]) => [name, makeEntity(table)])
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function currentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toError(error, 401);
  return data.session;
}

function absoluteUrl(pathOrUrl) {
  return new URL(pathOrUrl || "/", window.location.origin).href;
}

const auth = {
  // { id, email, full_name, display_name, username, role, banned, terms_accepted_at,
  //   lifelines, rescues, city, morning_pulse, created_date }
  async me() {
    const session = await currentSession();
    if (!session) throw toError({ message: "Not authenticated" }, 401);
    const user = session.user;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw toError(error);
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? meta.full_name ?? meta.name ?? null,
      display_name: profile?.display_name ?? null,
      username: profile?.username ?? null,
      role: profile?.role ?? "user",
      banned: profile?.banned ?? false,
      terms_accepted_at: profile?.terms_accepted_at ?? null,
      lifelines: profile?.lifelines ?? 0,
      rescues: profile?.rescues ?? 0,
      city: profile?.city ?? null,
      morning_pulse: profile?.morning_pulse ?? false,
      created_date: user.created_at,
    };
  },

  // Only profile columns the user may edit (display_name, city, morning_pulse) are writable
  async updateMe(data) {
    const session = await currentSession();
    if (!session) throw toError({ message: "Not authenticated" }, 401);
    unwrap(await supabase.from("profiles").update(data).eq("id", session.user.id));
    return auth.me();
  },

  async isAuthenticated() {
    try {
      return !!(await currentSession());
    } catch {
      return false;
    }
  },

  async loginViaEmailPassword(email, password) {
    const data = unwrap(await supabase.auth.signInWithPassword({ email, password }));
    return { user: data.user, access_token: data.session?.access_token };
  },

  // Redirects the browser to the provider; it returns to fromUrl signed in
  async loginWithProvider(provider, fromUrl = "/") {
    unwrap(
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: absoluteUrl(fromUrl) },
      })
    );
  },

  // Sends a 6-digit code (the "Confirm signup" email template must use {{ .Token }}).
  // acceptedTerms (13+ and Terms/Privacy) is recorded on the profile by a trigger.
  async register({ email, password, acceptedTerms = false }) {
    const data = unwrap(
      await supabase.auth.signUp({
        email,
        password,
        options: { data: { terms_accepted: acceptedTerms } },
      })
    );
    // Supabase answers "success" with no identities when the email is already taken
    if (data.user && data.user.identities?.length === 0) {
      throw toError({ message: "An account with this email already exists — sign in instead." }, 409);
    }
    return data;
  },

  async verifyOtp({ email, otpCode }) {
    const data = unwrap(await supabase.auth.verifyOtp({ email, token: otpCode, type: "email" }));
    return { user: data.user, access_token: data.session?.access_token };
  },

  async resendOtp(email) {
    unwrap(await supabase.auth.resend({ type: "signup", email }));
  },

  // Supabase stores the session itself — kept so existing callers don't break
  setToken() {},

  // The "Reset password" email template links to
  // {{ .SiteURL }}/reset-password?token={{ .TokenHash }}
  async resetPasswordRequest(email) {
    unwrap(
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: absoluteUrl("/reset-password"),
      })
    );
  },

  async resetPassword({ resetToken, newPassword }) {
    if (!resetToken) throw toError({ message: "This reset link is invalid or has expired." }, 400);
    unwrap(await supabase.auth.verifyOtp({ token_hash: resetToken, type: "recovery" }));
    unwrap(await supabase.auth.updateUser({ password: newPassword }));
    // Sign out everywhere so the new password is required on every device
    await supabase.auth.signOut();
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut({ scope: "local" });
    if (redirectUrl) window.location.href = redirectUrl;
  },

  redirectToLogin(returnTo = window.location.href) {
    if (window.location.pathname === "/login") return;
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  },
};

// ---------------------------------------------------------------------------
// Integrations: file uploads go to the public "media" Storage bucket
// ---------------------------------------------------------------------------

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const session = await currentSession().catch(() => null);
      const folder = session?.user?.id ?? "guest";
      const ext = (file.name?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${folder}/${randomId()}.${ext}`;
      unwrap(
        await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          cacheControl: "31536000",
          upsert: false,
        })
      );
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

// ---------------------------------------------------------------------------
// Edge Functions and database RPCs
// ---------------------------------------------------------------------------

const functions = {
  // Returns { data } like the Base44 SDK; throws on a non-2xx response
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let message = error.message;
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) message = payload.error;
      } catch {
        // response body wasn't JSON — keep the generic message
      }
      throw toError({ message }, error.context?.status);
    }
    return { data };
  },
};

// Postgres functions from the migration (hit_post, react_to_post, add_comment)
async function rpc(name, args) {
  return unwrap(await supabase.rpc(name, args));
}

export const base44 = { entities, auth, integrations, functions, rpc };
