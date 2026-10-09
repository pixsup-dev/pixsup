-- 🔔 Watch a post: members get a phone alert when a post they're watching is
-- about to die. 🛟 Rescue Radar: members pick topics and/or their city and get
-- (at most 3 a day) alerts when a post there is dying. Sent by pushAlerts.

create table if not exists public.post_watches (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  alerted_at   timestamptz,
  primary key (post_id, user_id)
);

create index if not exists post_watches_user_idx on public.post_watches (user_id);

alter table public.post_watches enable row level security;
revoke all on public.post_watches from anon, authenticated;
grant select on public.post_watches to authenticated;
create policy "post_watches: own" on public.post_watches
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Watch or unwatch; returns true when now watching
create or replace function public.toggle_watch(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to watch posts' using errcode = '42501';
  end if;
  delete from public.post_watches where post_id = p_post_id and user_id = v_uid;
  if found then
    return false;
  end if;
  if (select count(*) from public.post_watches where user_id = v_uid) >= 100 then
    -- forget the oldest watch rather than refuse
    delete from public.post_watches
     where user_id = v_uid
       and post_id = (select post_id from public.post_watches where user_id = v_uid order by created_date limit 1);
  end if;
  insert into public.post_watches (post_id, user_id) values (p_post_id, v_uid);
  return true;
end;
$$;

revoke execute on function public.toggle_watch(uuid) from public, anon;
grant execute on function public.toggle_watch(uuid) to authenticated;

-- Rescue Radar settings on the profile
alter table public.profiles add column if not exists radar_topics text[] not null default '{}';
alter table public.profiles add column if not exists radar_city boolean not null default false;
alter table public.profiles drop constraint if exists profiles_radar_topics_check;
alter table public.profiles add constraint profiles_radar_topics_check
  check (cardinality(radar_topics) <= 5 and array_to_string(radar_topics, ',') ~ '^[A-Za-z, ]{0,120}$');

grant update (display_name, city, morning_pulse, radar_topics, radar_city) on public.profiles to authenticated;

-- One radar alert per member per post (also how the daily cap is counted)
create table if not exists public.radar_alerts (
  user_id      uuid not null references auth.users (id) on delete cascade,
  post_id      uuid not null references public.posts (id) on delete cascade,
  created_date timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists radar_alerts_user_idx on public.radar_alerts (user_id, created_date desc);

alter table public.radar_alerts enable row level security;
revoke all on public.radar_alerts from anon, authenticated;
-- No policies: written only by the server.
