-- 결과의 anon 권한을 걷어냅니다. 읽기도 쓰기도 전부 Edge Function을 거칩니다.
--
-- 여태 results는 "만료 전이면 anon이 읽는다"였습니다. 0_init에 그게 보안이 아니라
-- 스코핑이라고 적어뒀고요 — 화면에서 비밀번호를 물어도 API를 직접 두드리면 남의
-- 스페이스 결과가 그대로 읽혔습니다. 담기는 게 닉네임과 강아지 유형뿐이고 하루 뒤
-- 사라지니 그 정도를 의도된 수준으로 봤습니다.
--
-- 함께보기는 그 위에 얹을 수 없습니다. "A는 B에게만 보인다"를 팔면서 아무나 읽을 수
-- 있는 테이블에 두는 건 거짓말이니까요. 그래서 경계를 서버로 옮깁니다.
--
-- ⚠ 조회만 옮길 수는 없었습니다. PostgreSQL은 `insert ... returning`이 돌려주는 행에도
--   SELECT 정책을 적용합니다. select 정책을 지우는 순간 브라우저의 저장(.insert().select())과
--   재시도 멱등성 조회, 닉네임 중복 확인이 함께 죽습니다. 그래서 쓰기 경로도 같은
--   순간에 spaces 함수로 옮겼습니다 (save-result · check-nickname).
--
-- 이 마이그레이션과 함수 배포는 한 묶음입니다. DB만 먼저 적용하면 참가자가 결과를
-- 저장하지 못합니다.

-- SELECT: space-views.fetch-results가 host 토큰과 grant를 확인한 뒤 돌려줍니다.
drop policy if exists results_select_live on public.results;

-- INSERT: spaces.save-result가 출입증을 확인한 뒤 service role로 넣습니다.
-- 200명 정원 트리거는 그대로 살아 있습니다 (security definer).
drop policy if exists results_insert_capped on public.results;

-- UPDATE·DELETE는 원래부터 정책이 없었습니다. 이제 네 가지 모두 anon에게 닫힙니다.
revoke all on public.results from anon, authenticated;

-- Realtime에서도 뺍니다. postgres_changes는 RLS를 그대로 따르므로 정책이 사라진 지금
-- anon이 구독해도 아무것도 오지 않습니다 — 조용히 아무 일도 안 하는 채널을 남겨두면
-- 다음 사람이 "왜 안 오지"를 디버깅하게 됩니다. 지도는 주기적 갱신으로 갑니다.
-- (검증된 사용자만 붙는 비공개 Broadcast 채널은 후속 과제입니다.)
do $$
begin
  alter publication supabase_realtime drop table public.results;
exception
  when undefined_object then null;    -- publication이 없거나(shadow DB) 이미 빠져 있음
  when undefined_table then null;
end;
$$;
