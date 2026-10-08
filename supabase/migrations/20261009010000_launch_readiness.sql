-- Launch readiness: usernames + terms/age acceptance, bans and admin tools,
-- account-level blocks and saved posts, server-side notifications, private
-- reports with server-side auto-hide, an AI-moderation switch, and a daily
-- cleanup of expired posts.

-- ---------------------------------------------------------------------------
-- App settings (server-only switches)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key    text primary key,
  value  jsonb not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Flip to 'true' once analyzePostMedia has an AI key:
--   update public.app_settings set value = 'true' where key = 'ai_moderation_required';
insert into public.app_settings (key, value) values ('ai_moderation_required', 'false');

create or replace function public.ai_moderation_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'ai_moderation_required'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles: username, terms/age acceptance, ban flag
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column username          text,
  add column terms_accepted_at timestamptz,
  add column banned            boolean not null default false;

alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$');
create unique index profiles_username_key on public.profiles (username);

-- Email sign-ups tick "13+ and agree to Terms" before the account exists;
-- the client passes it as user metadata and it's recorded here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, terms_accepted_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true' then now() end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select banned from public.profiles where id = (select auth.uid())), false);
$$;

-- Choose (or change) a username; also records Terms/13+ acceptance for
-- accounts that didn't tick it at sign-up (e.g. Google sign-in).
create or replace function public.complete_onboarding(p_username text, p_accept_terms boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := lower(btrim(coalesce(p_username, '')));
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_name !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3–20 characters: letters, numbers and underscores' using errcode = '22023';
  end if;
  if v_name in ('admin', 'administrator', 'pixsup', 'support', 'moderator', 'mod', 'staff',
                'root', 'system', 'null', 'undefined', 'someone', 'deleted', 'news') then
    raise exception 'That username is reserved' using errcode = '22023';
  end if;
  if not coalesce(p_accept_terms, false)
     and (select terms_accepted_at from public.profiles where id = v_uid) is null then
    raise exception 'Please confirm you are 13 or older and accept the Terms' using errcode = '22023';
  end if;

  update public.profiles
     set username = v_name,
         display_name = v_name,
         terms_accepted_at = coalesce(terms_accepted_at, now())
   where id = v_uid;
exception
  when unique_violation then
    raise exception 'That username is taken' using errcode = '23505';
end;
$$;

revoke execute on function public.complete_onboarding(text, boolean) from public, anon;
grant execute on function public.complete_onboarding(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Account-level blocks and saved posts
-- ---------------------------------------------------------------------------

-- blocked_key is a member id or a news source name (posts.guest_author_id)
create table public.blocks (
  blocker_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_key   text not null check (char_length(blocked_key) between 1 and 100),
  created_date  timestamptz not null default now(),
  primary key (blocker_id, blocked_key)
);

create table public.saved_posts (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id       uuid not null references public.posts (id) on delete cascade,
  created_date  timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.blocks      enable row level security;
alter table public.saved_posts enable row level security;
revoke all on public.blocks, public.saved_posts from anon, authenticated;
grant select, insert, delete on public.blocks, public.saved_posts to authenticated;

create policy "blocks: own" on public.blocks
  for all to authenticated
  using (blocker_id = (select auth.uid()))
  with check (blocker_id = (select auth.uid()));

create policy "saved_posts: own" on public.saved_posts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Reports: private to the reporter/admins; 3 distinct reporters hide a post
-- ---------------------------------------------------------------------------

alter table public.posts add column hidden_at timestamptz;

drop policy "posts: public read" on public.posts;
create policy "posts: public read unless hidden" on public.posts
  for select to anon, authenticated
  using (hidden_at is null or created_by_id = (select auth.uid()) or (select public.is_admin()));

drop policy "flags: public read" on public.flags;
create policy "flags: reporter or admin read" on public.flags
  for select to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin());
revoke select on public.flags from anon;

create or replace function public.hide_heavily_reported_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(distinct f.created_by_id) from public.flags f where f.post_id = new.post_id) >= 3 then
    update public.posts set hidden_at = coalesce(hidden_at, now()) where id = new.post_id;
  end if;
  return new;
end;
$$;

create trigger flags_auto_hide
  after insert on public.flags
  for each row execute function public.hide_heavily_reported_post();

-- Apply the rule to reports made before this migration
update public.posts p
   set hidden_at = now()
 where (select count(distinct f.created_by_id) from public.flags f where f.post_id = p.id) >= 3;

drop policy "flags: members report" on public.flags;
create policy "flags: members report" on public.flags
  for insert to authenticated
  with check (created_by_id = (select auth.uid()) and not public.is_banned());

-- ---------------------------------------------------------------------------
-- Posting rules: members only, not banned, own upload, AI approval when on
-- ---------------------------------------------------------------------------

drop policy if exists "posts: members create own approved uploads" on public.posts;
drop policy if exists "posts: members create own uploads (AI paused)" on public.posts;

create policy "posts: members create own uploads" on public.posts
  for insert to authenticated
  with check (
    created_by_id = (select auth.uid())
    and not public.is_banned()
    and media_url like '%/storage/v1/object/public/media/' || (select auth.uid())::text || '/%'
    and (thumbnail_url is null or thumbnail_url = media_url)
    and (
      media_type = 'video'
      or not public.ai_moderation_required()
      or public.media_is_approved(media_url)
    )
  );

drop policy "media: members upload to own folder" on storage.objects;
create policy "media: members upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.is_banned()
  );

-- ---------------------------------------------------------------------------
-- Notifications are created only by the server (no forged senders)
-- ---------------------------------------------------------------------------

drop policy "notifications: members create as self" on public.notifications;
revoke insert on public.notifications from authenticated;

create or replace function public.notify_post_owner(p_post public.posts, p_type text, p_emoji text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_post.created_by_id is null or v_actor is null or p_post.created_by_id = v_actor then
    return;
  end if;
  -- the owner blocked this member
  if exists (select 1 from public.blocks b
             where b.blocker_id = p_post.created_by_id and b.blocked_key = v_actor::text) then
    return;
  end if;
  -- one reaction notification per member per post every 10 minutes
  if p_type = 'reaction' and exists (
       select 1 from public.notifications n
        where n.created_by_id = v_actor and n.post_id = p_post.id and n.type = 'reaction'
          and n.created_date > now() - interval '10 minutes') then
    return;
  end if;

  insert into public.notifications (created_by_id, recipient_id, type, post_id, post_title, actor_name, emoji)
  values (
    v_actor,
    p_post.created_by_id,
    p_type,
    p_post.id,
    coalesce(p_post.title, 'Untitled'),
    coalesce((select username from public.profiles where id = v_actor), 'Someone'),
    p_emoji
  );
end;
$$;

revoke execute on function public.notify_post_owner(public.posts, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Engagement RPCs: ban checks + server-side notifications
-- ---------------------------------------------------------------------------

create or replace function public.hit_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_post     public.posts;
  v_promoted boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to hit posts' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  insert into public.votes (post_id, created_by_id, value)
  values (p_post_id, v_uid, 1)
  on conflict (post_id, created_by_id) do nothing;
  if not found then
    return null; -- already hit
  end if;

  select * into v_post from public.posts where id = p_post_id for update;

  v_post.hits := v_post.hits + 1;
  if not v_post.is_trending then
    v_post.expires_at := greatest(coalesce(v_post.expires_at, now()), now()) + interval '1 minute';
    if public.engagement_score(v_post) >= 20 then
      v_post.is_trending := true;
      v_post.trending_expires_at := now() + interval '24 hours';
      v_post.expires_at := v_post.trending_expires_at;
      v_promoted := true;
    end if;
  end if;

  update public.posts
     set hits = v_post.hits,
         expires_at = v_post.expires_at,
         is_trending = v_post.is_trending,
         trending_expires_at = v_post.trending_expires_at
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'hit');
  if v_promoted then
    perform public.notify_post_owner(v_post, 'trending');
  end if;

  return to_jsonb(v_post);
end;
$$;

create or replace function public.react_to_post(p_post_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to react' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if p_emoji is null or char_length(p_emoji) not between 1 and 16 then
    raise exception 'Invalid reaction' using errcode = '22023';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if not (v_post.reactions ? p_emoji)
     and (select count(*) from jsonb_object_keys(v_post.reactions)) >= 32 then
    raise exception 'Too many distinct reactions on this post' using errcode = '22023';
  end if;

  update public.posts
     set reactions = jsonb_set(
           reactions,
           array[p_emoji],
           to_jsonb(coalesce((reactions ->> p_emoji)::int, 0) + 1)
         ),
         expires_at = greatest(coalesce(expires_at, now()), now()) + interval '2 minutes'
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'reaction', p_emoji);

  return to_jsonb(v_post);
end;
$$;

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
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  insert into public.comments (post_id, text, created_by_id)
  values (p_post_id, p_text, auth.uid());

  update public.posts
     set comment_count = comment_count + 1,
         expires_at = greatest(coalesce(expires_at, now()), now()) + interval '5 minutes'
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'comment');

  return to_jsonb(v_post);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin moderation tools (checked inside: admins only)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean, p_remove_posts boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot ban yourself' using errcode = '22023';
  end if;
  update public.profiles set banned = p_banned where id = p_user;
  if p_banned and p_remove_posts then
    delete from public.posts where created_by_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_set_post_hidden(p_post_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.posts
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end
   where id = p_post_id;
end;
$$;

revoke execute on function public.admin_set_banned(uuid, boolean, boolean) from public, anon;
revoke execute on function public.admin_set_post_hidden(uuid, boolean)     from public, anon;
grant  execute on function public.admin_set_banned(uuid, boolean, boolean) to authenticated;
grant  execute on function public.admin_set_post_hidden(uuid, boolean)     to authenticated;

-- ---------------------------------------------------------------------------
-- Daily cleanup of long-expired posts and their files (Edge Function)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'cleanup-expired-posts',
  '17 3 * * *',
  $$
  select net.http_post(
    url := 'https://qcouyhzvapgknfvrpakt.supabase.co/functions/v1/cleanupExpiredPosts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
