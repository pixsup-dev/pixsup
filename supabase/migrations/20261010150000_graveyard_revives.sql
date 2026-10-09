-- 🪦 Graveyard & 🧟 Revives. When a member's post dies it lies in the
-- Graveyard for 10 minutes; if enough other members (3 by default) tap Revive
-- in that time it comes back with 30 more minutes. Once per post. Otherwise
-- dead posts stay dead: hits, reactions and comments can't bring them back.

alter table public.posts add column if not exists revive_votes integer not null default 0;
alter table public.posts add column if not exists revived_at timestamptz;
alter table public.posts add column if not exists death_alert_at timestamptz;

insert into public.app_settings (key, value) values ('revive_votes_needed', '3')
on conflict (key) do nothing;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('hit', 'reaction', 'comment', 'trending', 'rescue', 'revive'));

create table if not exists public.revive_votes (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.revive_votes enable row level security;
revoke all on public.revive_votes from anon, authenticated;
grant select on public.revive_votes to authenticated;
create policy "revive_votes: own" on public.revive_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Dead stays dead: a member's hit, reaction or comment on an expired post is
-- refused (only revive_post may bring one back). The server is exempt.
create or replace function public.guard_dead_posts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old.expires_at is not null
     and old.expires_at <= now()
     and new.expires_at is distinct from old.expires_at
     and coalesce(current_setting('pixsup.reviving', true), '') <> 'on' then
    raise exception 'This post has expired' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_zz_guard_dead on public.posts;
create trigger posts_zz_guard_dead -- "zz": runs after the other before-update triggers
  before update on public.posts
  for each row execute function public.guard_dead_posts();

-- Vote to revive a post in the Graveyard. Returns the post's state.
create or replace function public.revive_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_post   public.posts;
  v_needed integer := coalesce((select (value #>> '{}')::int from public.app_settings
                                 where key = 'revive_votes_needed'), 3);
  v_done   boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to revive posts' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post."isNews" or v_post.hidden_at is not null then
    raise exception 'This post can''t be revived' using errcode = 'P0002';
  end if;
  if v_post.created_by_id = v_uid then
    raise exception 'Ask others to revive your post. Share it!' using errcode = '22023';
  end if;
  if v_post.revived_at is not null then
    raise exception 'This post was already revived once' using errcode = '22023';
  end if;
  if v_post.expires_at is null or v_post.expires_at > now() then
    raise exception 'This post is still alive. Hit it instead!' using errcode = '22023';
  end if;
  if v_post.expires_at < now() - interval '10 minutes' then
    raise exception 'Too late: this post is gone for good' using errcode = 'P0002';
  end if;

  insert into public.revive_votes (post_id, user_id) values (p_post_id, v_uid)
  on conflict do nothing;
  if found then
    v_post.revive_votes := v_post.revive_votes + 1;
    v_done := v_post.revive_votes >= v_needed;
    perform set_config('pixsup.reviving', 'on', true);
    update public.posts
       set revive_votes = v_post.revive_votes,
           revived_at = case when v_done then now() else revived_at end,
           expires_at = case when v_done then now() + interval '30 minutes' else expires_at end
     where id = p_post_id
    returning * into v_post;
    perform set_config('pixsup.reviving', 'off', true);
    if v_done then
      perform public.notify_post_owner(v_post, 'revive');
    end if;
  end if;

  return jsonb_build_object('post', to_jsonb(v_post), 'votes', v_post.revive_votes,
                            'needed', v_needed, 'revived', v_post.revived_at is not null);
end;
$$;

revoke execute on function public.revive_post(uuid) from public, anon;
grant execute on function public.revive_post(uuid) to authenticated;

-- How many votes a revival needs (the Graveyard shows "1/3")
create or replace function public.revive_votes_needed()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'revive_votes_needed'), 3);
$$;

grant execute on function public.revive_votes_needed() to anon, authenticated;
