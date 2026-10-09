-- Phone notifications (web push). Members who switch alerts on get a push
-- for: someone commenting on, rescuing or trending their post, and their own
-- post being about to die. The pushAlerts function (every minute) sends them.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_date timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- No policies: managed through the functions below and by the server.

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to turn on alerts' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or char_length(coalesce(p_p256dh, '')) not between 40 and 200
     or char_length(coalesce(p_auth, '')) not between 10 and 100 then
    raise exception 'Invalid subscription' using errcode = '22023';
  end if;
  -- a few devices per member at most
  if (select count(*) from public.push_subscriptions
       where user_id = auth.uid() and endpoint <> p_endpoint) >= 5 then
    delete from public.push_subscriptions
     where endpoint = (select endpoint from public.push_subscriptions
                        where user_id = auth.uid() order by created_date limit 1);
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_date = now();
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- What's already been pushed
alter table public.notifications add column if not exists pushed_at timestamptz;
alter table public.posts add column if not exists dying_alert_at timestamptz;

select cron.schedule(
  'push-alerts',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://qcouyhzvapgknfvrpakt.supabase.co/functions/v1/pushAlerts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
