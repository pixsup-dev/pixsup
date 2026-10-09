-- Five features in one migration:
--   1. AI checks on comments and live chat: add_comment / send_chat only accept
--      text the postText Edge Function approved (it sends a secret header),
--      once text_moderation_required is switched on.
--   2. Daily Challenge: one photo prompt per day (optionally sponsored).
--   3. "Explain it": a cached AI explainer on news posts.
--   4. Mood trends: reaction history, so cards can say "😡 Anger rising".
--   5. Morning Pulse email (opt-in) and City Pulse (your city on posts).

-- ===========================================================================
-- 1. AI text checks
-- ===========================================================================

insert into public.app_settings (key, value) values
  ('text_moderation_required', 'false'),
  ('text_check_secret', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (key) do nothing;

-- True when text moderation is off, or this request came from postText
-- (PostgREST exposes request headers; only the server knows the secret)
create or replace function public.text_check_passed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce(
           (select value = 'true'::jsonb from public.app_settings where key = 'text_moderation_required'),
           false)
      or coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-pixsup-text-check', '')
         = (select value #>> '{}' from public.app_settings where key = 'text_check_secret');
$$;

revoke execute on function public.text_check_passed() from public, anon, authenticated;

-- ===========================================================================
-- 2. Daily Challenge
-- ===========================================================================

create table public.challenge_prompts (
  id     serial primary key,
  prompt text not null,
  tag    text not null
);

insert into public.challenge_prompts (prompt, tag) values
  ('Show us the view from where you are right now', '#MyViewNow'),
  ('What''s on your plate today?', '#WhatsForLunch'),
  ('Your pet, doing pet things', '#PetCheck'),
  ('The best sky you can find today', '#SkyWatch'),
  ('Your desk, your setup, your workspace', '#MySetup'),
  ('Something that made you smile today', '#SmallJoys'),
  ('Your favourite street in your city', '#MyStreet'),
  ('Show us your shoes', '#ShoeCheck'),
  ('Coffee, tea, or something stronger?', '#CupCheck'),
  ('Something old you still love', '#OldButGold'),
  ('Nature, up close', '#UpClose'),
  ('Your ride: car, bike, bus or feet', '#MyRide'),
  ('A sunset or sunrise', '#GoldenHour'),
  ('What you''re reading, watching or playing', '#NowPlaying'),
  ('The weirdest thing you saw today', '#WeirdFind'),
  ('Your favourite corner at home', '#CozyCorner'),
  ('Something you made yourself', '#MadeByMe'),
  ('Your local spot: café, park, shop', '#LocalSpot'),
  ('Shadows and reflections', '#ShadowPlay'),
  ('One photo that sums up your week', '#MyWeek'),
  ('Street art near you', '#StreetArt'),
  ('Your fit today', '#FitCheck'),
  ('Something blue', '#SomethingBlue'),
  ('Rain, snow or sunshine: today''s weather', '#WeatherCheck'),
  ('Your best food photo', '#FoodPic'),
  ('Your hometown in one picture', '#Hometown'),
  ('Night lights', '#NightLights'),
  ('A tiny detail most people miss', '#TinyDetails'),
  ('Your workout or happy place', '#HappyPlace'),
  ('Show us something green', '#GoGreen');

create table public.daily_challenges (
  day         date primary key,
  prompt      text not null check (char_length(prompt) between 3 and 120),
  tag         text not null check (tag ~ '^#[A-Za-z0-9]{2,30}$'),
  sponsor     text check (char_length(sponsor) <= 60),
  sponsor_url text check (sponsor_url ~ '^https://')
);

alter table public.challenge_prompts enable row level security;
alter table public.daily_challenges enable row level security;
revoke all on public.challenge_prompts, public.daily_challenges from anon, authenticated;
grant select on public.daily_challenges to anon, authenticated;
create policy "daily_challenges: public read" on public.daily_challenges
  for select to anon, authenticated using (true);

-- Today's challenge (UTC day). If nobody scheduled one, the next prompt in
-- the rotation becomes today's.
create or replace function public.todays_challenge()
returns public.daily_challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_row public.daily_challenges;
  v_n   integer;
begin
  select * into v_row from public.daily_challenges where day = v_day;
  if found then
    return v_row;
  end if;
  select count(*) into v_n from public.challenge_prompts;
  insert into public.daily_challenges (day, prompt, tag)
  select v_day, prompt, tag
    from public.challenge_prompts
   order by id
  offset ((v_day - date '2026-01-01') % v_n)
   limit 1
  on conflict (day) do nothing;
  select * into v_row from public.daily_challenges where day = v_day;
  return v_row;
end;
$$;

grant execute on function public.todays_challenge() to anon, authenticated;

-- Admins schedule a challenge (sponsored or not) for any day
create or replace function public.admin_set_challenge(
  p_day date, p_prompt text, p_tag text, p_sponsor text default null, p_sponsor_url text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.daily_challenges (day, prompt, tag, sponsor, sponsor_url)
  values (p_day, btrim(p_prompt), btrim(p_tag), nullif(btrim(p_sponsor), ''), nullif(btrim(p_sponsor_url), ''))
  on conflict (day) do update
     set prompt = excluded.prompt, tag = excluded.tag,
         sponsor = excluded.sponsor, sponsor_url = excluded.sponsor_url;
end;
$$;

grant execute on function public.admin_set_challenge(date, text, text, text, text) to authenticated;

-- ===========================================================================
-- 3. "Explain it" (written by the explainNews Edge Function, cached per post)
-- 5b. City Pulse: a post carries its author's city
-- ===========================================================================

alter table public.posts
  add column explainer text check (char_length(explainer) <= 700),
  add column city      text check (char_length(city) <= 60);

alter table public.profiles
  add column city              text check (char_length(city) <= 60),
  add column morning_pulse     boolean not null default false,
  add column unsubscribe_token uuid not null default gen_random_uuid();

grant update (display_name, city, morning_pulse) on public.profiles to authenticated;

create index posts_city_idx on public.posts (lower(city)) where city is not null;

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
    new.boosted_at          := null;
    new.spotlight_until     := null;
    new.explainer           := null;
    -- the author's city from their profile, never whatever the client sent
    new.city                := (select p.city from public.profiles p where p.id = auth.uid());
    -- members may attach a poll (validated by posts_poll_valid); votes start at 0
    new.poll_counts         := case when new.poll is null then null
                                    else (select jsonb_agg(0) from jsonb_array_elements(new.poll -> 'options'))
                               end;
    new.expires_at          := least(coalesce(new.expires_at, now() + interval '1 hour'),
                                     now() + interval '1 hour');
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 4. Mood trends
-- ===========================================================================

create table public.reaction_events (
  id           bigserial primary key,
  post_id      uuid not null references public.posts (id) on delete cascade,
  emoji        text not null,
  created_date timestamptz not null default now()
);

create index reaction_events_post_idx on public.reaction_events (post_id, created_date desc);
alter table public.reaction_events enable row level security;
revoke all on public.reaction_events from anon, authenticated;

-- For each post, the emoji people reached for most in the last 30 minutes
-- (at least 3 times): the mood that's rising right now
create or replace function public.mood_trends(p_post_ids uuid[])
returns table (post_id uuid, emoji text, recent integer)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.post_id) e.post_id, e.emoji, count(*)::int as recent
    from public.reaction_events e
   where e.post_id = any (p_post_ids[1:200])
     and e.created_date > now() - interval '30 minutes'
   group by e.post_id, e.emoji
  having count(*) >= 3
   order by e.post_id, count(*) desc;
$$;

grant execute on function public.mood_trends(uuid[]) to anon, authenticated;

select cron.schedule(
  'purge-reaction-events',
  '41 * * * *',
  $$delete from public.reaction_events where created_date < now() - interval '1 day'$$
);

-- ===========================================================================
-- 5. Morning Pulse email (sent by the morningPulse Edge Function, once a day)
-- ===========================================================================

insert into public.app_settings (key, value) values ('morning_pulse_last_sent', 'null')
on conflict (key) do nothing;

-- One-click unsubscribe from the email link, no sign-in needed
create or replace function public.unsubscribe_morning_pulse(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.profiles set morning_pulse = false where unsubscribe_token = p_token
  returning true;
$$;

grant execute on function public.unsubscribe_morning_pulse(uuid) to anon, authenticated;

-- 12:00 UTC = 8am US Eastern (summer time), 1pm UK
select cron.schedule(
  'morning-pulse-email',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://qcouyhzvapgknfvrpakt.supabase.co/functions/v1/morningPulse',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- ===========================================================================
-- Updated RPCs: reactions are recorded for mood trends; comments and chat
-- pass the text check
-- ===========================================================================

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
  v_post public.posts;
begin
  if auth.uid() is null then
    raise exception 'Sign in to comment' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if not public.text_check_passed() then
    raise exception 'Please refresh Pixsup and try again' using errcode = '42501';
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

create or replace function public.send_chat(p_post_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_username text;
  v_message  public.chat_messages;
begin
  if v_uid is null then
    raise exception 'Sign in to chat' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if not public.text_check_passed() then
    raise exception 'Please refresh Pixsup and try again' using errcode = '42501';
  end if;
  select username into v_username from public.profiles where id = v_uid;
  if v_username is null then
    raise exception 'Pick a username first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.posts
                  where id = p_post_id and hidden_at is null
                    and (expires_at is null or expires_at > now())) then
    raise exception 'This post has expired' using errcode = 'P0002';
  end if;
  -- slow mode: 1 message every 2 seconds, at most 10 a minute
  if exists (select 1 from public.chat_messages
              where user_id = v_uid and created_date > now() - interval '2 seconds')
     or (select count(*) from public.chat_messages
          where user_id = v_uid and created_date > now() - interval '1 minute') >= 10 then
    raise exception 'Slow down a little' using errcode = '22023';
  end if;

  insert into public.chat_messages (post_id, user_id, username, text)
  values (p_post_id, v_uid, v_username, btrim(p_text))
  returning * into v_message;
  return to_jsonb(v_message);
end;
$$;

grant execute on function public.send_chat(uuid, text) to authenticated;
