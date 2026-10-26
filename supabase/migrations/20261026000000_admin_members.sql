-- Admin → Members: who joined, newest first, with a search by @username or
-- email. Admins only (everyone else gets an error and nothing back). Emails
-- come back partly hidden (fr***@gmail.com); search still uses the full one.

create or replace function public.admin_members(p_search text default null, p_limit integer default 50)
returns table (
  id          uuid,
  username    text,
  email       text,
  avatar_url  text,
  city        text,
  joined      timestamptz,
  last_signed_in timestamptz,
  posts_made  integer,
  rescues     integer,
  banned      boolean,
  role        text,
  signed_up_with text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
    select p.id, p.username,
           case
             when p.email is null or position('@' in p.email) = 0 then null
             else left(split_part(p.email, '@', 1),
                       case when length(split_part(p.email, '@', 1)) > 3 then 2 else 1 end)
                  || '***@' || split_part(p.email, '@', 2)
           end,
           p.avatar_url, p.city, p.created_date,
           u.last_sign_in_at, p.posts_made, p.rescues, p.banned, p.role,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email')
      from public.profiles p
      left join auth.users u on u.id = p.id
     where v_search is null
        or p.username ilike '%' || ltrim(v_search, '@') || '%'
        or p.email ilike '%' || v_search || '%'
     order by p.created_date desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_members(text, integer) from public, anon;
grant execute on function public.admin_members(text, integer) to authenticated;
