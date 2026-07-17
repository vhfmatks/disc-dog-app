-- 공유를 양방향(맞교환)으로 바꾸고, 관리 토큰을 폐기합니다.
--
-- 무엇이 달라지나:
--   1. 수락하면 두 스페이스가 서로를 봅니다. A→B와 B→A를 따로 맺지 않습니다.
--   2. 스페이스 비밀번호가 곧 관리 권한입니다. 관리 토큰(4_space_manage_token)은
--      필요 없어졌습니다.
--
-- ⚠ 2번의 뜻을 분명히 해둡니다: 비밀번호를 아는 참가자는 **누구나** 이 스페이스의
--   결과를 남에게 공유할 수 있습니다. 초대 링크(#k=)로 들어온 사람은 비밀번호를
--   모르니 못 하지만, 홈에서 비밀번호를 치고 들어온 사람은 할 수 있습니다.
--   생성자 전용 권한이 아닙니다 — 의도된 선택입니다.

-- ── 관리 토큰 폐기 ────────────────────────────────────────────────
alter table public.spaces drop column if exists manage_token_hash;

-- 컬럼 GRANT 화이트리스트를 다시 못박습니다 (0_init과 같은 목록).
revoke select on public.spaces from anon, authenticated;
grant select (id, name, created_at, updated_at) on public.spaces to anon, authenticated;

-- ── 공유를 정렬쌍으로 다시 세운다 ─────────────────────────────────
-- 방향이 없어졌으니 (source, viewer)라는 이름과 구조가 거짓말이 됩니다. 두 스페이스
-- 사이에 공유는 하나뿐이어야 하는데, 그 구조로는 (A,B)와 (B,A)가 동시에 생길 수
-- 있어 "둘 사이의 공유"가 두 개가 됩니다.
--
-- 그래서 사전순으로 정렬해 저장합니다. space_a < space_b가 CHECK로 강제되므로
-- 기본키 하나가 곧 "두 스페이스 사이에 공유는 최대 하나"를 뜻합니다.
-- 누가 제안했는지는 requested_by에 남습니다 (수락 버튼을 어느 쪽에 띄울지 정한다).
--
-- 아직 아무도 안 쓰는 기능이라 통째로 다시 만듭니다.

drop table if exists public.space_view_grants;

create table if not exists public.space_shares (
  -- 사전순으로 앞/뒤. 아래 CHECK가 순서를 강제한다.
  space_a text not null
          constraint space_shares_a_fkey references public.spaces(id) on delete cascade,
  space_b text not null
          constraint space_shares_b_fkey references public.spaces(id) on delete cascade,
  -- 제안한 쪽. space_a 아니면 space_b다.
  requested_by text not null,

  requested_at timestamptz not null default now(),
  -- 수락 시각. null이면 pending이라 양쪽 모두 아무것도 못 본다.
  accepted_at  timestamptz,
  -- 종료 시각. 어느 쪽이 눌러도 채워진다.
  revoked_at   timestamptz,
  -- 이 시각 이후에 만들어진 결과만 상대에게 보인다. 양쪽에 같은 값이 걸린다.
  visible_from timestamptz,

  primary key (space_a, space_b),

  -- 정렬쌍 불변식. 이게 (A,B)와 (B,A)의 중복을 구조적으로 막는다.
  constraint space_shares_ordered check (space_a < space_b),
  constraint space_shares_requester check (requested_by in (space_a, space_b)),
  -- visible_from은 수락 시각이다. 수락 없이 값이 있으면 공개 범위가 열린 셈이다.
  constraint space_shares_visible_needs_accept
    check (visible_from is null or accepted_at is not null)
);

create index if not exists space_shares_a_idx on public.space_shares (space_a, revoked_at);
create index if not exists space_shares_b_idx on public.space_shares (space_b, revoked_at);

-- ── RLS ───────────────────────────────────────────────────────────
-- ⚠ 이 두 줄이 없으면 어느 스페이스가 어디와 이어졌는지가 anon 키로 그대로 읽힙니다.
--   Supabase는 public 스키마 새 테이블에 기본 권한이 열려 있어 정책을 안 만드는
--   것만으로는 막히지 않습니다. 판정은 전부 space-views 함수(service role)가 합니다.

alter table public.space_shares enable row level security;
-- 정책 없음 = anon/authenticated 전면 거부. service role만 RLS를 우회합니다.
revoke all on public.space_shares from anon, authenticated;
