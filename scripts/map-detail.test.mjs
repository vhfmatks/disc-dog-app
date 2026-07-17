import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RELATION_ORDER, farthestPair, personLabel, relationGroups, relationLinks
} from '../src/lib/map-detail.ts';

const HOST = 'b-space';

const row = (id, nickname, primary_type) => ({id, nickname, primary_type, room: HOST, source_space: null});

/** 함께보기로 얹힌 다른 스페이스 사람. */
const guest = (id, nickname, primary_type, space) => ({
  id, nickname, primary_type,
  room: space.id,
  source_space: space
});

test('선택한 사람을 제외하고 관계별 배지 그룹을 표시 순서대로 만든다', () => {
  const selected = row('selected', '나', 'D');
  const groups = relationGroups(selected, [
    selected,
    row('good', '빠른 연결', 'I'),
    row('bad', '조율 필요', 'S'),
    row('same', '닮은 결', 'D')
  ], HOST);

  assert.deepEqual(groups, [
    {kind: 'good', label: '통하는 사이', names: ['빠른 연결']},
    {kind: 'bad', label: '설명이 필요한 사이', names: ['조율 필요']},
    {kind: 'same', label: '같은 유형', names: ['닮은 결']}
  ]);
});

test('해당하는 사람이 없는 관계 그룹은 만들지 않는다', () => {
  const selected = row('selected', '나', 'C');
  const groups = relationGroups(selected, [selected, row('good', '과제 동료', 'D')], HOST);

  assert.deepEqual(groups, [
    {kind: 'good', label: '통하는 사이', names: ['과제 동료']}
  ]);
});

test('함께보기에서는 밖에서 온 사람에게만 스페이스를 붙인다', () => {
  const design = {id: 'a-space', name: '디자인팀', icon_id: 'corgi'};

  // 우리 팀 사람은 닉네임만. 라벨이 길어지면 지도가 뭉갠다.
  assert.equal(personLabel(row('mine', '보리', 'D'), HOST), '보리');
  assert.equal(personLabel(guest('theirs', '보리', 'D', design), HOST), '디자인팀 · 보리');

  // 스페이스 이름이 아직 안 왔어도 누구의 이름인지는 밝힌다 — 코드라도 붙인다.
  assert.equal(
    personLabel({room: 'a-space', nickname: '보리', source_space: null}, HOST),
    'a-space · 보리'
  );
});

test('같은 닉네임이 여러 스페이스에 있어도 관계 목록에서 구분된다', () => {
  // 함께보기의 핵심 함정이다. 이름만 늘어놓으면 "보리, 보리"가 되어 누구를 말하는지
  // 알 수 없다. 병합하지 않고 각자 남기되, 어디 사람인지 밝힌다.
  const design = {id: 'a-space', name: '디자인팀', icon_id: 'corgi'};
  const sales = {id: 'c-space', name: '영업팀', icon_id: 'husky'};
  const selected = row('selected', '나', 'D');

  const groups = relationGroups(selected, [
    selected,
    row('mine', '보리', 'I'),
    guest('theirs', '보리', 'I', design),
    guest('other', '보리', 'I', sales)
  ], HOST);

  assert.deepEqual(groups, [
    {kind: 'good', label: '통하는 사이', names: ['보리', '디자인팀 · 보리', '영업팀 · 보리']}
  ]);
});

const crowd = [
  row('me', '나', 'D'),
  row('good', '통하는 사이', 'I'),
  row('bad', '조율 필요', 'S'),
  row('same', '닮은 결', 'D')
];

test('세 관계를 다 켜면 자신을 뺀 모두와 선이 이어진다 — 같은 유형도 포함', () => {
  const links = relationLinks(crowd[0], crowd, RELATION_ORDER);

  assert.deepEqual(links.map(link => [link.row.id, link.kind]), [
    ['good', 'good'],
    ['bad', 'bad'],
    ['same', 'same']
  ]);
});

test('켜둔 관계만 남는다', () => {
  const links = relationLinks(crowd[0], crowd, ['bad']);

  assert.deepEqual(links.map(link => link.row.id), ['bad']);
});

test('모두 끄면 선이 하나도 남지 않는다', () => {
  assert.deepEqual(relationLinks(crowd[0], crowd, []), []);
});

test('DISC 좌표상 가장 멀리 떨어진 두 사람을 찾는다', () => {
  const near = {...row('b', '가까운 사람', 'I'), x: 0.2, y: 0.1};
  const left = {...row('a', '왼쪽 사람', 'D'), x: -0.9, y: -0.8};
  const right = {...row('c', '오른쪽 사람', 'S'), x: 0.9, y: 0.8};

  assert.deepEqual(farthestPair([near, right, left]), [left, right]);
});

test('두 명보다 적으면 최장 거리 쌍이 없다', () => {
  assert.equal(farthestPair([]), null);
  assert.equal(farthestPair([{id: 'solo', x: 0, y: 0}]), null);
});

test('모든 좌표가 같거나 거리가 동률이어도 id 순으로 결과가 고정된다', () => {
  const a = {id: 'a', x: 0, y: 0};
  const b = {id: 'b', x: 0, y: 0};
  const c = {id: 'c', x: 0, y: 0};

  assert.deepEqual(farthestPair([c, b, a]), [a, b]);
});
