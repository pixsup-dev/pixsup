-- 🌱 New faces: a member's first few posts (3 by default) are marked new_face,
-- start with extra time (30 minutes by default) and get their own row on Home,
-- so nobody's first post dies unseen. The pushAlerts function tells the
-- member when their new-face post gets its first hit.

alter table public.profiles add column if not exists posts_made integer not null default 0;
alter table public.posts add column if not exists new_face boolean not null default false;

-- Count what members have posted so far
update public.profiles p
   set posts_made = (select count(*) from public.posts where created_by_id = p.id)
 where posts_made = 0;

create or replace function public.mark_new_face()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_made integer;
begin
  -- set here, never by the app
  new.new_face := false;
  if coalesce(auth.role(), '') <> 'authenticated' or v_uid is null then
    return new;
  end if;
  select posts_made into v_made from public.profiles where id = v_uid for update;
  update public.profiles set posts_made = coalesce(v_made, 0) + 1 where id = v_uid;
  if coalesce(v_made, 0) < public.setting_num('new_face_posts', 3) then
    new.new_face := true;
    new.expires_at := coalesce(new.expires_at, now())
                      + make_interval(mins => public.setting_num('new_face_bonus_minutes', 30)::int);
  end if;
  return new;
end;
$$;

drop trigger if exists posts_zz_new_face on public.posts;
create trigger posts_zz_new_face -- "zz": after posts_sanitize_insert has set the starting life
  before insert on public.posts
  for each row execute function public.mark_new_face();

-- New-face numbers are adjustable too (not shown in Admin; defaults are fine)
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
    'announcement',           coalesce((select value #>> '{}' from public.app_settings where key = 'announcement'), '')
  );
$$;

grant execute on function public.game_rules() to anon, authenticated;

-- When the "first hit on your new-face post" alert was sent (once per post)
alter table public.posts add column if not exists first_hit_alert_at timestamptz;
