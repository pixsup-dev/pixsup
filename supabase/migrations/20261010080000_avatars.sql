-- Profile pictures: a small round avatar next to a member's name on posts,
-- comments and live chat. Set only through set_avatar(), which accepts the
-- member's own upload and, when AI moderation is on, only an approved one.

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.set_avatar(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to set a profile picture' using errcode = '42501';
  end if;
  if public.is_banned() then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;
  if p_url is not null and (
       p_url not like '%/storage/v1/object/public/media/' || v_uid::text || '/%'
       or (public.ai_moderation_required() and not public.media_is_approved(p_url))
     ) then
    raise exception 'That picture can''t be used' using errcode = '22023';
  end if;
  update public.profiles set avatar_url = p_url where id = v_uid;
end;
$$;

revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

-- Public names now come with the avatar (banned members still hidden)
drop function if exists public.get_usernames(uuid[]);
create function public.get_usernames(p_ids uuid[])
returns table (id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar_url
    from public.profiles p
   where p.id = any(p_ids[1:500])
     and p.username is not null
     and not p.banned;
$$;

revoke execute on function public.get_usernames(uuid[]) from public;
grant execute on function public.get_usernames(uuid[]) to anon, authenticated;
