-- 닉네임은 스페이스 안에서만 유일하다. 만료 행은 이미 사용자에게 보이지 않는 데이터라
-- 먼저 정리하고, 활성 중복이나 공백 우회 값은 임의로 고치지 않고 배포를 멈춘다.
delete from public.results where expires_at <= now();

do $$
begin
  if exists (select 1 from public.results where nickname <> btrim(nickname)) then
    raise exception 'results에 앞뒤 공백이 포함된 닉네임이 있습니다. 값을 정리한 뒤 다시 배포하세요.';
  end if;

  if exists (
    select 1
    from public.results
    group by room, nickname
    having count(*) > 1
  ) then
    raise exception 'results에 스페이스 내 중복 닉네임이 있습니다. 중복을 정리한 뒤 다시 배포하세요.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_nickname_trimmed_check'
  ) then
    alter table public.results
      add constraint results_nickname_trimmed_check check (nickname = btrim(nickname));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.results'::regclass
      and conname = 'results_room_nickname_key'
  ) then
    alter table public.results
      add constraint results_room_nickname_key unique (room, nickname);
  end if;
end;
$$;

-- pg_cron이 꺼져 있어도 24시간이 지난 닉네임은 다시 쓸 수 있어야 한다. unique 검사 전에
-- 같은 스페이스·닉네임의 만료 행만 정리하며, 활성 행끼리의 경쟁은 unique가 원자적으로 막는다.
create or replace function public.results_release_expired_nickname()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.results
  where room = new.room
    and nickname = new.nickname
    and expires_at <= now();
  return new;
end;
$$;

drop trigger if exists trg_results_release_expired_nickname on public.results;
create trigger trg_results_release_expired_nickname
  before insert on public.results
  for each row execute function public.results_release_expired_nickname();
