// 결과 영속화 — 24시간 만료 폐지.
//
// 참가자에게 한 약속이 바뀌는 변경입니다. DB에서 만료를 걷어내는 것과 화면에서
// "24시간 뒤 사라집니다"를 지우는 건 반드시 같이 가야 합니다. 하나만 하면 거짓말이
// 됩니다 — 그래서 문구까지 테스트가 지킵니다.

import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('만료 컬럼과 그 인덱스를 지운다', async () => {
  const migration = await read('prisma/migrations/7_persist_results/migration.sql');

  assert.match(migration, /alter table public\.results drop column if exists expires_at/);
  // 정원 계산에서 "살아 있는 행"이라는 개념이 사라진다.
  assert.match(migration, /select count\(\*\) from public\.results where room = new\.room\) >= 200/);
});

test('expires_at을 읽던 DB 객체를 하나도 남기지 않는다', async () => {
  // ⚠ 실제로 물린 적 있는 함정이다. PostgreSQL은 컬럼을 지울 때 plpgsql 함수 본문을
  //   검사하지 않는다. 그래서 expires_at을 읽는 트리거를 남겨두면 마이그레이션은
  //   조용히 성공하고, 그 다음부터 results INSERT가 전부 죽는다 — 배포 후 첫 참가자가
  //   발견한다. 앞선 마이그레이션이 만든 객체를 여기서 전수로 못박는다.
  const seven = await read('prisma/migrations/7_persist_results/migration.sql');

  // 2_result_nickname_unique의 만료 닉네임 반납 트리거 — 지워야 한다.
  assert.match(seven, /drop trigger if exists trg_results_release_expired_nickname on public\.results/);
  assert.match(seven, /drop function if exists public\.results_release_expired_nickname\(\)/);

  // 0_init·3의 나머지는 create or replace로 덮어쓴다.
  assert.match(seven, /create or replace function public\.results_room_cap\(\)/);
  assert.match(seven, /create or replace function public\.list_active_spaces\(/);

  // 6이 정책 둘을 지운다 (정책도 expires_at을 읽었다).
  const six = await read('prisma/migrations/6_server_side_results/migration.sql');
  assert.match(six, /drop policy if exists results_select_live/);
  assert.match(six, /drop policy if exists results_insert_capped/);
});

test('스키마에 expires_at이 남아 있지 않다', async () => {
  const schema = await read('prisma/schema.prisma');

  assert.doesNotMatch(schema, /expires_at/);
  assert.doesNotMatch(schema, /results_expires_idx/);
  // 만료 대신 무엇이 결과를 지우는지 적어둔다.
  assert.match(schema, /스페이스가 지워질 때까지/);
});

test('pg_cron은 결과를 지우지 않고 입장 시도 기록만 정리한다', async () => {
  const migration = await read('prisma/migrations/7_persist_results/migration.sql');
  const purge = migration.slice(migration.indexOf('cron.schedule'), migration.indexOf('$purge$;'));

  assert.match(purge, /delete from public\.space_attempts where window_end < now\(\)/);
  assert.doesNotMatch(purge, /delete from public\.results/);
});

test('서버 코드에 만료 필터가 남아 있지 않다', async () => {
  const admin = await read('supabase/functions/admin-spaces/index.ts');
  const spaces = await read('supabase/functions/spaces/index.ts');
  const views = await read('supabase/functions/space-views/index.ts');

  for (const [name, source] of [['admin-spaces', admin], ['spaces', spaces], ['space-views', views]]) {
    assert.doesNotMatch(source, /expires_at/, `${name}에 만료 필터가 남아 있음`);
  }
});

test('"24시간 뒤 사라진다"는 약속이 코드베이스에 남아 있지 않다', async () => {
  // 홈의 '최근 24시간'은 활동 기준을 가리키는 말이라 남는다. 사라진다는 약속만 잡는다.
  const promise = /24시간[^.\n]{0,20}(사라|삭제|지워)/;

  const sources = await readdir(new URL('../src', import.meta.url), {recursive: true});
  const files = ['README.md', ...sources
    .filter(name => /\.(ts|tsx)$/.test(name))
    .map(name => `src/${name}`)];

  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, promise, `${file}에 만료 약속이 남아 있음`);
  }
});

test('참가·프로필 화면이 새 보존 기간을 말해준다', async () => {
  const [participant, profile] = await Promise.all([
    read('src/ParticipantApp.tsx'),
    read('src/ProfileApp.tsx')
  ]);

  assert.match(participant, /스페이스가 지워질 때까지/);
  assert.match(profile, /스페이스가 지워질 때까지/);
});
