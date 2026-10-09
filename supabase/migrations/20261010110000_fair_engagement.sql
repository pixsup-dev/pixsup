-- Fair engagement (bot protection): one person can't keep a post alive alone.
--   reactions: each member can use each emoji once per post, up to 3 emojis;
--              only their first reaction on a post adds time
--   comments:  only a member's first comment on a post adds time; slow mode
--              of one comment every 5 seconds, 60 an hour
--   own posts: your own reactions and comments don't add time to your post
--   speed:     at most 60 reactions a minute per member across the app
-- (Hits were already one per member per post.)

create table if not exists public.post_reactions (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  emoji        text not null,
  created_date timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create index if not exists post_reactions_user_idx on public.post_reactions (user_id, created_date desc);

alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from anon, authenticated;
-- No policies: written only by react_to_post.

create or replace function public.react_to_post(p_post_id uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_post  public.posts;
  v_mine  integer;
  v_time  boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to react' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if p_emoji is null or char_length(p_emoji) not between 1 and 16 then
    raise exception 'Invalid reaction' using errcode = '22023';
  end if;
  if (select count(*) from public.post_reactions
       where user_id = v_uid and created_date > now() - interval '1 minute') >= 60 then
    raise exception 'Slow down a little' using errcode = '22023';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  -- each emoji once per member, at most 3 different ones: extra taps change nothing
  select count(*) into v_mine from public.post_reactions where post_id = p_post_id and user_id = v_uid;
  if v_mine >= 3 or exists (select 1 from public.post_reactions
                             where post_id = p_post_id and user_id = v_uid and emoji = p_emoji) then
    return to_jsonb(v_post);
  end if;

  if not (v_post.reactions ? p_emoji)
     and (select count(*) from jsonb_object_keys(v_post.reactions)) >= 32 then
    raise exception 'Too many distinct reactions on this post' using errcode = '22023';
  end if;

  insert into public.post_reactions (post_id, user_id, emoji) values (p_post_id, v_uid, p_emoji);

  -- only someone else's first reaction buys the post time
  v_time := v_mine = 0 and v_post.created_by_id is distinct from v_uid;

  update public.posts
     set reactions = jsonb_set(
           reactions,
           array[p_emoji],
           to_jsonb(coalesce((reactions ->> p_emoji)::int, 0) + 1)
         ),
         expires_at = case when v_time
                           then greatest(coalesce(expires_at, now()), now()) + interval '3 minutes'
                           else expires_at end
   where id = p_post_id
  returning * into v_post;

  insert into public.reaction_events (post_id, emoji) values (p_post_id, p_emoji);

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
  v_uid   uuid := auth.uid();
  v_post  public.posts;
  v_first boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to comment' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if not public.text_check_passed() then
    raise exception 'Please refresh Pixsup and try again' using errcode = '42501';
  end if;
  -- slow mode: one comment every 5 seconds, at most 60 an hour
  if exists (select 1 from public.comments
              where created_by_id = v_uid and created_date > now() - interval '5 seconds')
     or (select count(*) from public.comments
          where created_by_id = v_uid and created_date > now() - interval '1 hour') >= 60 then
    raise exception 'Slow down a little' using errcode = '22023';
  end if;

  v_first := not exists (select 1 from public.comments where post_id = p_post_id and created_by_id = v_uid);

  insert into public.comments (post_id, text, created_by_id)
  values (p_post_id, p_text, v_uid);

  -- only someone else's first comment buys the post time
  update public.posts
     set comment_count = comment_count + 1,
         expires_at = case when v_first and created_by_id is distinct from v_uid
                           then greatest(coalesce(expires_at, now()), now()) + interval '10 minutes'
                           else expires_at end
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'comment');

  return to_jsonb(v_post);
end;
$$;

revoke execute on function public.react_to_post(uuid, text) from public, anon;
grant execute on function public.react_to_post(uuid, text) to authenticated;
revoke execute on function public.add_comment(uuid, text) from public, anon;
grant execute on function public.add_comment(uuid, text) to authenticated;
