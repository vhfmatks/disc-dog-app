-- 스페이스 표시 이름은 전체 서비스에서 하나만 사용한다.
-- 모든 생성 API가 btrim한 값을 저장하므로 앞뒤 공백만 다른 이름도 같은 값이 된다.
do $$
begin
  if exists (
    select 1 from public.spaces group by name having count(*) > 1
  ) then
    raise exception 'spaces.name 중복을 먼저 정리해야 spaces_name_key를 추가할 수 있습니다.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.spaces'::regclass
      and conname = 'spaces_name_key'
  ) then
    alter table public.spaces
      add constraint spaces_name_key unique (name);
  end if;
end;
$$;
