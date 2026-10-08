-- Pixsup: initial schema, ported from the Base44 entities in base44/entities/*.
--
-- Apply once to a hosted project: Dashboard → SQL Editor → paste & run
-- (or `supabase db push` if you later link the CLI).
--
-- Conventions carried over from Base44 so components stay unchanged:
--   * every row has id, created_date, updated_date, created_by_id
--   * created_by_id defaults to auth.uid() (NULL for guests)
--   * camelCase Base44 fields ("isNews", "isPromoted") keep their exact names
--
-- Counters on posts (hits, reactions, comment_count, trending state) are only
-- writable through the hit_post / react_to_post / add_comment functions below,
-- so one user can't rewrite another user's post or inflate its numbers.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_date := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (replaces the Base44 User entity: role + display_name)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  full_name     text,
  display_name  text,
  role          text not null default 'user' check (role in ('admin', 'user')),
  created_date  timestamptz not null default now(),
  updated_date  timestamptz not null default now()
);

create trigger profiles_updated_date
  before update on public.profiles
  for each row execute function public.set_updated_date();

-- Create a profile for every new auth user (email/password and Google alike)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users that signed up before this migration ran
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
from auth.users u
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id                   uuid primary key default gen_random_uuid(),
  created_date         timestamptz not null default now(),
  updated_date         timestamptz not null default now(),
  created_by_id        uuid default auth.uid() references auth.users (id) on delete cascade,
  title                text,
  media_url            text not null,
  media_type           text not null check (media_type in ('image', 'video')),
  thumbnail_url        text,
  guest_author_id      text,
  hits                 integer not null default 0,
  is_trending          boolean not null default false,
  expires_at           timestamptz,
  trending_expires_at  timestamptz,
  -- Free text on purpose: the app writes "news", which the Base44 enum
  -- (Nature/Urban/Art/Food/Travel/Sports/Gaming/AI) never enforced.
  category             text,
  hashtags             text[] not null default '{}',
  emojis               text[] not null default '{}',
  reactions            jsonb not null default '{}'::jsonb,
  comment_count        integer not null default 0,
  "isNews"             boolean not null default false,
  source_url           text,
  "isPromoted"         boolean not null default false
);

create index posts_created_date_idx on public.posts (created_date desc);
create index posts_created_by_id_idx on public.posts (created_by_id);

create trigger posts_updated_date
  before update on public.posts
  for each row execute function public.set_updated_date();

-- Client inserts (members and guests) can't start a post with fake engagement
-- or extra lifetime. The service role (seedNewsPosts) is left alone.
create or replace function public.sanitize_new_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.hits                := 0;
    new.reactions           := '{}'::jsonb;
    new.comment_count       := 0;
    new.is_trending         := false;
    new.trending_expires_at := null;
    new."isPromoted"        := false;
    new."isNews"            := false;
    new.expires_at          := least(coalesce(new.expires_at, now() + interval '1 hour'),
                                     now() + interval '1 hour');
  end if;
  return new;
end;
$$;

create trigger posts_sanitize_insert
  before insert on public.posts
  for each row execute function public.sanitize_new_post();

-- Mirrors engagementScore() in src/lib/engagement.js:
-- 1 hit = 1 pt, 1 reaction = 2 pts, 1 comment = 5 pts
create or replace function public.engagement_score(p public.posts)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select p.hits
       + 2 * coalesce((select sum(r.value::numeric) from jsonb_each_text(p.reactions) r), 0)
       + 5 * p.comment_count;
$$;

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------

create table public.votes (
  id             uuid primary key default gen_random_uuid(),
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  created_by_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id        uuid not null references public.posts (id) on delete cascade,
  value          integer not null default 1,
  unique (post_id, created_by_id)
);

create index votes_created_date_idx on public.votes (created_date desc);
create index votes_created_by_id_idx on public.votes (created_by_id);

create trigger votes_updated_date
  before update on public.votes
  for each row execute function public.set_updated_date();

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  created_by_id  uuid default auth.uid() references auth.users (id) on delete cascade,
  post_id        uuid not null references public.posts (id) on delete cascade,
  text           text not null check (char_length(btrim(text)) between 1 and 1000)
);

create index comments_post_id_idx on public.comments (post_id);
create index comments_created_by_id_idx on public.comments (created_by_id);

create trigger comments_updated_date
  before update on public.comments
  for each row execute function public.set_updated_date();

-- ---------------------------------------------------------------------------
-- flags
-- ---------------------------------------------------------------------------

create table public.flags (
  id             uuid primary key default gen_random_uuid(),
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  created_by_id  uuid default auth.uid() references auth.users (id) on delete cascade,
  post_id        uuid not null references public.posts (id) on delete cascade,
  reason         text check (reason in ('Spam', 'Inappropriate', 'Harassment'))
);

create index flags_post_id_idx on public.flags (post_id);
create index flags_created_by_id_idx on public.flags (created_by_id);

create trigger flags_updated_date
  before update on public.flags
  for each row execute function public.set_updated_date();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  created_date   timestamptz not null default now(),
  updated_date   timestamptz not null default now(),
  created_by_id  uuid default auth.uid() references auth.users (id) on delete cascade,
  recipient_id   uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('hit', 'reaction', 'comment', 'trending')),
  post_id        uuid not null references public.posts (id) on delete cascade,
  post_title     text,
  actor_name     text,
  emoji          text,
  read           boolean not null default false
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_date desc);

create trigger notifications_updated_date
  before update on public.notifications
  for each row execute function public.set_updated_date();

-- ---------------------------------------------------------------------------
-- Table privileges (column-level where it matters), then row level security
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.posts, public.votes, public.comments,
              public.flags, public.notifications
  from anon, authenticated;

grant select on public.posts, public.votes, public.comments, public.flags to anon, authenticated;

grant insert on public.posts, public.flags to anon, authenticated;
grant update (title, category, hashtags, emojis) on public.posts to authenticated;
grant delete on public.posts, public.votes, public.comments, public.flags to authenticated;

grant select, insert, delete on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.votes         enable row level security;
alter table public.comments      enable row level security;
alter table public.flags         enable row level security;
alter table public.notifications enable row level security;

-- profiles: you see and edit only your own (admins see all)
create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- posts: public read, anyone (incl. guests) creates, owner/admin edit + delete
create policy "posts: public read" on public.posts
  for select to anon, authenticated
  using (true);

create policy "posts: create as self or guest" on public.posts
  for insert to anon, authenticated
  with check (created_by_id is not distinct from (select auth.uid()));

create policy "posts: owner or admin update" on public.posts
  for update to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin())
  with check (created_by_id = (select auth.uid()) or public.is_admin());

create policy "posts: owner or admin delete" on public.posts
  for delete to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin());

-- votes: public read (Hits page shows platform spikes); created via hit_post()
create policy "votes: public read" on public.votes
  for select to anon, authenticated
  using (true);

create policy "votes: owner or admin delete" on public.votes
  for delete to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin());

-- comments: public read; created via add_comment()
create policy "comments: public read" on public.comments
  for select to anon, authenticated
  using (true);

create policy "comments: owner or admin delete" on public.comments
  for delete to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin());

-- flags: public read (feed hides posts with 3+ distinct reporters), anyone reports
create policy "flags: public read" on public.flags
  for select to anon, authenticated
  using (true);

create policy "flags: create as self or guest" on public.flags
  for insert to anon, authenticated
  with check (created_by_id is not distinct from (select auth.uid()));

create policy "flags: owner or admin delete" on public.flags
  for delete to authenticated
  using (created_by_id = (select auth.uid()) or public.is_admin());

-- notifications: only the recipient (or an admin) sees, marks read, deletes
create policy "notifications: recipient read" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin());

create policy "notifications: members create as self" on public.notifications
  for insert to authenticated
  with check (created_by_id = (select auth.uid()));

create policy "notifications: recipient update" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin())
  with check (recipient_id = (select auth.uid()) or public.is_admin());

create policy "notifications: recipient delete" on public.notifications
  for delete to authenticated
  using (recipient_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------------
-- Engagement RPCs (called via base44.rpc from the client)
-- Each returns the updated post as JSON, or NULL when nothing changed.
-- ---------------------------------------------------------------------------

-- A Hit = +1 point and +1 minute of life; 20 engagement points promote the
-- post to the 24h trending belt. One hit per member per post.
create or replace function public.hit_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_post public.posts;
begin
  if v_uid is null then
    raise exception 'Sign in to hit posts' using errcode = '42501';
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
    end if;
  end if;

  update public.posts
     set hits = v_post.hits,
         expires_at = v_post.expires_at,
         is_trending = v_post.is_trending,
         trending_expires_at = v_post.trending_expires_at
   where id = p_post_id
  returning * into v_post;

  return to_jsonb(v_post);
end;
$$;

-- An emoji reaction = +2 points and +2 minutes of life
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

  return to_jsonb(v_post);
end;
$$;

-- A comment = +5 points and +5 minutes of life. Guests may comment (as on Base44).
create or replace function public.add_comment(p_post_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
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

revoke execute on function public.hit_post(uuid)            from public, anon;
revoke execute on function public.react_to_post(uuid, text) from public, anon;
revoke execute on function public.add_comment(uuid, text)   from public;
revoke execute on function public.engagement_score(public.posts) from public, anon, authenticated;
grant  execute on function public.hit_post(uuid)            to authenticated;
grant  execute on function public.react_to_post(uuid, text) to authenticated;
grant  execute on function public.add_comment(uuid, text)   to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (entities.X.subscribe)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.posts, public.votes, public.comments, public.flags, public.notifications;

-- ---------------------------------------------------------------------------
-- Storage: public "media" bucket for post uploads
-- Members upload into "<their uid>/…", guests into "guest/…".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/*', 'video/*']) -- 50 MB
on conflict (id) do nothing;

create policy "media: members upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "media: guests upload to guest folder" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'guest'
  );

create policy "media: owners delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);
