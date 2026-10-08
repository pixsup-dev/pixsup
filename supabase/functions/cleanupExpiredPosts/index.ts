import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, SUPABASE_URL } from "../_shared/supabase.ts";

// Daily (Supabase Cron): permanently deletes member posts that expired more
// than RETENTION_DAYS ago, plus their uploaded files. Keeps storage bounded and
// matches Pixsup's promise that posts don't live forever. Safe for anyone to
// trigger: it only ever removes posts that are already long gone from the grid.
const RETENTION_DAYS = 7;
const BATCH = 200;
const MEDIA_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/media/`;

function storagePath(url: string | null): string | null {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return null; // news images live elsewhere
  return decodeURIComponent(url.slice(MEDIA_PREFIX.length).split("?")[0]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let deletedPosts = 0;
    let deletedFiles = 0;

    for (;;) {
      const { data: posts, error } = await admin
        .from("posts")
        .select("id, media_url, thumbnail_url")
        .eq("isNews", false)
        .lt("expires_at", cutoff)
        .limit(BATCH);
      if (error) throw error;
      if (!posts.length) break;

      const paths = [...new Set(posts.flatMap((p) => [storagePath(p.media_url), storagePath(p.thumbnail_url)]))]
        .filter((p): p is string => Boolean(p));
      if (paths.length) {
        const { error: removeError } = await admin.storage.from("media").remove(paths);
        if (removeError) throw removeError;
        await admin.from("media_approvals").delete().in("file_url", paths.map((p) => MEDIA_PREFIX + p));
        deletedFiles += paths.length;
      }

      const { error: deleteError } = await admin.from("posts").delete().in("id", posts.map((p) => p.id));
      if (deleteError) throw deleteError;
      deletedPosts += posts.length;
      if (posts.length < BATCH) break;
    }

    return json({ success: true, deletedPosts, deletedFiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
