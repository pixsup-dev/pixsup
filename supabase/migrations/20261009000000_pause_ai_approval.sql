-- TEMPORARY: lets members post images before AI moderation is configured.
-- Uploads stay members-only and must be the member's own file, but images no
-- longer need a media_approvals entry. Undo this (restore the
-- "posts: members create own approved uploads" policy from
-- 20261008020000_members_only_posting.sql) once analyzePostMedia has an AI key.

drop policy "posts: members create own approved uploads" on public.posts;

create policy "posts: members create own uploads (AI paused)" on public.posts
  for insert to authenticated
  with check (
    created_by_id = (select auth.uid())
    and media_url like '%/storage/v1/object/public/media/' || (select auth.uid())::text || '/%'
    and (thumbnail_url is null or thumbnail_url = media_url)
  );
