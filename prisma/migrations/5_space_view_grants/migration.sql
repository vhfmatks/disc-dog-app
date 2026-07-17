-- View 공유(함께보기)의 권한 원장.
--
-- `source → viewer` 한 방향만 뜻합니다: viewer의 입장 권한을 가진 사람이 viewer 기준
-- 함께보기 안에서 source의 허용된 결과를 읽을 수 있다. 그 반대도, 연쇄도 없습니다.
--
-- 한쪽 의사로 발효되지 않습니다. source 관리자가 제안하고(granted_at), viewer 관리자가
-- 수락해야(accepted_at) 살아납니다. 수락 단계가 없으면 아무나 스페이스를 만들어 남의
-- 스페이스에 grant를 걸고, 자유 텍스트인 스페이스 이름을 상대 구성원 전원의 화면에
-- 밀어넣을 수 있습니다. 종료(revoked_at)는 양쪽 다 할 수 있습니다.

create table if not exists public.space_view_grants (
  source_space_id text not null
                  constraint space_view_grants_source_fkey
                  references public.spaces(id) on delete cascade,
  viewer_space_id text not null
                  constraint space_view_grants_viewer_fkey
                  references public.spaces(id) on delete cascade,
  granted_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  visible_from timestamptz,

  primary key (source_space_id, viewer_space_id),

  -- 자기 자신에게 주는 공유는 뜻이 없습니다. 기준 스페이스는 언제나 포함되니까요.
  constraint space_view_grants_not_self check (source_space_id <> viewer_space_id),

  -- visible_from은 수락 시각입니다. 수락 없이 값이 있으면 공개 범위가 열린 셈이라
  -- 애초에 그런 행을 만들 수 없게 막습니다.
  constraint space_view_grants_visible_needs_accept
    check (visible_from is null or accepted_at is not null)
);

create index if not exists space_view_grants_viewer_idx
  on public.space_view_grants (viewer_space_id, revoked_at);
create index if not exists space_view_grants_source_idx
  on public.space_view_grants (source_space_id, revoked_at);

-- ── RLS ───────────────────────────────────────────────────────────
-- ⚠ 이 두 줄이 없으면 계획의 보안 불변식이 통째로 무너집니다. Supabase는 public
--   스키마의 새 테이블에 기본 권한이 열려 있어서, 정책을 안 만드는 것만으로는
--   막히지 않습니다 — 어느 스페이스가 어느 스페이스와 이어져 있는지가 anon 키로
--   그대로 읽힙니다. space_attempts와 같은 패턴으로 잠급니다.
--
--   grant 판정은 전부 space-views Edge Function(service role)이 합니다.

alter table public.space_view_grants enable row level security;
-- 정책 없음 = anon/authenticated 전면 거부. service role만 RLS를 우회합니다.
revoke all on public.space_view_grants from anon, authenticated;
