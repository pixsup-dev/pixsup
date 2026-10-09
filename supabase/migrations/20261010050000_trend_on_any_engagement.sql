-- Promotion to the 24-Hour Trending Belt used to happen only inside
-- hit_post, so a post pushed past 20 points by reactions, comments or poll
-- votes never trended. Now a trigger promotes on any update that crosses 20,
-- and notifies the owner once. hit_post drops its own copy of that logic.

create or replace function public.promote_if_trending()
returns trigger
language plpgsql
security definer -- members' own title edits fire it too; engagement_score isn't theirs to call
set search_path = ''
as $$
begin
  if not new.is_trending and public.engagement_score(new) >= 20 then
    new.is_trending         := true;
    new.trending_expires_at := now() + interval '24 hours';
    new.expires_at          := greatest(coalesce(new.expires_at, now()), new.trending_expires_at);
  end if;
  return new;
end;
$$;

revoke execute on function public.promote_if_trending() from public, anon, authenticated;

create trigger posts_promote_if_trending
  before update on public.posts
  for each row execute function public.promote_if_trending();

create or replace function public.notify_trending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_trending and not old.is_trending then
    perform public.notify_post_owner(new, 'trending');
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_trending() from public, anon, authenticated;

create trigger posts_notify_trending
  after update on public.posts
  for each row execute function public.notify_trending();

create or replace function public.hit_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_post     public.posts;
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
    v_post.expires_at := greatest(coalesce(v_post.expires_at, now()), now()) + interval '5 minutes';
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

  -- keeping someone else's post alive earns a lifeline (and a rescue, if it was dying)
  if v_post.created_by_id is distinct from v_uid then
    update public.profiles
       set lifelines = lifelines + 1,
           rescues = rescues + case when v_rescued then 1 else 0 end
     where id = v_uid;
  end if;

  if v_rescued then
    perform public.notify_post_owner(v_post, 'rescue');
  else
    perform public.notify_post_owner(v_post, 'hit');
  end if;

  return to_jsonb(v_post);
end;
$$;

-- Promote live posts that already crossed 20 points without trending
update public.posts
   set is_trending = is_trending
 where not is_trending
   and (expires_at is null or expires_at > now())
   and public.engagement_score(posts) >= 20;
