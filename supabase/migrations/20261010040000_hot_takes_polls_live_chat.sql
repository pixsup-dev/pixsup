-- Three ways to join the conversation:
--   * Hot Takes: members 🔥-vote comments; the most-voted comment becomes the
--     post's top_comment (shown on cards as the "Hot take").
--   * Polls: a post can carry one poll (2–4 options). Members add one when they
--     post; admins can add one to any post (e.g. a top news story).
--   * Live chat: a per-post chat whose messages vanish after 10 minutes.
-- All counters and messages change only through the RPCs below.

-- ===========================================================================
-- Hot Takes
-- ===========================================================================

alter table public.comments add column votes integer not null default 0;

create table public.comment_votes (
  comment_id   uuid not null references public.comments (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_votes enable row level security;
revoke all on public.comment_votes from anon, authenticated;
grant select on public.comment_votes to authenticated;

create policy "comment_votes: read own" on public.comment_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The post's top comment: most 🔥 votes, then newest; banned members excluded
create or replace function public.compute_top_comment(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', c.id,
           'text', left(c.text, 140),
           'author_id', c.created_by_id,
           'username', pr.username,
           'votes', c.votes)
    from public.comments c
    left join public.profiles pr on pr.id = c.created_by_id
   where c.post_id = p_post_id
     and not coalesce(pr.banned, false)
   order by c.votes desc, c.created_date desc
   limit 1;
$$;

revoke execute on function public.compute_top_comment(uuid) from public, anon, authenticated;

create or replace function public.refresh_top_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post_id uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
     set top_comment = public.compute_top_comment(v_post_id)
   where id = v_post_id;
  return null;
end;
$$;

create or replace function public.vote_comment(p_comment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_comment public.comments;
begin
  if v_uid is null then
    raise exception 'Sign in to vote' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  select * into v_comment from public.comments where id = p_comment_id;
  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  if v_comment.created_by_id = v_uid then
    raise exception 'You can''t vote for your own comment' using errcode = '22023';
  end if;

  insert into public.comment_votes (comment_id, user_id) values (p_comment_id, v_uid)
  on conflict do nothing;
  if not found then
    return null; -- already voted
  end if;

  update public.comments set votes = votes + 1 where id = p_comment_id
  returning * into v_comment;
  update public.posts
     set top_comment = public.compute_top_comment(v_comment.post_id)
   where id = v_comment.post_id;
  return v_comment.votes;
end;
$$;

grant execute on function public.vote_comment(uuid) to authenticated;

update public.posts p
   set top_comment = public.compute_top_comment(p.id)
 where p.comment_count > 0;

-- ===========================================================================
-- Polls
-- ===========================================================================

alter table public.posts
  add column poll        jsonb,
  add column poll_counts jsonb;

-- {question: 1–120 chars, options: 2–4 strings of 1–60 chars}
create or replace function public.valid_poll(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'question') = 'string'
     and char_length(btrim(p ->> 'question')) between 1 and 120
     and jsonb_typeof(p -> 'options') = 'array'
     and jsonb_array_length(p -> 'options') between 2 and 4
     and not exists (
           select 1 from jsonb_array_elements(p -> 'options') o
            where jsonb_typeof(o) <> 'string'
               or char_length(btrim(o #>> '{}')) not between 1 and 60);
$$;

alter table public.posts
  add constraint posts_poll_valid check (poll is null or public.valid_poll(poll));

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

create table public.poll_votes (
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option       smallint not null,
  created_date timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.poll_votes enable row level security;
revoke all on public.poll_votes from anon, authenticated;
grant select on public.poll_votes to authenticated;

create policy "poll_votes: read own" on public.poll_votes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- One vote per member per poll; a vote is engagement: +3 minutes of life
create or replace function public.vote_poll(p_post_id uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_post public.posts;
begin
  if v_uid is null then
    raise exception 'Sign in to vote' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.poll is null then
    raise exception 'Poll not found' using errcode = 'P0002';
  end if;
  if p_option is null or p_option < 0 or p_option >= jsonb_array_length(v_post.poll -> 'options') then
    raise exception 'Invalid option' using errcode = '22023';
  end if;

  insert into public.poll_votes (post_id, user_id, option) values (p_post_id, v_uid, p_option)
  on conflict do nothing;
  if not found then
    return null; -- already voted
  end if;

  update public.posts
     set poll_counts = jsonb_set(
           poll_counts,
           array[p_option::text],
           to_jsonb(coalesce((poll_counts ->> p_option)::int, 0) + 1)
         ),
         expires_at = case when is_trending then expires_at
                           else greatest(coalesce(expires_at, now()), now()) + interval '3 minutes' end
   where id = p_post_id
  returning * into v_post;

  return to_jsonb(v_post);
end;
$$;

grant execute on function public.vote_poll(uuid, integer) to authenticated;

-- Admins can put a poll on any post (or remove it with p_question = null)
create or replace function public.admin_set_poll(p_post_id uuid, p_question text, p_options text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  v_poll := case when p_question is null then null
                 else jsonb_build_object('question', btrim(p_question), 'options', to_jsonb(p_options)) end;
  if v_poll is not null and not public.valid_poll(v_poll) then
    raise exception 'A poll needs a question and 2–4 short options' using errcode = '22023';
  end if;

  delete from public.poll_votes where post_id = p_post_id;
  update public.posts
     set poll = v_poll,
         poll_counts = case when v_poll is null then null
                            else (select jsonb_agg(0) from unnest(p_options)) end
   where id = p_post_id;
end;
$$;

grant execute on function public.admin_set_poll(uuid, text, text[]) to authenticated;

-- ===========================================================================
-- Live chat (messages vanish after 10 minutes)
-- ===========================================================================

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  username     text not null,
  text         text not null check (char_length(btrim(text)) between 1 and 200)
);

create index chat_messages_post_idx on public.chat_messages (post_id, created_date);
create index chat_messages_user_idx on public.chat_messages (user_id, created_date desc);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to anon, authenticated;

create policy "chat_messages: read recent" on public.chat_messages
  for select to anon, authenticated
  using (created_date > now() - interval '10 minutes');

alter publication supabase_realtime add table public.chat_messages;

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

-- Reports keep a copy of the message, since the message itself vanishes
create table public.chat_reports (
  id           uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  message_id   uuid not null,
  post_id      uuid references public.posts (id) on delete set null,
  author_id    uuid references auth.users (id) on delete cascade,
  author_name  text,
  text         text not null,
  unique (message_id, reporter_id)
);

alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from anon, authenticated;
grant select, delete on public.chat_reports to authenticated;

create policy "chat_reports: admins read" on public.chat_reports
  for select to authenticated using (public.is_admin());
create policy "chat_reports: admins delete" on public.chat_reports
  for delete to authenticated using (public.is_admin());

create or replace function public.report_chat(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.chat_messages;
begin
  if auth.uid() is null then
    raise exception 'Sign in to report' using errcode = '42501';
  end if;
  select * into v_message from public.chat_messages where id = p_message_id;
  if not found then
    return; -- already gone
  end if;
  insert into public.chat_reports (reporter_id, message_id, post_id, author_id, author_name, text)
  values (auth.uid(), v_message.id, v_message.post_id, v_message.user_id, v_message.username, v_message.text)
  on conflict do nothing;
end;
$$;

grant execute on function public.report_chat(uuid) to authenticated;

-- Messages are gone for good a few minutes after they disappear from view
select cron.schedule(
  'purge-chat-messages',
  '*/5 * * * *',
  $$delete from public.chat_messages where created_date < now() - interval '15 minutes'$$
);
