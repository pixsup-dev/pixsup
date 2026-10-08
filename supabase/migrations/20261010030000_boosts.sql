-- Paid Boosts (off until Stripe is set up):
--   extend_1h  +1 hour of life
--   spotlight  pinned to the front of the feed for 30 minutes (and alive at least that long)
-- Members buy them for their own live posts through Stripe Checkout
-- (createBoostCheckout); Stripe's webhook (stripeWebhook) confirms payment and
-- applies the boost. Only the server can record purchases or apply boosts.
--
-- Turn on once STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set:
--   update public.app_settings set value = 'true' where key = 'boosts_enabled';

insert into public.app_settings (key, value) values ('boosts_enabled', 'false');

create or replace function public.boosts_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings where key = 'boosts_enabled'),
    false
  );
$$;

grant execute on function public.boosts_enabled() to anon, authenticated;

alter table public.posts
  add column boosted_at      timestamptz,
  add column spotlight_until timestamptz;

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
    new.expires_at          := least(coalesce(new.expires_at, now() + interval '1 hour'),
                                     now() + interval '1 hour');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchases: written only by the Edge Functions (service role)
-- ---------------------------------------------------------------------------

create table public.boost_purchases (
  id                uuid primary key default gen_random_uuid(),
  created_date      timestamptz not null default now(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  post_id           uuid references public.posts (id) on delete set null,
  product           text not null check (product in ('extend_1h', 'spotlight')),
  amount_cents      integer not null,
  currency          text not null default 'usd',
  stripe_session_id text not null unique,
  status            text not null default 'pending' check (status in ('pending', 'paid')),
  applied_at        timestamptz
);

create index boost_purchases_user_idx on public.boost_purchases (user_id, created_date desc);

alter table public.boost_purchases enable row level security;
revoke all on public.boost_purchases from anon, authenticated;
grant select on public.boost_purchases to authenticated;

create policy "boost_purchases: read own" on public.boost_purchases
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Applies a paid boost exactly once (Stripe may deliver a webhook more than once).
-- Returns false if it was already applied or the post is gone.
create or replace function public.apply_boost(p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.boost_purchases;
begin
  update public.boost_purchases
     set status = 'paid', applied_at = now()
   where stripe_session_id = p_session_id and applied_at is null
  returning * into v_purchase;
  if not found or v_purchase.post_id is null then
    return false;
  end if;

  if v_purchase.product = 'extend_1h' then
    update public.posts
       set expires_at = greatest(coalesce(expires_at, now()), now()) + interval '1 hour',
           boosted_at = now()
     where id = v_purchase.post_id;
  else
    update public.posts
       set spotlight_until = now() + interval '30 minutes',
           expires_at = greatest(coalesce(expires_at, now()), now() + interval '30 minutes'),
           boosted_at = now()
     where id = v_purchase.post_id;
  end if;
  return true;
end;
$$;

revoke execute on function public.apply_boost(text) from public, anon, authenticated;
