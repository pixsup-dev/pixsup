-- Anti-spam for posting and the Daily Challenge:
--   1. members can post at most 10 times an hour
--   2. one challenge entry per member per day
--   3. a photo only counts as a challenge entry when the AI agreed it fits
--      today's prompt (analyzePostMedia records that in media_approvals);
--      otherwise the challenge tag is quietly removed and it posts normally
-- News and anything the server inserts (service role) is not affected.

-- ---------------------------------------------------------------------------
-- The AI's "fits today's challenge" verdict, per uploaded file
-- ---------------------------------------------------------------------------

alter table public.media_approvals add column if not exists challenge_tag text;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.strip_tag(p_tags text[], p_tag text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(t), '{}') from unnest(p_tags) t where lower(t) <> lower(p_tag);
$$;

-- Has the signed-in member already entered today's challenge?
create or replace function public.my_challenge_entry_today()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.posts p, public.daily_challenges c
     where c.day = (now() at time zone 'utc')::date
       and p.created_by_id = (select auth.uid())
       and p.created_date >= (c.day::timestamp at time zone 'utc')
       and exists (select 1 from unnest(p.hashtags) h where lower(h) = lower(c.tag))
  );
$$;

revoke execute on function public.my_challenge_entry_today() from public, anon;
grant execute on function public.my_challenge_entry_today() to authenticated;

-- ---------------------------------------------------------------------------
-- The rules, enforced on every member insert
-- ---------------------------------------------------------------------------

create or replace function public.enforce_posting_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tag text;
begin
  -- only members posting from the app; the server (news, admin tools) is exempt
  if coalesce(auth.role(), '') <> 'authenticated' or v_uid is null then
    return new;
  end if;

  -- 1. Posting limit
  if (select count(*) from public.posts
       where created_by_id = v_uid
         and created_date > now() - interval '1 hour') >= 10 then
    raise exception 'Slow down: you can post up to 10 times an hour. Try again a little later.'
      using errcode = 'P0001';
  end if;

  v_tag := (public.todays_challenge()).tag;
  if v_tag is null
     or not exists (select 1 from unnest(new.hashtags) h where lower(h) = lower(v_tag)) then
    return new;
  end if;

  -- 3. It must fit the prompt (checked by the AI when AI moderation is on)
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

  -- 2. One entry per member per day
  if public.my_challenge_entry_today() then
    new.hashtags := public.strip_tag(new.hashtags, v_tag);
  end if;

  return new;
end;
$$;

drop trigger if exists posts_rules_insert on public.posts;
create trigger posts_rules_insert
  before insert on public.posts
  for each row execute function public.enforce_posting_rules();

-- Members can edit their post's hashtags, but not add today's challenge tag
-- afterwards (that would skip the checks above)
create or replace function public.guard_challenge_tag_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or new.hashtags is not distinct from old.hashtags then
    return new;
  end if;
  v_tag := (public.todays_challenge()).tag;
  if v_tag is not null
     and exists (select 1 from unnest(new.hashtags) h where lower(h) = lower(v_tag))
     and not exists (select 1 from unnest(old.hashtags) h where lower(h) = lower(v_tag)) then
    new.hashtags := public.strip_tag(new.hashtags, v_tag);
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_challenge_tag on public.posts;
create trigger posts_guard_challenge_tag
  before update of hashtags on public.posts
  for each row execute function public.guard_challenge_tag_edit();
