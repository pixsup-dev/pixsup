-- Error alerts: crashes in people's browsers are reported here (grouped, so
-- the same error a thousand times is one row with a count), shown on the
-- Admin page, and emailed to support@ by the errorAlert function each hour.

create table if not exists public.client_errors (
  id           bigint generated always as identity primary key,
  fingerprint  text not null unique,
  message      text not null,
  stack        text,
  url          text,
  user_agent   text,
  count        integer not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  emailed_at   timestamptz
);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to authenticated;
create policy "client_errors: admins read" on public.client_errors
  for select to authenticated
  using (public.is_admin());

-- Anyone (signed in or not) can report; text is trimmed, and at most 200 new
-- kinds of error an hour are recorded so it can't be used to flood the table
create or replace function public.log_client_error(p_message text, p_stack text, p_url text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := left(btrim(coalesce(p_message, '')), 300);
  v_stack   text := left(p_stack, 2000);
begin
  if v_message = '' then
    return;
  end if;
  if (select count(*) from public.client_errors where first_seen > now() - interval '1 hour') >= 200 then
    return;
  end if;
  insert into public.client_errors (fingerprint, message, stack, url, user_agent)
  values (
    md5(v_message || coalesce(split_part(v_stack, E'\n', 2), '')),
    v_message, v_stack, left(p_url, 300), left(p_user_agent, 200)
  )
  on conflict (fingerprint) do update
    set count = public.client_errors.count + 1,
        last_seen = now(),
        url = excluded.url,
        user_agent = excluded.user_agent;
end;
$$;

revoke execute on function public.log_client_error(text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text) to anon, authenticated;

-- Hourly email about new errors; old errors are cleared after 30 days
select cron.schedule(
  'error-alert-email',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://qcouyhzvapgknfvrpakt.supabase.co/functions/v1/errorAlert',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'purge-client-errors',
  '30 3 * * *',
  $$ delete from public.client_errors where last_seen < now() - interval '30 days' $$
);
