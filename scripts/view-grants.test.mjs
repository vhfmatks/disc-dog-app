// 함께보기 권한 규칙.
//
// 공유는 **양방향**입니다: 한쪽이 제안하고 다른 쪽이 수락하면 서로를 봅니다.
// 전이는 없습니다 — A–B와 B–C가 있어도 A는 C를 못 봅니다.
//
// 여기 있는 함수들은 DB를 모릅니다. 그래서 이 테스트는 Supabase 없이 돕니다 —
// 권한 판정이 순수 함수로 떨어져 있어야 하는 이유이기도 합니다.

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  MAX_ROWS, MAX_SHAREABLE, MAX_SOURCES, deniedSourceIds, isActive, isIncoming,
  normalizeSourceIds, pairKey, partnerOf, shareState, withinVisibleWindow
} from '../supabase/functions/_shared/view-grants.ts';
import {MAX_WITH_SPACES, parseWithSpaceIds, parseRoute} from '../src/lib/router.ts';

const T0 = '2026-07-01T00:00:00.000Z';
const T1 = '2026-07-02T00:00:00.000Z';
const T2 = '2026-07-03T00:00:00.000Z';

/** 저장은 언제나 사전순 정렬쌍이다. requestedBy가 제안한 쪽. */
const share = (one, other, requestedBy, extra = {}) => {
  const [space_a, space_b] = pairKey(one, other);
  return {
    space_a, space_b,
    requested_by: requestedBy,
    requested_at: T0,
    accepted_at: null,
    revoked_at: null,
    visible_from: null,
    ...extra
  };
};

const active = (one, other, requestedBy = one, visibleFrom = T0) =>
  share(one, other, requestedBy, {accepted_at: visibleFrom, visible_from: visibleFrom});
const ended = (one, other, requestedBy = one) =>
  share(one, other, requestedBy, {accepted_at: T0, visible_from: T0, revoked_at: T2});

const row = (id, room, createdAt = T1) => ({id, room, created_at: createdAt});

test('정렬쌍이 (A,B)와 (B,A)의 중복을 구조적으로 막는다', () => {
  // 방향이 없으니 두 스페이스 사이의 공유는 하나뿐이어야 한다. 어느 순서로 불러도
  // 같은 키가 나오는 게 그 보장의 뿌리다 (기본키가 곧 유일성).
  assert.deepEqual(pairKey('a-space', 'b-space'), ['a-space', 'b-space']);
  assert.deepEqual(pairKey('b-space', 'a-space'), ['a-space', 'b-space']);

  const one = share('a-space', 'b-space', 'a-space');
  const other = share('b-space', 'a-space', 'b-space');
  assert.equal(one.space_a, other.space_a);
  assert.equal(one.space_b, other.space_b);
});

test('상대와 제안자를 어느 쪽에서 보든 바르게 읽는다', () => {
  const s = share('b-space', 'a-space', 'b-space');   // B가 A에게 제안

  assert.equal(partnerOf(s, 'a-space'), 'b-space');
  assert.equal(partnerOf(s, 'b-space'), 'a-space');

  // 수락 버튼은 받은 쪽에만 뜬다.
  assert.equal(isIncoming(s, 'a-space'), true);
  assert.equal(isIncoming(s, 'b-space'), false);
});

test('공유 상태는 수락과 종료 두 시각으로만 읽는다', () => {
  assert.equal(shareState(share('a-space', 'b-space', 'a-space')), 'pending');
  assert.equal(shareState(active('a-space', 'b-space')), 'active');
  assert.equal(shareState(ended('a-space', 'b-space')), 'ended');

  // 수락 전에 종료된 제안도 ended다 — 되살아나지 않는다.
  assert.equal(shareState({accepted_at: null, revoked_at: T2}), 'ended');
  assert.equal(isActive(share('a-space', 'b-space', 'a-space')), false);
});

test('수락하면 서로 본다 — 양방향이다', () => {
  const shares = [active('a-space', 'b-space', 'a-space')];

  // A가 제안했지만, 수락된 뒤에는 A도 B를 본다.
  assert.deepEqual(deniedSourceIds(['b-space'], shares, 'a-space'), []);
  assert.deepEqual(deniedSourceIds(['a-space'], shares, 'b-space'), []);
});

test('수락하기 전에는 양쪽 다 아무것도 못 본다', () => {
  const shares = [share('a-space', 'b-space', 'a-space')];

  assert.deepEqual(deniedSourceIds(['b-space'], shares, 'a-space'), ['b-space']);
  assert.deepEqual(deniedSourceIds(['a-space'], shares, 'b-space'), ['a-space']);
  assert.deepEqual(withinVisibleWindow([row('r1', 'a-space')], 'b-space', shares), []);
});

test('B는 자기에게 공유된 A·C만 함께 볼 수 있다', () => {
  const shares = [active('a-space', 'b-space'), active('c-space', 'b-space')];

  assert.deepEqual(deniedSourceIds(['a-space'], shares, 'b-space'), []);
  assert.deepEqual(deniedSourceIds(['c-space'], shares, 'b-space'), []);
  assert.deepEqual(deniedSourceIds(['a-space', 'c-space'], shares, 'b-space'), []);

  // 공유가 없는 D는 넣을 수 없다.
  assert.deepEqual(deniedSourceIds(['a-space', 'd-space'], shares, 'b-space'), ['d-space']);
});

test('공유가 끝나면 양쪽 다 다음 조회부터 빠진다', () => {
  const shares = [ended('a-space', 'b-space'), active('c-space', 'b-space')];

  assert.deepEqual(deniedSourceIds(['a-space', 'c-space'], shares, 'b-space'), ['a-space']);
  assert.deepEqual(deniedSourceIds(['b-space'], shares, 'a-space'), ['b-space']);
  assert.deepEqual(
    withinVisibleWindow([row('r1', 'a-space'), row('r2', 'c-space')], 'b-space', shares)
      .map(item => item.id),
    ['r2']
  );
});

test('남의 공유가 섞여 들어와도 내 권한으로 읽지 않는다', () => {
  // ⚠ 실제로 물린 적 있는 함정이다. partnerOf는 내가 낀 공유를 전제로 하는데,
  //   B–C 공유를 A로 물으면 "상대는 B"라고 답한다. 그 값을 그대로 믿으면 A가 B를
  //   볼 수 있다고 착각한다. 서버는 나가 낀 공유만 읽어오지만, 판정 함수는 혼자서도
  //   옳아야 한다.
  const others = [active('b-space', 'c-space')];

  assert.deepEqual(deniedSourceIds(['b-space'], others, 'a-space'), ['b-space']);
  assert.deepEqual(deniedSourceIds(['c-space'], others, 'a-space'), ['c-space']);
  assert.deepEqual(withinVisibleWindow([row('r1', 'b-space')], 'a-space', others), []);
});

test('양방향이어도 전이되지 않는다 — A–B, B–C 라도 A는 C를 못 본다', () => {
  // A 기준으로 조회할 때 서버가 읽는 건 A가 낀 공유뿐이다.
  const sharesForA = [active('a-space', 'b-space')];

  assert.deepEqual(deniedSourceIds(['b-space'], sharesForA, 'a-space'), []);        // A는 B를 본다
  assert.deepEqual(deniedSourceIds(['c-space'], sharesForA, 'a-space'), ['c-space']); // C는 못 본다
  assert.deepEqual(deniedSourceIds(['b-space', 'c-space'], sharesForA, 'a-space'), ['c-space']);
});

test('수락 시각 이전에 만들어진 결과는 양쪽 모두 넘어가지 않는다', () => {
  const shares = [active('a-space', 'b-space', 'a-space', T1)];
  const rows = [
    row('before', 'a-space', T0),   // 수락 전에 제출 — 사후 공유를 예상하지 못한 사람
    row('exact', 'a-space', T1),    // 수락 바로 그 순간
    row('after', 'a-space', T2)
  ];

  assert.deepEqual(
    withinVisibleWindow(rows, 'b-space', shares).map(item => item.id),
    ['exact', 'after']
  );

  // 반대 방향에도 같은 시각이 걸린다 — 맞교환이니까.
  const mine = [row('mine-before', 'b-space', T0), row('mine-after', 'b-space', T2)];
  assert.deepEqual(
    withinVisibleWindow(mine, 'a-space', shares).map(item => item.id),
    ['mine-after']
  );
});

test('재수락하면 visible_from이 리셋되어 이전 공유 기간의 결과가 다시 숨는다', () => {
  // 결과가 영속화되면서 이 규칙의 무게가 커졌다. 없으면 한 번이라도 공유된 결과는
  // 해제 → 재수락만으로 영원히 다시 열 수 있게 된다.
  const rows = [row('old', 'a-space', T0), row('new', 'a-space', T2)];

  const first = [active('a-space', 'b-space', 'a-space', T0)];
  assert.deepEqual(withinVisibleWindow(rows, 'b-space', first).map(item => item.id), ['old', 'new']);

  const reaccepted = [active('a-space', 'b-space', 'a-space', T1)];
  assert.deepEqual(withinVisibleWindow(rows, 'b-space', reaccepted).map(item => item.id), ['new']);
});

test('내 스페이스의 결과는 visible_from과 무관하게 본다', () => {
  const shares = [active('a-space', 'b-space', 'a-space', T2)];
  const rows = [row('mine', 'b-space', T0), row('theirs', 'a-space', T0)];

  assert.deepEqual(
    withinVisibleWindow(rows, 'b-space', shares).map(item => item.id),
    ['mine']
  );
});

test('공유가 없는 스페이스의 행은 섞여 들어와도 걸러진다', () => {
  // fail closed. 위 단계에서 이미 막지만, 마지막 필터도 혼자서 옳아야 한다.
  assert.deepEqual(withinVisibleWindow([row('r1', 'd-space')], 'b-space', []), []);
});

test('상대 목록을 손질한다 — 소문자·중복·내 스페이스 제거', () => {
  assert.deepEqual(normalizeSourceIds(['A-Space', 'a-space', 'b-space'], 'b-space').ids, ['a-space']);
  assert.deepEqual(normalizeSourceIds([' c-space '], 'b-space').ids, ['c-space']);
  assert.deepEqual(normalizeSourceIds(undefined, 'b-space').ids, []);
  assert.deepEqual(normalizeSourceIds([], 'b-space').ids, []);
});

test('형식이 틀렸거나 개수가 넘는 목록은 거절한다', () => {
  assert.equal(normalizeSourceIds(['한글'], 'b-space').issue.code, 'SOURCE_ID_INVALID');
  assert.equal(normalizeSourceIds(['ab'], 'b-space').issue.code, 'SOURCE_ID_INVALID');
  assert.equal(normalizeSourceIds([42], 'b-space').issue.code, 'SOURCE_ID_INVALID');
  assert.equal(normalizeSourceIds('a-space', 'b-space').issue.code, 'SOURCE_ID_INVALID');
  // 예약어는 스페이스 코드가 될 수 없다 (라우팅이 깨진다).
  assert.equal(normalizeSourceIds(['manage'], 'b-space').issue.code, 'SOURCE_ID_INVALID');

  const many = Array.from({length: MAX_SOURCES + 1}, (_, index) => `space-${index}00`);
  assert.equal(normalizeSourceIds(many, 'b-space').issue.code, 'TOO_MANY_SOURCES');
  assert.equal(normalizeSourceIds(many.slice(0, MAX_SOURCES), 'b-space').ids.length, MAX_SOURCES);
});

test('주소의 ?with=를 파싱해도 서버와 같은 규칙으로 손질한다', () => {
  assert.deepEqual(parseWithSpaceIds('?with=a-space,c-space', 'b-space'), ['a-space', 'c-space']);
  // 기준 스페이스를 넣어도 한 번만 포함된다 (여기서 빠지고, 서버가 언제나 더한다).
  assert.deepEqual(parseWithSpaceIds('?with=b-space,a-space', 'b-space'), ['a-space']);
  assert.deepEqual(parseWithSpaceIds('?with=a-space,a-space', 'b-space'), ['a-space']);
  assert.deepEqual(parseWithSpaceIds('?with=A-Space', 'b-space'), ['a-space']);
  assert.deepEqual(parseWithSpaceIds('?with=%ED%95%9C%EA%B8%80,a-space', 'b-space'), ['a-space']);
  assert.deepEqual(parseWithSpaceIds('', 'b-space'), []);

  const many = Array.from({length: 20}, (_, index) => `space-${index}00`).join(',');
  assert.equal(parseWithSpaceIds(`?with=${many}`, 'b-space').length, MAX_WITH_SPACES);
});

test('프런트와 서버의 함께보기 상한이 같다', () => {
  assert.equal(MAX_WITH_SPACES, MAX_SOURCES);
  // 스페이스당 정원 200명 × 10개(내 것 포함)면 2,000행이다. 상한은 그보다 낮아야 뜻이 있다.
  assert.ok(MAX_ROWS < 200 * (MAX_SOURCES + 1));
  // 목록은 브라우저가 검색하므로 한 번에 실어 보낼 수 있는 양이어야 한다.
  assert.ok(MAX_SHAREABLE >= 50 && MAX_SHAREABLE <= 500);
});

test('함께보기 주소는 지도 라우트로 읽히고 고른 스페이스를 싣는다', () => {
  const location = new URL('https://x.io/app/b-space/map?with=a-space,c-space');
  assert.deepEqual(parseRoute(location), {
    kind: 'map', spaceId: 'b-space', withSpaceIds: ['a-space', 'c-space']
  });

  // 단일 지도는 withSpaceIds를 달지 않는다 — 기존 화면과 같은 모양이어야 한다.
  assert.deepEqual(parseRoute(new URL('https://x.io/app/b-space/map')), {
    kind: 'map', spaceId: 'b-space'
  });
});

test('공유 테이블은 RLS로 잠겨 있고 정렬쌍 불변식을 DB가 강제한다', async () => {
  // ⚠ RLS 두 줄이 없으면 어느 스페이스가 어디와 이어졌는지가 anon 키로 읽힌다.
  //   Supabase는 public 스키마 새 테이블에 기본 권한이 열려 있어 정책을 안 만드는
  //   것만으로는 막히지 않는다.
  const migration = await readFile(new URL(
    '../prisma/migrations/8_mutual_shares/migration.sql', import.meta.url
  ), 'utf8');

  assert.match(migration, /alter table public\.space_shares enable row level security/);
  assert.match(migration, /revoke all on public\.space_shares from anon, authenticated/);
  assert.doesNotMatch(migration, /create policy/);

  // 정렬쌍 + 기본키 = 두 스페이스 사이에 공유는 최대 하나.
  assert.match(migration, /check \(space_a < space_b\)/);
  assert.match(migration, /primary key \(space_a, space_b\)/);
  assert.match(migration, /check \(requested_by in \(space_a, space_b\)\)/);
  assert.match(migration, /check \(visible_from is null or accepted_at is not null\)/);
  assert.match(migration, /on delete cascade/);

  // 관리 토큰은 폐기됐다 — 비밀번호가 곧 관리 권한이다.
  assert.match(migration, /alter table public\.spaces drop column if exists manage_token_hash/);
});

test('결과의 anon 권한은 읽기·쓰기 모두 걷혔다', async () => {
  const migration = await readFile(new URL(
    '../prisma/migrations/6_server_side_results/migration.sql', import.meta.url
  ), 'utf8');

  assert.match(migration, /drop policy if exists results_select_live on public\.results/);
  assert.match(migration, /drop policy if exists results_insert_capped on public\.results/);
  assert.match(migration, /revoke all on public\.results from anon, authenticated/);
  // Realtime도 함께 뺀다 — 정책이 없으면 조용히 아무것도 오지 않는 채널이 된다.
  assert.match(migration, /alter publication supabase_realtime drop table public\.results/);
});
