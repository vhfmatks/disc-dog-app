-- 강아지 유형 세미나 도구 — 최초 스키마
--
-- Prisma가 아는 것 : 테이블 3개 · 인덱스 2개 · FK 1개 (prisma/schema.prisma와 1:1)
-- Prisma가 모르는 것: CHECK · RLS · 컬럼 GRANT · security definer 함수 · 트리거 ·
--                     Realtime publication · pg_cron. 전부 아래에 손으로 있습니다.
--                     Prisma는 자기가 모르는 건 건드리지 않으므로 이후 마이그레이션에도
--                     살아남습니다.
--
-- ⚠ 이 파일은 일부러 "여러 번 실행해도 안전하게" 썼습니다. 이유가 둘 있습니다.
--   1) 이미 돌아가던 DB(예전 이름 groups)도 이 마이그레이션 하나로 따라올 수 있어야 합니다.
--   2) Prisma의 shadow DB가 이 파일을 맨 Postgres에 그대로 재생합니다. 그래서 Supabase
--      전용 요소(anon 롤 · pg_cron · realtime publication)는 없으면 건너뛰도록 감쌌습니다.

-- ── Supabase 롤 ───────────────────────────────────────────────────
-- Supabase에는 이미 있어 아무 일도 하지 않습니다. 아래 GRANT들이 맨 Postgres
-- (shadow DB · 로컬 테스트)에서 깨지지 않게 하려고 둡니다.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

-- ── 스페이스 ──────────────────────────────────────────────────────
-- 예전 이름은 groups였습니다. 이미 운영 중인 프로젝트의 데이터를 그대로 이어받기
-- 위해, 새로 만들기 전에 먼저 이름을 바꿉니다.

do $$
begin
  if to_regclass('public.spaces') is null and to_regclass('public.groups') is not null then
    alter table public.groups rename to spaces;
  end if;

  -- 테이블 이름을 바꿔도 제약 이름은 따라오지 않는다. Prisma가 기대하는 이름으로 맞춘다.
  -- 바깥 if로 한 번 감싸는 이유: 신규 설치 시점엔 spaces가 아직 없는데, SQL의 AND는
  -- 단축 평가를 보장하지 않아 'public.spaces'::regclass 캐스트가 그냥 터진다.
  if to_regclass('public.spaces') is not null then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.spaces'::regclass and conname = 'groups_pkey'
    ) then
      alter table public.spaces rename constraint groups_pkey to spaces_pkey;
    end if;
  end if;
end;
$$;

-- share_token: 공유 링크(#k=...)에 실리는 비밀값. 이 값을 가진 사람은 비밀번호 없이
--   들어옵니다. gen_random_uuid()는 PG13+ 코어 함수이고 CSPRNG를 씁니다(pgcrypto 불필요).
-- password_hash: null이면 "코드만 알면 누구나 입장". groups 시절에 만들어진 스페이스와
--   관리자가 비밀번호 없이 만든 스페이스가 여기 해당합니다.
create table if not exists public.spaces (
  id            text        primary key check (id ~ '^[a-z0-9-]{3,24}$'),
  name          text        not null check (char_length(btrim(name)) between 1 and 50),
  password_hash text,
  share_token   text        not null default replace(gen_random_uuid()::text, '-', ''),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 기존 테이블에는 위 create table의 새 컬럼이 반영되지 않으므로 따로 추가합니다.
-- share_token의 기본값은 volatile이라 기존 행마다 서로 다른 값이 채워집니다.
alter table public.spaces add column if not exists password_hash text;
alter table public.spaces add column if not exists share_token text not null
  default replace(gen_random_uuid()::text, '-', '');

-- 새 설치에서 바로 확인할 수 있는 기본 스페이스. 비밀번호가 없어 코드만 알면 들어갑니다.
insert into public.spaces (id, name)
values ('demo', '데모 스페이스')
on conflict (id) do nothing;

create table if not exists public.results (
  id           uuid        primary key default gen_random_uuid(),
  room         text        not null check (room ~ '^[a-z0-9-]{3,24}$')
                           constraint results_room_space_fkey
                           references public.spaces(id) on delete cascade,
  nickname     text        not null check (char_length(btrim(nickname)) between 1 and 16),
  code         text        not null check (code ~ '^[DISC]{1,2}$'),
  primary_type char(1)     not null check (primary_type in ('D','I','S','C')),
  totals       jsonb       not null,
  charm        smallint    not null check (charm between 5 and 50),
  bark         smallint    not null check (bark between 5 and 25),
  x            real        not null check (x between -1 and 1),
  y            real        not null check (y between -1 and 1),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

-- 스페이스 도입 전 results에 있던 방은 기존 링크가 끊기지 않도록 스페이스로 승격합니다.
insert into public.spaces (id, name)
select distinct room, '기존 스페이스 · ' || room
from public.results
on conflict (id) do nothing;

-- FK 이름도 groups 시절 그대로 남아 있으므로 한 번만 바꿉니다.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_room_group_fkey'
  ) then
    alter table public.results
      rename constraint results_room_group_fkey to results_room_space_fkey;
  end if;
end;
$$;

-- 기존 results 테이블에는 위 create table의 FK가 반영되지 않으므로 한 번만 추가합니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_room_space_fkey'
  ) then
    alter table public.results
      add constraint results_room_space_fkey
      foreign key (room) references public.spaces(id) on delete cascade;
  end if;
end;
$$;

drop trigger if exists trg_groups_updated_at on public.spaces;
drop trigger if exists trg_spaces_updated_at on public.spaces;
drop function if exists public.set_group_updated_at();

create or replace function public.set_space_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_spaces_updated_at
  before update on public.spaces
  for each row execute function public.set_space_updated_at();

-- 60문항 버전부터 매력 문항이 유형별 5개→10개로 늘어 상한이 25→50이 된다.
-- 기존 테이블에도 적용되도록 자동 생성된 체크 제약을 다시 만든다. 하한 5는
-- 만료 전인 40문항 버전 결과와의 24시간 호환을 위해 유지한다.
alter table public.results drop constraint if exists results_charm_check;
alter table public.results
  add constraint results_charm_check check (charm between 5 and 50);

create index if not exists results_room_created_idx on public.results (room, created_at);
create index if not exists results_expires_idx      on public.results (expires_at);

-- ── 입장 시도 기록 ────────────────────────────────────────────────
-- 비밀번호 무차별 대입과 스페이스 대량 생성을 막습니다. Edge Function(service role)만
-- 씁니다. client_key는 요청 IP의 해시이며 원본 IP는 저장하지 않습니다. 아래 cron이
-- 만료된 행을 지웁니다.

create table if not exists public.space_attempts (
  scope      text        not null,   -- 스페이스 id, 또는 생성 제한용 '#create'
  client_key text        not null,
  tries      smallint    not null default 1,
  window_end timestamptz not null,
  primary key (scope, client_key)
);

alter table public.space_attempts enable row level security;
-- 정책 없음 = anon/authenticated 전면 거부. service role만 RLS를 우회합니다.
revoke all on public.space_attempts from anon, authenticated;

-- 창(window) 안의 시도 횟수를 원자적으로 하나 늘리고 그 값을 돌려줍니다.
-- 창이 지났으면 1부터 다시 셉니다.
create or replace function public.note_space_attempt(
  p_scope text,
  p_client text,
  p_window interval
)
returns smallint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tries smallint;
begin
  insert into public.space_attempts (scope, client_key, tries, window_end)
  values (p_scope, p_client, 1, now() + p_window)
  on conflict (scope, client_key) do update
    set tries = case
          when space_attempts.window_end < now() then 1
          else space_attempts.tries + 1
        end,
        window_end = case
          when space_attempts.window_end < now() then now() + p_window
          else space_attempts.window_end
        end
  returning tries into v_tries;
  return v_tries;
end;
$$;

-- ⚠ 함수의 EXECUTE는 PostgreSQL 기본값이 PUBLIC입니다. anon/authenticated만 revoke하면
--   PUBLIC을 통해 그대로 호출됩니다 — security definer 함수라 RLS도 막아주지 못합니다.
--   PUBLIC에서 걷어낸 뒤 Edge Function이 쓰는 service_role에만 다시 부여합니다.
revoke all on function public.note_space_attempt(text, text, interval)
  from public, anon, authenticated;
grant execute on function public.note_space_attempt(text, text, interval) to service_role;

-- ── RLS ───────────────────────────────────────────────────────────
-- spaces에는 정책을 하나도 만들지 않습니다. anon 키로는 스페이스를 조회할 수도,
-- 목록을 훑을 수도 없습니다. 스페이스 이름과 존재 여부는 비밀번호나 공유 토큰을
-- 확인한 Edge Function만 알려줍니다.

alter table public.spaces enable row level security;

drop policy if exists groups_select_public on public.spaces;
drop policy if exists spaces_select_public on public.spaces;

-- 나중에 누가 spaces에 select 정책을 추가하더라도 비밀값은 새지 않도록 컬럼 단위로
-- 막아둡니다. password_hash / share_token은 service role 외에는 읽을 수 없습니다.
revoke select on public.spaces from anon, authenticated;
grant select (id, name, created_at, updated_at) on public.spaces to anon, authenticated;

-- 참가자는 결과를 넣고 볼 수만 있습니다.
-- 남의 결과를 고치거나 지울 수 없고, expires_at을 늘려 영구 보존시킬 수도 없습니다.
--
-- ⚠ room 필터는 여기서도 보안이 아니라 스코핑입니다. 스페이스 게이트(비밀번호/공유
--   토큰)는 화면 접근을 막을 뿐이고, anon 키로 API를 직접 두드리면 만료 전 결과는
--   여전히 읽힙니다. 결과에 담기는 건 닉네임과 강아지 유형뿐이고 24시간 뒤 사라지므로
--   이 정도를 의도된 수준으로 봅니다. 더 조여야 한다면 README의 "무엇을 지키나"를
--   읽어보세요.

alter table public.results enable row level security;

-- SELECT: 살아 있는 행만
drop policy if exists results_select_live on public.results;
create policy results_select_live
  on public.results for select
  to anon, authenticated
  using (expires_at > now());

-- INSERT: 24시간을 넘겨 잡을 수 없음
-- (클라이언트는 expires_at을 보내지 않고 기본값에 맡깁니다. now()는 트랜잭션
--  시작 시각으로 고정되므로 default와 이 조건은 정확히 같은 값을 봅니다.)
drop policy if exists results_insert_capped on public.results;
create policy results_insert_capped
  on public.results for insert
  to anon, authenticated
  with check (expires_at <= now() + interval '24 hours');

-- UPDATE / DELETE: 정책 없음 = 전면 거부. 일부러 비워둡니다.

-- ── 방당 200명 상한 ───────────────────────────────────────────────
-- 장난 방지용. security definer로 RLS를 우회해 실제 개수를 셉니다.

create or replace function public.results_room_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.results
      where room = new.room and expires_at > now()) >= 200 then
    raise exception '이 방의 정원(200명)이 찼습니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_results_room_cap on public.results;
create trigger trg_results_room_cap
  before insert on public.results
  for each row execute function public.results_room_cap();

-- ── Realtime ──────────────────────────────────────────────────────
-- 제출 직후 새로고침 없이 지도에 노드가 나타나게 합니다.

do $$
begin
  alter publication supabase_realtime add table public.results;
exception
  when duplicate_object then null;        -- 이미 추가됨
  when undefined_object then              -- Supabase가 아닌 DB (shadow DB·로컬 테스트)
    raise warning 'supabase_realtime publication이 없어 Realtime 등록을 건너뜁니다';
end;
$$;

-- ── 자동 소멸 ─────────────────────────────────────────────────────
-- 매시 17분에 만료된 결과와 지난 입장 시도 기록을 지웁니다.
--
-- pg_cron이 없으면 경고만 남기고 넘어갑니다 — 마이그레이션 전체(그리고 CI 배포)를
-- 여기서 세우지 않기 위해서입니다. cron이 없어도 RLS가 만료된 행을 숨기므로 세미나
-- 진행에는 지장이 없습니다. 다만 행이 실제로 삭제되지는 않습니다.
--
-- Supabase에서 이 경고를 봤다면: Dashboard → Database → Extensions → pg_cron 켜기.

do $$
begin
  execute 'create extension if not exists pg_cron';
  perform cron.unschedule('dogtype-purge') from cron.job where jobname = 'dogtype-purge';
  perform cron.schedule('dogtype-purge', '17 * * * *', $purge$
    delete from public.results where expires_at < now();
    delete from public.space_attempts where window_end < now();
  $purge$);
exception
  when others then
    raise warning 'pg_cron 정리 작업을 걸지 못했습니다 (%). 만료 행이 지워지지 않습니다 — Dashboard → Database → Extensions에서 pg_cron을 켜고 다시 배포하세요.', sqlerrm;
end;
$$;
