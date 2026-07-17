-- 결과 24시간 만료를 폐지합니다. 이제 스페이스가 지워질 때까지 남습니다.
--
-- 왜: 함께보기의 공유 권한에는 수명이 없는데 결과만 하루살이였습니다. 어제 세미나의
-- 결과와 오늘 세미나의 결과를 한 지도에서 보자는 게 이 기능인데, 어제 것이 이미
-- 없으면 볼 게 없습니다.
--
-- ⚠ 반드시 6_server_side_results 다음에 적용하세요. 순서를 뒤집으면 anon이 읽을 수
--   있는 범위가 "만료 전"에서 "전부"로 넓어진 중간 상태가 생깁니다.
--
-- 받아들이는 것들 (계획 문서 §6.3):
--   - 닉네임이 스페이스 안에서 영구히 점유됩니다. 본인 삭제·재제출은 후속 과제입니다.
--   - 200명 정원이 "평생 정원"이 됩니다.
--   - 참가자에게 한 약속이 바뀝니다. UI와 README의 문구를 같은 커밋에서 고쳤습니다.

-- ── 만료 닉네임 반납 트리거 ───────────────────────────────────────
-- ⚠ 컬럼보다 먼저 지웁니다. 이 트리거(2_result_nickname_unique)는 "만료된 행이 잡고
--   있던 닉네임은 다시 쓸 수 있게 해준다"는 일을 했고, 그 몸통이 expires_at을 읽습니다.
--
--   PostgreSQL은 컬럼을 지울 때 plpgsql 함수 본문을 검사하지 않습니다. 그래서 이걸
--   남겨두면 마이그레이션은 조용히 성공하고, 그 다음부터 results INSERT가 전부
--   `column "expires_at" does not exist`로 죽습니다 — 배포 후 첫 참가자가 발견합니다.
--
--   만료가 없어졌으니 반납할 것도 없습니다. 닉네임은 이제 스페이스 안에서 영구히
--   점유되며(계획 §6.3), 경쟁은 results_room_nickname_key가 원자적으로 막습니다.

drop trigger if exists trg_results_release_expired_nickname on public.results;
drop function if exists public.results_release_expired_nickname();

-- expires_at을 지우면 results_expires_idx도 함께 사라집니다 (그 컬럼만 보는 인덱스).
alter table public.results drop column if exists expires_at;

-- ── 200명 정원 ────────────────────────────────────────────────────
-- 만료가 없으니 "살아 있는 행"과 "모든 행"이 같은 말이 되었습니다.

create or replace function public.results_room_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.results where room = new.room) >= 200 then
    raise exception '이 방의 정원(200명)이 찼습니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ── 홈의 활성 스페이스 ────────────────────────────────────────────
-- "활성"의 뜻은 그대로입니다: 최근 24시간 안에 누가 참여한 잠긴 스페이스.
-- 다만 그 판정을 expires_at이 아니라 created_at으로 합니다 (having 절).
--
-- participant_count는 이제 "최근 24시간"이 아니라 그 스페이스의 전체 참여자입니다.
-- 결과가 남으니 그게 사람들이 기대하는 숫자입니다. 홈의 '최근 24시간' 라벨은 목록에
-- 뜨는 기준(활동)을 가리키는 말이지 인원수를 가리키는 말이 아닙니다.

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
  where s.password_hash is not null
  group by s.id, s.name, s.icon_id, s.created_at
  having max(r.created_at) > now() - interval '24 hours'
  order by max(r.created_at) desc, count(r.id) desc, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

revoke all on function public.list_active_spaces(integer)
  from public, anon, authenticated;
grant execute on function public.list_active_spaces(integer) to service_role;

-- ── 자동 소멸 ─────────────────────────────────────────────────────
-- 결과는 이제 지우지 않습니다. 입장 시도 기록만 정리합니다.

do $$
begin
  execute 'create extension if not exists pg_cron';
  perform cron.unschedule('dogtype-purge') from cron.job where jobname = 'dogtype-purge';
  perform cron.schedule('dogtype-purge', '17 * * * *', $purge$
    delete from public.space_attempts where window_end < now();
  $purge$);
exception
  when others then
    raise warning 'pg_cron 정리 작업을 걸지 못했습니다 (%). 지난 입장 시도 기록이 쌓입니다.', sqlerrm;
end;
$$;
