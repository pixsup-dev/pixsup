-- Indexes so lookups stay fast as Pixsup grows. Invisible to people; no
-- behaviour changes. Each one serves a query that runs often.

-- Live posts by time left: the feed on every visit, the Graveyard, phone
-- alerts (every minute) and the daily cleanup
create index if not exists posts_expires_at_idx on public.posts (expires_at);

-- Trending posts still alive (the belt, trending counts)
create index if not exists posts_trending_idx on public.posts (expires_at) where is_trending;

-- New faces row
create index if not exists posts_new_face_idx on public.posts (created_date desc) where new_face;

-- Deleting a post also deletes its notifications; without this every
-- notification would be checked
create index if not exists notifications_post_idx on public.notifications (post_id);

-- Notifications still waiting to become a phone alert (checked every minute)
create index if not exists notifications_unpushed_idx on public.notifications (created_date)
  where pushed_at is null;

-- The comment speed limit (comments per person in the last hour)
create index if not exists comments_author_recent_idx on public.comments (created_by_id, created_date desc);

-- Rescue Radar alerts, by post (deleting a post cleans these up too)
create index if not exists radar_alerts_post_idx on public.radar_alerts (post_id);

-- Paid boosts, by post
create index if not exists boost_purchases_post_idx on public.boost_purchases (post_id);

-- Finding a member by @username regardless of capitals (admin team, mentions)
create index if not exists profiles_username_lower_idx on public.profiles (lower(username));
