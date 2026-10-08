-- Public usernames for showing "@name" on posts and comments. profiles stays
-- private (it holds emails); this exposes only id → username, and hides
-- banned members' names.

create or replace function public.get_usernames(p_ids uuid[])
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username
    from public.profiles p
   where p.id = any(p_ids[1:500])
     and p.username is not null
     and not p.banned;
$$;

revoke execute on function public.get_usernames(uuid[]) from public;
grant execute on function public.get_usernames(uuid[]) to anon, authenticated;
