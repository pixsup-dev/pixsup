-- Longer life per interaction. Each member can hit a post only once, so +1
-- minute per hit made posts die too fast. New bonuses:
--   hit +5 minutes (was 1), reaction +3 minutes (was 2), comment +10 minutes (was 5).
-- Functions are otherwise unchanged.

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
    v_post.expires_at := greatest(coalesce(v_post.expires_at, now()), now()) + interval '5 minutes';
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
         expires_at = greatest(coalesce(expires_at, now()), now()) + interval '3 minutes'
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
         expires_at = greatest(coalesce(expires_at, now()), now()) + interval '10 minutes'
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'comment');

  return to_jsonb(v_post);
end;
$$;
