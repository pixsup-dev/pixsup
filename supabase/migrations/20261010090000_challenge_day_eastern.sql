-- The Daily Challenge day now runs on US Eastern time: a new challenge (and a
-- fresh "one entry per day") starts at midnight in New York instead of
-- midnight UTC (8 PM Eastern). America/New_York handles daylight saving.

create or replace function public.challenge_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/New_York')::date;
$$;

grant execute on function public.challenge_today() to anon, authenticated;

create or replace function public.todays_challenge()
returns public.daily_challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := public.challenge_today();
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
     where c.day = public.challenge_today()
       and p.created_by_id = (select auth.uid())
       and p.created_date >= (c.day::timestamp at time zone 'America/New_York')
       and exists (select 1 from unnest(p.hashtags) h where lower(h) = lower(c.tag))
  );
$$;

revoke execute on function public.my_challenge_entry_today() from public, anon;
grant execute on function public.my_challenge_entry_today() to authenticated;
