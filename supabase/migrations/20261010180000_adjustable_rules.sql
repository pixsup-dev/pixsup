-- Adjustable game rules: every number below is read from app_settings, so an
-- admin can change it from Admin → Settings without a code change. Each has a
-- default equal to today's behaviour, so nothing changes until someone does.
-- Also: an emergency "pause posting" switch and a site-wide announcement.

-- ---------------------------------------------------------------------------
-- Reading settings
-- ---------------------------------------------------------------------------

create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings
                    where key = p_key and jsonb_typeof(value) = 'number'), p_default);
$$;

create or replace function public.setting_on(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings
                    where key = p_key and jsonb_typeof(value) = 'boolean'), p_default);
$$;

-- Triggers that run as the member (sanitize_new_post) need these too. They
-- only ever return numbers or on/off values, never text settings.
revoke execute on function public.setting_num(text, numeric) from public;
revoke execute on function public.setting_on(text, boolean) from public;
grant execute on function public.setting_num(text, numeric) to anon, authenticated;
grant execute on function public.setting_on(text, boolean) to anon, authenticated;

-- The numbers the app shows people ("+5 min", the Graveyard countdown…)
create or replace function public.game_rules()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'post_life_minutes',     public.setting_num('post_life_minutes', 60),
    'hit_minutes',           public.setting_num('hit_minutes', 5),
    'react_minutes',         public.setting_num('react_minutes', 3),
    'comment_minutes',       public.setting_num('comment_minutes', 10),
    'trending_points',       public.setting_num('trending_points', 20),
    'trending_hours',        public.setting_num('trending_hours', 24),
    'revive_window_minutes', public.setting_num('revive_window_minutes', 10),
    'revive_life_minutes',   public.setting_num('revive_life_minutes', 30),
    'revive_votes_needed',   public.setting_num('revive_votes_needed', 3),
    'posting_paused',        public.setting_on('posting_paused', false),
    'announcement',          coalesce((select value #>> '{}' from public.app_settings where key = 'announcement'), '')
  );
$$;

grant execute on function public.game_rules() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rules that now read their numbers from settings
-- ---------------------------------------------------------------------------

-- New posts: starting life
create or replace function public.sanitize_new_post()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_life interval := make_interval(mins => public.setting_num('post_life_minutes', 60)::int);
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
    new.boosted_at          := null;
    new.spotlight_until     := null;
    new.explainer           := null;
    -- the author's city from their profile, never whatever the client sent
    new.city                := (select p.city from public.profiles p where p.id = auth.uid());
    -- members may attach a poll (validated by posts_poll_valid); votes start at 0
    new.poll_counts         := case when new.poll is null then null
                                    else (select jsonb_agg(0) from jsonb_array_elements(new.poll -> 'options'))
                               end;
    new.expires_at          := least(coalesce(new.expires_at, now() + v_life), now() + v_life);
  end if;
  return new;
end;
$$;

-- Trending: points needed and how long it lasts
create or replace function public.promote_if_trending()
returns trigger
language plpgsql
security definer -- members' own title edits fire it too; engagement_score isn't theirs to call
set search_path = ''
as $$
begin
  if not new.is_trending and public.engagement_score(new) >= public.setting_num('trending_points', 20) then
    new.is_trending         := true;
    new.trending_expires_at := now() + make_interval(hours => public.setting_num('trending_hours', 24)::int);
    new.expires_at          := greatest(coalesce(new.expires_at, now()), new.trending_expires_at);
  end if;
  return new;
end;
$$;

revoke execute on function public.promote_if_trending() from public, anon, authenticated;

-- Hits: time added
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
    v_post.expires_at := greatest(coalesce(v_post.expires_at, now()), now())
                         + make_interval(mins => public.setting_num('hit_minutes', 5)::int);
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

-- Reactions: time added (and the fair-reactions switch, as before)
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
  v_caps  boolean := public.setting_on('reaction_caps', true);
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
                           then greatest(coalesce(expires_at, now()), now())
                                + make_interval(mins => public.setting_num('react_minutes', 3)::int)
                           else expires_at end
   where id = p_post_id
  returning * into v_post;

  insert into public.reaction_events (post_id, emoji) values (p_post_id, p_emoji);

  perform public.notify_post_owner(v_post, 'reaction', p_emoji);

  return to_jsonb(v_post);
end;
$$;

-- Comments: time added, and the fair-comments switch
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
  v_caps  boolean := public.setting_on('comment_caps', true);
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

  -- fair comments on: only someone else's first comment buys time; off: every comment
  update public.posts
     set comment_count = comment_count + 1,
         expires_at = case when not v_caps or (v_first and created_by_id is distinct from v_uid)
                           then greatest(coalesce(expires_at, now()), now())
                                + make_interval(mins => public.setting_num('comment_minutes', 10)::int)
                           else expires_at end
   where id = p_post_id
  returning * into v_post;

  perform public.notify_post_owner(v_post, 'comment');

  return to_jsonb(v_post);
end;
$$;

-- Posting: the pause switch, posts per hour, and one challenge entry a day
create or replace function public.enforce_posting_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tag text;
  v_max integer := public.setting_num('posts_per_hour', 10)::int;
begin
  -- only members posting from the app; the server (news, admin tools) is exempt
  if coalesce(auth.role(), '') <> 'authenticated' or v_uid is null then
    return new;
  end if;

  if public.setting_on('posting_paused', false) and not public.is_admin() then
    raise exception 'Posting is paused for a few minutes. Please try again soon.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.posts
       where created_by_id = v_uid
         and created_date > now() - interval '1 hour') >= v_max then
    raise exception 'Slow down: you can post up to % times an hour. Try again a little later.', v_max
      using errcode = 'P0001';
  end if;

  v_tag := (public.todays_challenge()).tag;
  if v_tag is null
     or not exists (select 1 from unnest(new.hashtags) h where lower(h) = lower(v_tag)) then
    return new;
  end if;

  -- It must fit the prompt (checked by the AI when AI moderation is on)
  if public.ai_moderation_required()
     and not exists (
       select 1 from public.media_approvals a
        where a.file_url = new.media_url
          and a.created_by_id = v_uid
          and a.approved
          and lower(a.challenge_tag) = lower(v_tag)
     ) then
    new.hashtags := public.strip_tag(new.hashtags, v_tag);
    return new;
  end if;

  -- One entry per member per day (switchable)
  if public.setting_on('challenge_one_entry', true) and public.my_challenge_entry_today() then
    new.hashtags := public.strip_tag(new.hashtags, v_tag);
  end if;

  return new;
end;
$$;

-- Graveyard: window and the life a revived post gets
create or replace function public.revive_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_post   public.posts;
  v_needed integer := public.setting_num('revive_votes_needed', 3)::int;
  v_window interval := make_interval(mins => public.setting_num('revive_window_minutes', 10)::int);
  v_done   boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to revive posts' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post."isNews" or v_post.hidden_at is not null then
    raise exception 'This post can''t be revived' using errcode = 'P0002';
  end if;
  if v_post.created_by_id = v_uid then
    raise exception 'Ask others to revive your post. Share it!' using errcode = '22023';
  end if;
  if v_post.revived_at is not null then
    raise exception 'This post was already revived once' using errcode = '22023';
  end if;
  if v_post.expires_at is null or v_post.expires_at > now() then
    raise exception 'This post is still alive. Hit it instead!' using errcode = '22023';
  end if;
  if v_post.expires_at < now() - v_window then
    raise exception 'Too late: this post is gone for good' using errcode = 'P0002';
  end if;

  insert into public.revive_votes (post_id, user_id) values (p_post_id, v_uid)
  on conflict do nothing;
  if found then
    v_post.revive_votes := v_post.revive_votes + 1;
    v_done := v_post.revive_votes >= v_needed;
    perform set_config('pixsup.reviving', 'on', true);
    update public.posts
       set revive_votes = v_post.revive_votes,
           revived_at = case when v_done then now() else revived_at end,
           expires_at = case when v_done
                             then now() + make_interval(mins => public.setting_num('revive_life_minutes', 30)::int)
                             else expires_at end
     where id = p_post_id
    returning * into v_post;
    perform set_config('pixsup.reviving', 'off', true);
    if v_done then
      perform public.notify_post_owner(v_post, 'revive');
    end if;
  end if;

  return jsonb_build_object('post', to_jsonb(v_post), 'votes', v_post.revive_votes,
                            'needed', v_needed, 'revived', v_post.revived_at is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin → Settings: everything above can be read and changed there
-- ---------------------------------------------------------------------------

create or replace function public.admin_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return public.game_rules() || jsonb_build_object(
    'reaction_caps',            public.setting_on('reaction_caps', true),
    'comment_caps',             public.setting_on('comment_caps', true),
    'challenge_one_entry',      public.setting_on('challenge_one_entry', true),
    'ai_moderation_required',   public.setting_on('ai_moderation_required', false),
    'text_moderation_required', public.setting_on('text_moderation_required', false),
    'boosts_enabled',           public.setting_on('boosts_enabled', false),
    'posts_per_hour',           public.setting_num('posts_per_hour', 10)
  );
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n   numeric;
  v_min numeric;
  v_max numeric;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_key in ('reaction_caps', 'comment_caps', 'challenge_one_entry', 'ai_moderation_required',
               'text_moderation_required', 'boosts_enabled', 'posting_paused') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'That setting is on or off' using errcode = '22023';
    end if;
  elsif p_key = 'announcement' then
    if jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') > 200 then
      raise exception 'Keep the announcement under 200 characters' using errcode = '22023';
    end if;
  elsif p_key in ('post_life_minutes', 'hit_minutes', 'react_minutes', 'comment_minutes', 'trending_points',
                  'trending_hours', 'revive_window_minutes', 'revive_life_minutes', 'revive_votes_needed',
                  'posts_per_hour') then
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'That setting needs a number' using errcode = '22023';
    end if;
    v_n := (p_value #>> '{}')::numeric;
    -- allowed range for each number
    v_min := 1;
    if p_key in ('hit_minutes', 'react_minutes', 'comment_minutes') then
      v_min := 0;
    end if;
    v_max := 240;
    if p_key = 'post_life_minutes' then
      v_max := 1440;
    elsif p_key = 'trending_hours' then
      v_max := 168;
    elsif p_key = 'trending_points' then
      v_max := 1000;
    elsif p_key = 'revive_votes_needed' then
      v_max := 50;
    elsif p_key = 'posts_per_hour' then
      v_max := 100;
    end if;
    if v_n <> trunc(v_n) or v_n < v_min or v_n > v_max then
      raise exception 'Pick a whole number from % to %', v_min, v_max using errcode = '22023';
    end if;
  else
    raise exception 'That setting can''t be changed here' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
  perform public.log_admin_action('Changed setting', p_key || ' → ' || coalesce(nullif(p_value #>> '{}', ''), '(empty)'));
end;
$$;

revoke execute on function public.admin_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_settings() to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
