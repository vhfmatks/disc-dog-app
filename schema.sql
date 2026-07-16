-- 강아지 유형 세미나 도구 — Supabase 스키마
-- Supabase → SQL Editor 에 그대로 붙여넣고 Run. 재실행해도 안전합니다.
--
-- 전제: anon 키는 브라우저에 그대로 노출됩니다. 이건 정상이고, 숨기려는 시도를
--       하지 마세요. RLS가 유일한 방어선입니다.

-- ── 테이블 ────────────────────────────────────────────────────────

create table if not exists public.groups (
  id         text        primary key check (id ~ '^[a-z0-9-]{3,24}$'),
  name       text        not null check (char_length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 새 설치에서 바로 확인할 수 있는 기본 그룹. 관리자 페이지에서 지워도 됩니다.
insert into public.groups (id, name)
values ('demo', '데모 그룹')
on conflict (id) do nothing;

create table if not exists public.results (
  id           uuid        primary key default gen_random_uuid(),
  room         text        not null check (room ~ '^[a-z0-9-]{3,24}$')
                           constraint results_room_group_fkey
                           references public.groups(id) on delete cascade,
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

-- groups 도입 전 results에 있던 방은 기존 링크가 끊기지 않도록 그룹으로 승격한다.
insert into public.groups (id, name)
select distinct room, '기존 그룹 · ' || room
from public.results
on conflict (id) do nothing;

-- 기존 results 테이블에는 위 create table의 FK가 반영되지 않으므로 한 번만 추가한다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_room_group_fkey'
  ) then
    alter table public.results
      add constraint results_room_group_fkey
      foreign key (room) references public.groups(id) on delete cascade;
  end if;
end;
$$;

create or replace function public.set_group_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_groups_updated_at on public.groups;
create trigger trg_groups_updated_at
  before update on public.groups
  for each row execute function public.set_group_updated_at();

-- 60문항 버전부터 매력 문항이 유형별 5개→10개로 늘어 상한이 25→50이 된다.
-- 기존 테이블에도 적용되도록 자동 생성된 체크 제약을 다시 만든다. 하한 5는
-- 만료 전인 40문항 버전 결과와의 24시간 호환을 위해 유지한다.
alter table public.results drop constraint if exists results_charm_check;
alter table public.results
  add constraint results_charm_check check (charm between 5 and 50);

create index if not exists results_room_created_idx on public.results (room, created_at);
create index if not exists results_expires_idx      on public.results (expires_at);

-- ── RLS ───────────────────────────────────────────────────────────
-- 그룹은 링크 유효성 확인을 위해 공개 조회만 허용합니다. 생성·수정·삭제 정책은
-- 일부러 만들지 않습니다. 관리자 Edge Function의 service role만 변경할 수 있습니다.

alter table public.groups enable row level security;

drop policy if exists groups_select_public on public.groups;
create policy groups_select_public
  on public.groups for select
  to anon, authenticated
  using (true);

-- 참가자는 결과를 넣고 볼 수만 있습니다.
-- 남의 결과를 고치거나 지울 수 없고, expires_at을 늘려 영구 보존시킬 수도 없습니다.
--
-- room 필터는 보안이 아니라 스코핑입니다. 방 코드를 아는 사람은 그 방을 봅니다.
-- 그게 의도입니다.

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
  when duplicate_object then null;   -- 이미 추가됨
end;
$$;

-- ── 자동 소멸 ─────────────────────────────────────────────────────
-- 매시 17분에 만료된 행을 지웁니다.
--
-- ⚠ 아래에서 실패하면 pg_cron 확장이 꺼져 있는 것입니다.
--   Dashboard → Database → Extensions → pg_cron 검색 → 켜고 다시 실행하세요.
--   이 블록만 실패해도 위의 테이블/RLS/Realtime은 이미 적용됩니다.
--   (cron 없이도 RLS가 만료된 행을 숨기므로 세미나 진행에는 지장이 없습니다.
--    다만 행이 실제로 삭제되지는 않습니다.)

create extension if not exists pg_cron;

select cron.unschedule('dogtype-purge')
where exists (select 1 from cron.job where jobname = 'dogtype-purge');

select cron.schedule(
  'dogtype-purge',
  '17 * * * *',
  $$delete from public.results where expires_at < now()$$
);
