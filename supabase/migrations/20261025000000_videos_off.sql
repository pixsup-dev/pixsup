-- Video posts are off until they're shrunk before storage and AI-checked like
-- photos (today they'd be stored full size and skip the safety check). The
-- app only offers photos; this makes the database refuse a video from members
-- too. Turning them back on later: app_settings key videos_enabled = true.

create or replace function public.block_video_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and new.media_type = 'video'
     and not public.setting_on('videos_enabled', false) then
    raise exception 'Video posts are turned off for now' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.block_video_posts() from public, anon, authenticated;

drop trigger if exists posts_block_video on public.posts;
create trigger posts_block_video
  before insert or update of media_type on public.posts
  for each row execute function public.block_video_posts();
