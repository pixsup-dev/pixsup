-- Admin center: see and manage who the admins are, an at-a-glance overview,
-- on/off switches for key settings, and a log of who changed what.
-- Every function checks is_admin() itself; the page can't bypass it.

create table if not exists public.admin_log (
  id           bigint generated always as identity primary key,
  created_date timestamptz not null default now(),
  admin_id     uuid references auth.users (id) on delete set null,
  admin_name   text,
  action       text not null,
  detail       text
);

alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;
grant select on public.admin_log to authenticated;
create policy "admin_log: admins read" on public.admin_log
  for select to authenticated
  using (public.is_admin());

create or replace function public.log_admin_action(p_action text, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.admin_log (admin_id, admin_name, action, detail)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_detail);
$$;

revoke execute on function public.log_admin_action(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The team
-- ---------------------------------------------------------------------------

create or replace function public.admin_team()
returns table (id uuid, username text, avatar_url text, since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.avatar_url, p.created_date
      from public.profiles p
     where p.role = 'admin'
     order by p.created_date;
end;
$$;

-- Make someone an admin (or remove them) by username. You can't remove
-- yourself, and there's always at least one admin.
create or replace function public.admin_set_admin(p_username text, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select * into v_target from public.profiles
   where lower(username) = lower(ltrim(btrim(p_username), '@'));
  if not found then
    raise exception 'No member called @%', ltrim(btrim(p_username), '@') using errcode = 'P0002';
  end if;
  if v_target.banned and p_admin then
    raise exception '@% is banned', v_target.username using errcode = '22023';
  end if;
  if not p_admin and v_target.id = auth.uid() then
    raise exception 'You can''t remove yourself. Ask another admin.' using errcode = '22023';
  end if;
  if not p_admin and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'There has to be at least one admin' using errcode = '22023';
  end if;
  update public.profiles set role = case when p_admin then 'admin' else 'user' end where id = v_target.id;
  perform public.log_admin_action(case when p_admin then 'Added admin' else 'Removed admin' end, '@' || v_target.username);
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview numbers
-- ---------------------------------------------------------------------------

create or replace function public.admin_stats()
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
  return jsonb_build_object(
    'members',         (select count(*) from public.profiles),
    'members_today',   (select count(*) from public.profiles where created_date > now() - interval '24 hours'),
    'banned',          (select count(*) from public.profiles where banned),
    'live_posts',      (select count(*) from public.posts where expires_at > now() and hidden_at is null),
    'live_member_posts', (select count(*) from public.posts where expires_at > now() and hidden_at is null and not "isNews"),
    'posts_today',     (select count(*) from public.posts where not "isNews" and created_date > now() - interval '24 hours'),
    'comments_today',  (select count(*) from public.comments where created_date > now() - interval '24 hours'),
    'hits_today',      (select count(*) from public.votes where created_date > now() - interval '24 hours'),
    'trending',        (select count(*) from public.posts where is_trending and expires_at > now()),
    'open_reports',    (select count(distinct post_id) from public.flags),
    'chat_reports',    (select count(distinct message_id) from public.chat_reports),
    'errors_today',    (select coalesce(sum(count), 0) from public.client_errors where last_seen > now() - interval '24 hours'),
    'alert_devices',   (select count(*) from public.push_subscriptions)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Switches (only these settings can be changed from the page)
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
  return coalesce((
    select jsonb_object_agg(key, value) from public.app_settings
     where key in ('reaction_caps', 'ai_moderation_required', 'text_moderation_required',
                   'revive_votes_needed', 'boosts_enabled')
  ), '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_key in ('reaction_caps', 'ai_moderation_required', 'text_moderation_required', 'boosts_enabled') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'That setting is on or off' using errcode = '22023';
    end if;
  elsif p_key = 'revive_votes_needed' then
    if jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::int not between 1 and 20 then
      raise exception 'Revives needed must be between 1 and 20' using errcode = '22023';
    end if;
  else
    raise exception 'That setting can''t be changed here' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
  perform public.log_admin_action('Changed setting', p_key || ' → ' || (p_value #>> '{}'));
end;
$$;

revoke execute on function public.admin_team() from public, anon;
revoke execute on function public.admin_set_admin(text, boolean) from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.admin_set_admin(text, boolean) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_settings() to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
