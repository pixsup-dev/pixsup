-- News engagement: a short publisher summary on news posts, and a top_story
-- flag for the World Pulse belt (the biggest stories right now, ranked by
-- how hard people are keeping them alive). Only the news engine (service
-- role) can set either.

alter table public.posts
  add column summary   text check (char_length(summary) <= 400),
  add column top_story boolean not null default false;

create index posts_top_story_idx on public.posts (created_date desc) where top_story;

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
    new.expires_at          := least(coalesce(new.expires_at, now() + interval '1 hour'),
                                     now() + interval '1 hour');
  end if;
  return new;
end;
$$;
