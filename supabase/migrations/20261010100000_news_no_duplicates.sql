-- One tile per news story: two news runs at the same moment (the schedule and
-- someone pressing Refresh) could both post the same article. Removes the
-- doubles already posted (keeping the first), then makes the link unique so
-- the database itself refuses a second copy.

delete from public.posts p
 using public.posts q
 where p.source_url is not null
   and p.source_url = q.source_url
   and (p.created_date, p.id) > (q.created_date, q.id);

create unique index if not exists posts_source_url_key on public.posts (source_url);
