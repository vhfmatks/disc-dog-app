-- 스페이스 생성자 전용 관리 토큰.
--
-- 왜 필요한가: 지금까지 스페이스에는 "생성자"라는 권한이 없었습니다. 비밀번호도
-- share_token도 참가자 입장에 쓰이므로, 둘 중 무엇을 알든 그 사람이 방을 만든
-- 사람이라고 말해주지 않습니다. View 공유(다음 마이그레이션)는 남의 스페이스에
-- 내 결과를 보여주는 결정이라 참가자 권한으로 하게 둘 수 없습니다.
--
-- 저장하는 값은 SHA-256 해시입니다. 원문은 생성 응답에서 한 번만 나가고 브라우저에
-- 남습니다. 비밀번호와 달리 PBKDF2를 쓰지 않는 이유는 _shared/spaces.ts에 적어뒀습니다.

alter table public.spaces add column if not exists manage_token_hash text;

-- 컬럼 GRANT는 화이트리스트입니다. 새 비밀 컬럼이 자동으로 빠지긴 하지만, 비밀을
-- 하나 더 들인 자리에서 목록을 다시 한 번 못박아 둡니다 (0_init과 같은 목록).
revoke select on public.spaces from anon, authenticated;
grant select (id, name, created_at, updated_at) on public.spaces to anon, authenticated;
