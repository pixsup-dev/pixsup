-- A switch for the reaction caps (from 20261010110000_fair_engagement.sql).
-- OFF for testing: every emoji tap adds 3 minutes, as often as you like, on
-- any post including your own. Turn it back ON before launch:
--   update public.app_settings set value = 'true' where key = 'reaction_caps';
-- The limit of 60 new reactions a minute always applies.

insert into public.app_settings (key, value) values ('reaction_caps', 'false')
on conflict (key) do update set value = excluded.value;

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
  v_caps  boolean := coalesce((select value = 'true'::jsonb from public.app_settings where key = 'reaction_caps'), true);
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

  select count(*) into v_mine from public.post_reactions where post_id = p_post_id and user_id = v_uid;
  if v_caps then
    -- each emoji once per member, at most 3 different ones: extra taps change nothing
    if v_mine >= 3 or exists (select 1 from public.post_reactions
                               where post_id = p_post_id and user_id = v_uid and emoji = p_emoji) then
      return to_jsonb(v_post);
    end if;
  end if;

  if not (v_post.reactions ? p_emoji)
     and (select count(*) from jsonb_object_keys(v_post.reactions)) >= 32 then
    raise exception 'Too many distinct reactions on this post' using errcode = '22023';
  end if;

  -- caps off: a repeat tap of the same emoji just refreshes its row
  insert into public.post_reactions (post_id, user_id, emoji) values (p_post_id, v_uid, p_emoji)
  on conflict (post_id, user_id, emoji) do update set created_date = now();

  -- caps on: only someone else's first reaction buys time. Caps off: every tap.
  v_time := not v_caps or (v_mine = 0 and v_post.created_by_id is distinct from v_uid);

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

revoke execute on function public.react_to_post(uuid, text) from public, anon;
grant execute on function public.react_to_post(uuid, text) to authenticated;
