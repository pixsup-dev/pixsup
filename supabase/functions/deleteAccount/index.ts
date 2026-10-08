import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, callerOf } from "../_shared/supabase.ts";

// Permanently deletes the caller's account (App Store guideline 5.1.1(v)).
// Deleting the auth user cascades to profiles, posts, votes, comments, flags,
// notifications and media approvals; uploaded files are removed from Storage.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const user = await callerOf(req);
    if (!user) return json({ error: "Sign in to delete your account" }, 401);

    // Remove the user's uploads (Storage lists at most 1000 per call)
    const bucket = admin.storage.from("media");
    for (;;) {
      const { data: files, error } = await bucket.list(user.id, { limit: 1000 });
      if (error) throw error;
      if (!files?.length) break;
      const { error: removeError } = await bucket.remove(files.map((f) => `${user.id}/${f.name}`));
      if (removeError) throw removeError;
      if (files.length < 1000) break;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
