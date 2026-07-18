-- 홈의 활성 스페이스 목록을 페이지 단위로 읽는다.
--
-- 호출자는 한 페이지보다 하나 더 많이 가져와 다음 페이지 존재 여부를 판정한다.
-- p_offset도 DB에서 제한해 악의적인 큰 offset으로 비싼 조회를 만들지 못하게 한다.

drop function if exists public.list_active_spaces(integer);

create function public.list_active_spaces(
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id text,
  name text,
  icon_id text,
  participant_count integer,
  created_at timestamptz,
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.name,
    s.icon_id,
    count(r.id)::integer as participant_count,
    s.created_at,
    max(r.created_at) as last_activity_at
  from public.spaces s
  join public.results r
    on r.room = s.id
  where s.password_hash is not null
  group by s.id, s.name, s.icon_id, s.created_at
  having max(r.created_at) > now() - interval '24 hours'
  order by max(r.created_at) desc, count(r.id) desc, s.created_at desc, s.id asc
  limit greatest(1, least(coalesce(p_limit, 12), 50))
  offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

revoke all on function public.list_active_spaces(integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_active_spaces(integer, integer) to service_role;
