import assert from 'node:assert/strict';
import test from 'node:test';
import {farthestPair, relationGroups} from '../src/lib/map-detail.ts';

const row = (id, nickname, primary_type) => ({id, nickname, primary_type});

test('선택한 사람을 제외하고 관계별 배지 그룹을 표시 순서대로 만든다', () => {
  const selected = row('selected', '나', 'D');
  const groups = relationGroups(selected, [
    selected,
    row('good', '빠른 연결', 'I'),
    row('bad', '조율 필요', 'S'),
    row('same', '닮은 결', 'D')
  ]);

  assert.deepEqual(groups, [
    {kind: 'good', label: '통하는 사이', names: ['빠른 연결']},
    {kind: 'bad', label: '설명이 필요한 사이', names: ['조율 필요']},
    {kind: 'same', label: '같은 유형', names: ['닮은 결']}
  ]);
});

test('해당하는 사람이 없는 관계 그룹은 만들지 않는다', () => {
  const selected = row('selected', '나', 'C');
  const groups = relationGroups(selected, [selected, row('good', '과제 동료', 'D')]);

  assert.deepEqual(groups, [
    {kind: 'good', label: '통하는 사이', names: ['과제 동료']}
  ]);
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
