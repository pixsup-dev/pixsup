-- Posting, commenting and reporting now require a signed-in account, and an
-- image post is only accepted once analyzePostMedia (OpenAI moderation) has
-- approved that exact file. Guests can still browse, hit and react locally.

-- ---------------------------------------------------------------------------
-- Moderation approvals (written only by the analyzePostMedia Edge Function)
-- ---------------------------------------------------------------------------

create table public.media_approvals (
  file_url       text primary key,
  created_by_id  uuid not null references auth.users (id) on delete cascade,
  approved       boolean not null,
  reason         text,
  created_date   timestamptz not null default now()
);

alter table public.media_approvals enable row level security;
revoke all on public.media_approvals from anon, authenticated;
-- No policies: only the service role (Edge Functions) can read or write it.

create or replace function public.media_is_approved(p_url text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_approvals a
    where a.file_url = p_url
      and a.created_by_id = (select auth.uid())
      and a.approved
  );
$$;

revoke execute on function public.media_is_approved(text) from public, anon;
grant execute on function public.media_is_approved(text) to authenticated;

-- ---------------------------------------------------------------------------
-- posts: members only; media must be the member's own upload; images approved
-- ---------------------------------------------------------------------------

drop policy "posts: create as self or guest" on public.posts;
revoke insert on public.posts from anon;

create policy "posts: members create own approved uploads" on public.posts
  for insert to authenticated
  with check (
    created_by_id = (select auth.uid())
    and media_url like '%/storage/v1/object/public/media/' || (select auth.uid())::text || '/%'
    and (thumbnail_url is null or thumbnail_url = media_url)
    and (media_type = 'video' or public.media_is_approved(media_url))
  );

-- ---------------------------------------------------------------------------
-- flags: members only
-- ---------------------------------------------------------------------------

drop policy "flags: create as self or guest" on public.flags;
revoke insert on public.flags from anon;

create policy "flags: members report" on public.flags
  for insert to authenticated
  with check (created_by_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- comments: members only
-- ---------------------------------------------------------------------------

create or replace function public.add_comment(p_post_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to comment' using errcode = '42501';
  end if;

  insert into public.comments (post_id, text, created_by_id)
  values (p_post_id, p_text, auth.uid());

  update public.posts
     set comment_count = comment_count + 1,
         expires_at = greatest(coalesce(expires_at, now()), now()) + interval '5 minutes'
   where id = p_post_id
  returning * into v_post;

  return to_jsonb(v_post);
end;
$$;

revoke execute on function public.add_comment(uuid, text) from public, anon;
grant execute on function public.add_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- storage: no more guest uploads
-- ---------------------------------------------------------------------------

drop policy "media: guests upload to guest folder" on storage.objects;
