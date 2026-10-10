-- Home sections an admin can switch off (Admin → Settings → Home sections):
-- the "live right now" line, New faces, About to die and the Graveyard row.
-- All on by default.

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

grant execute on function public.game_rules() to anon, authenticated;

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

revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
