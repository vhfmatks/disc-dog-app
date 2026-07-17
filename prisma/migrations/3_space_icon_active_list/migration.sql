-- 스페이스 대표 강아지 아이콘과 홈의 활성 스페이스 집계.

alter table public.spaces
  add column if not exists icon_id text not null default 'corgi';

alter table public.spaces
  drop constraint if exists spaces_icon_id_check;

alter table public.spaces
  add constraint spaces_icon_id_check check (icon_id in (
    'corgi', 'dachshund', 'husky', 'pug', 'poodle',
    'beagle', 'dalmatian', 'bulldog', 'chihuahua', 'maltese',
    'samoyed', 'schnauzer', 'papillon', 'yorkshire-terrier', 'pomeranian',
    'doberman', 'boxer', 'great-dane', 'shih-tzu', 'old-english-sheepdog'
  ));

-- 홈에는 비밀번호가 설정되어 있고, 만료 전 참가 결과가 하나 이상 있는 스페이스만
-- 노출한다. 결과의 닉네임·유형이나 비밀번호 해시·공유 토큰은 반환하지 않는다.
create or replace function public.list_active_spaces(p_limit integer default 12)
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
   and r.expires_at > now()
  where s.password_hash is not null
  group by s.id, s.name, s.icon_id, s.created_at
  order by max(r.created_at) desc, count(r.id) desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.list_active_spaces(integer)
  from public, anon, authenticated;
grant execute on function public.list_active_spaces(integer) to service_role;
