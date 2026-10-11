import { corsHeaders, json } from "../_shared/cors.ts";
import { admin, SUPABASE_URL } from "../_shared/supabase.ts";

// Daily (Supabase Cron): permanently deletes member posts that expired more
// than RETENTION_DAYS ago, plus their uploaded files. Keeps storage bounded and
// matches Pixsup's promise that posts don't live forever. Safe for anyone to
// trigger: it only ever removes posts that are already long gone from the grid.
//
// Then an orphan sweep: photo files no post or profile uses any more (a post
// removed early, a replaced profile picture, an upload that was never posted),
// once they're a day old so uploads in progress are never touched.
// { "dry": true } reports what it would delete without deleting anything.
const RETENTION_DAYS = 7;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ORPHANS_PER_RUN = 2000;
const BATCH = 200;
const MEDIA_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/media/`;

function storagePath(url: string | null): string | null {
  if (!url || !url.startsWith(MEDIA_PREFIX)) return null; // news images live elsewhere
  return decodeURIComponent(url.slice(MEDIA_PREFIX.length).split("?")[0]);
}

// Every file path a post or a profile picture still points at
async function referencedPaths(): Promise<Set<string>> {
  const used = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("posts").select("media_url, thumbnail_url").range(from, from + 999);
    if (error) throw error;
    for (const p of data) for (const u of [p.media_url, p.thumbnail_url]) {
      const path = storagePath(u);
      if (path) used.add(path);
    }
    if (data.length < 1000) break;
  }
  const { data: profiles, error } = await admin.from("profiles").select("avatar_url").not("avatar_url", "is", null);
  if (error) throw error;
  for (const p of profiles) {
    const path = storagePath(p.avatar_url);
    if (path) used.add(path);
  }
  return used;
}

async function sweepOrphans(dry: boolean) {
  const used = await referencedPaths();
  const bucket = admin.storage.from("media");
  const { data: folders, error } = await bucket.list("", { limit: 1000 });
  if (error) throw error;
  const doomed: string[] = [];
  let bytes = 0;
  for (const folder of folders) {
    if (folder.id) continue; // a file at the top level, not a member's folder
    for (let offset = 0; ; offset += 1000) {
      const { data: files, error: listError } = await bucket.list(folder.name, { limit: 1000, offset });
      if (listError) throw listError;
      for (const f of files) {
        const path = `${folder.name}/${f.name}`;
        const age = Date.now() - Date.parse(f.created_at || f.updated_at || "");
        if (!f.id || used.has(path) || !(age > ORPHAN_AGE_MS)) continue;
        doomed.push(path);
        bytes += Number(f.metadata?.size || 0);
      }
      if (files.length < 1000 || doomed.length >= MAX_ORPHANS_PER_RUN) break;
    }
    if (doomed.length >= MAX_ORPHANS_PER_RUN) break;
  }
  const batch = doomed.slice(0, MAX_ORPHANS_PER_RUN);
  if (!dry) {
    for (let i = 0; i < batch.length; i += 100) {
      const { error: removeError } = await bucket.remove(batch.slice(i, i + 100));
      if (removeError) throw removeError;
    }
    if (batch.length) await admin.from("media_approvals").delete().in("file_url", batch.map((p) => MEDIA_PREFIX + p));
  }
  return { dry, files: batch.length, megabytes: Math.round((bytes / 1048576) * 10) / 10, filesInUse: used.size };
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

    const body = await req.json().catch(() => ({}));
    const orphans = await sweepOrphans(body?.dry === true);

    return json({ success: true, deletedPosts, deletedFiles, orphans });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return json({ error: message || String(error) }, 500);
  }
});
