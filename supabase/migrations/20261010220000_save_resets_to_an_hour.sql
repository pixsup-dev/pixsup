-- Saving a dying post puts it back to a full hour instead of just one
-- hit's worth of time. "Dying" now means the last 10 minutes on the server
-- too, matching what the app shows (it was 5). The hour is an Admin setting:
-- rescue_minutes.

create or replace function public.game_rules()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'post_life_minutes',      public.setting_num('post_life_minutes', 60),
    'hit_minutes',            public.setting_num('hit_minutes', 5),
    'react_minutes',          public.setting_num('react_minutes', 3),
    'comment_minutes',        public.setting_num('comment_minutes', 10),
    'trending_points',        public.setting_num('trending_points', 20),
    'trending_hours',         public.setting_num('trending_hours', 24),
    'rescue_minutes',         public.setting_num('rescue_minutes', 60),
    'revive_window_minutes',  public.setting_num('revive_window_minutes', 10),
    'revive_life_minutes',    public.setting_num('revive_life_minutes', 30),
    'revive_votes_needed',    public.setting_num('revive_votes_needed', 3),
    'new_face_posts',         public.setting_num('new_face_posts', 3),
    'new_face_bonus_minutes', public.setting_num('new_face_bonus_minutes', 30),
    'posting_paused',         public.setting_on('posting_paused', false),
    'show_live_now',          public.setting_on('show_live_now', true),
    'show_new_faces',         public.setting_on('show_new_faces', true),
    'show_rescue_row',        public.setting_on('show_rescue_row', true),
    'show_graveyard',         public.setting_on('show_graveyard', true),
    'announcement',           coalesce((select value #>> '{}' from public.app_settings where key = 'announcement'), '')
  );
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
               'text_moderation_required', 'boosts_enabled', 'posting_paused',
               'show_live_now', 'show_new_faces', 'show_rescue_row', 'show_graveyard') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'That setting is on or off' using errcode = '22023';
    end if;
  elsif p_key = 'announcement' then
    if jsonb_typeof(p_value) <> 'string' or char_length(p_value #>> '{}') > 200 then
      raise exception 'Keep the announcement under 200 characters' using errcode = '22023';
    end if;
  elsif p_key in ('post_life_minutes', 'hit_minutes', 'react_minutes', 'comment_minutes', 'trending_points',
                  'trending_hours', 'revive_window_minutes', 'revive_life_minutes', 'revive_votes_needed',
                  'posts_per_hour', 'rescue_minutes') then
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
    if p_key in ('post_life_minutes', 'rescue_minutes') then
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

revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

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

  -- a save: someone else's post in its last 10 minutes (the "dying" window
  -- the app shows in About to die and the live line)
  v_rescued := not v_post.is_trending
               and v_post.expires_at > now()
               and v_post.expires_at <= now() + interval '10 minutes'
               and v_post.created_by_id is distinct from v_uid;

  v_post.hits := v_post.hits + 1;
  if not v_post.is_trending then
    v_post.expires_at := greatest(coalesce(v_post.expires_at, now()), now())
                         + make_interval(mins => public.setting_num('hit_minutes', 5)::int);
  end if;
  -- a save puts the post back to a full hour (Admin → Settings), or more if
  -- the hit already gave it more
  if v_rescued then
    v_post.expires_at := greatest(v_post.expires_at,
                                  now() + make_interval(mins => public.setting_num('rescue_minutes', 60)::int));
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
