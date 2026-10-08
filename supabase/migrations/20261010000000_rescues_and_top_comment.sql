-- Rescues and top comments.
--   * A hit that lands while a post has under 5 minutes left is a rescue: the
--     post shows "Saved by @name" and the owner gets a 'rescue' notification.
--   * posts.top_comment holds the latest comment ({text, author_id, username})
--     so tiles and World Pulse cards can show the conversation without a query.
-- Only the server sets any of these.

alter table public.posts
  add column saved_by_id   uuid references auth.users (id) on delete set null,
  add column saved_by_name text,
  add column saved_at      timestamptz,
  add column top_comment   jsonb;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('hit', 'reaction', 'comment', 'trending', 'rescue'));

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
    new.top_story           := false;
    new.summary             := null;
    new.saved_by_id         := null;
    new.saved_by_name       := null;
    new.saved_at            := null;
    new.top_comment         := null;
    new.expires_at          := least(coalesce(new.expires_at, now() + interval '1 hour'),
                                     now() + interval '1 hour');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- hit_post: same as before, plus rescue credit
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
  v_rescued  boolean := false;
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

  -- a last-minute save of someone else's dying post
  v_rescued := not v_post.is_trending
               and v_post.expires_at > now()
               and v_post.expires_at <= now() + interval '5 minutes'
               and v_post.created_by_id is distinct from v_uid;

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
         trending_expires_at = v_post.trending_expires_at,
         saved_by_id = case when v_rescued then v_uid else saved_by_id end,
         saved_by_name = case when v_rescued
                              then (select username from public.profiles where id = v_uid)
                              else saved_by_name end,
         saved_at = case when v_rescued then now() else saved_at end
   where id = p_post_id
  returning * into v_post;

  if v_rescued then
    perform public.notify_post_owner(v_post, 'rescue');
  else
    perform public.notify_post_owner(v_post, 'hit');
  end if;
  if v_promoted then
    perform public.notify_post_owner(v_post, 'trending');
  end if;

  return to_jsonb(v_post);
end;
$$;

-- ---------------------------------------------------------------------------
-- top_comment: kept in sync with the newest comment
-- ---------------------------------------------------------------------------

create or replace function public.refresh_top_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts p
     set top_comment = (
           select jsonb_build_object(
                    'text', left(c.text, 140),
                    'author_id', c.created_by_id,
                    'username', pr.username)
             from public.comments c
             left join public.profiles pr on pr.id = c.created_by_id
            where c.post_id = v_post_id
              and not coalesce(pr.banned, false)
            order by c.created_date desc
            limit 1)
   where p.id = v_post_id;
  return null;
end;
$$;

revoke execute on function public.refresh_top_comment() from public, anon, authenticated;

create trigger comments_refresh_top_comment
  after insert or delete on public.comments
  for each row execute function public.refresh_top_comment();

-- backfill posts that already have comments
update public.posts p
   set top_comment = (
         select jsonb_build_object(
                  'text', left(c.text, 140),
                  'author_id', c.created_by_id,
                  'username', pr.username)
           from public.comments c
           left join public.profiles pr on pr.id = c.created_by_id
          where c.post_id = p.id
            and not coalesce(pr.banned, false)
          order by c.created_date desc
          limit 1)
 where p.comment_count > 0;
