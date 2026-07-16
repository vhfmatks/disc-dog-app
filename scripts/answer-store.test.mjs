import assert from 'node:assert/strict';
import test from 'node:test';
import {Q} from '../assets/data.ts';
import {
  DONE_MAX, clearDraft, deleteDoneSet, doneSetToEvict, formatWhen, insertDoneSet,
  loadStore, sanitizeStore, saveDoneSet, saveDraft
} from '../src/lib/answer-store.ts';

/** answer-store는 localStorage 하나만 본다. 딱 그만큼만 흉내낸다. */
function stubStorage() {
  const box = new Map();
  globalThis.localStorage = {
    getItem: key => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
    removeItem: key => box.delete(key)
  };
  return box;
}

const answered = value => new Array(Q.length).fill(value);

test('완료 응답은 최근 10벌까지 보관한다', () => {
  assert.equal(DONE_MAX, 10);
});

const doneSet = (spaceId, over = {}) => ({
  spaceId,
  spaceName: `${spaceId} 워크숍`,
  nickname: '커피두잔',
  answers: answered(3),
  code: 'D',
  primary: 'D',
  completedAt: 1000,
  ...over
});

test('진행 중인 한 벌은 스페이스를 달고 저장된다', () => {
  stubStorage();
  saveDraft({
    spaceId: 'hazel-corgi-427',
    spaceName: '7월 워크숍',
    nickname: '뚱이',
    answers: answered(0).map((_, i) => (i < 12 ? 4 : 0)),
    page: 1,
    updatedAt: 500
  });

  const {draft} = loadStore();
  assert.equal(draft?.spaceId, 'hazel-corgi-427');
  assert.equal(draft?.page, 1);
  assert.equal(draft?.nickname, '뚱이');
  assert.equal(draft?.answers.filter(Boolean).length, 12);

  clearDraft();
  assert.equal(loadStore().draft, null);
});

test('한 문항도 답하지 않은 한 벌은 draft가 아니다', () => {
  // 설문을 열어만 두고 나간 상태. 이어할 게 없으니 이어하기도, 사라진다는 경고도 성립하지 않는다.
  const empty = sanitizeStore({
    draft: {spaceId: 'a', spaceName: 'A', nickname: '뚱이', answers: answered(0), page: 0, updatedAt: 1}
  });
  assert.equal(empty.draft, null);
});

test('완료 세트는 상한만큼만 남고 오래된 것부터 지워진다', () => {
  // 상한보다 두 벌 더 낸다. 낸 순서대로 s0, s1, ... 이고 최근이 앞에 온다.
  const spaceIds = Array.from({length: DONE_MAX + 2}, (_, index) => `s${index}`);
  const list = spaceIds.reduce((done, spaceId) => insertDoneSet(done, doneSet(spaceId)), []);

  assert.equal(list.length, DONE_MAX);
  assert.deepEqual(list.map(set => set.spaceId), spaceIds.slice(-DONE_MAX).reverse());
  assert.equal(list.at(-1).spaceId, 's2', '제일 오래된 s0·s1이 밀려났다');
});

test('같은 스페이스를 다시 하면 예전 응답을 대신한다 — 칸을 두 번 먹지 않는다', () => {
  const first = insertDoneSet([], doneSet('a', {nickname: '처음'}));
  const list = insertDoneSet(insertDoneSet(first, doneSet('b')), doneSet('a', {nickname: '다시'}));

  assert.deepEqual(list.map(set => set.spaceId), ['a', 'b']);
  assert.equal(list[0].nickname, '다시');
});

test('10벌이 찬 뒤 새 스페이스를 더하면 가장 오래된 세트만 밀려난다', () => {
  const full = Array.from({length: DONE_MAX}, (_, index) => `s${index}`)
    .reduce((done, spaceId) => insertDoneSet(done, doneSet(spaceId)), []);

  assert.equal(doneSetToEvict(full, 'new-space')?.spaceId, 's0');
  assert.equal(doneSetToEvict(full, 's4'), null, '같은 스페이스 재응답은 새 칸을 차지하지 않는다');
  assert.equal(doneSetToEvict(full.slice(0, -1), 'new-space'), null, '빈 칸이 있으면 밀려나지 않는다');

  const inserted = insertDoneSet(full, doneSet('new-space'));
  assert.equal(inserted.length, DONE_MAX);
  assert.equal(inserted[0].spaceId, 'new-space');
  assert.equal(inserted.some(set => set.spaceId === 's0'), false);
});

test('다 풀면 진행 중인 한 벌은 완료 세트로 옮겨간다', () => {
  stubStorage();
  saveDraft({
    spaceId: 'a', spaceName: 'A', nickname: '뚱이', answers: answered(2), page: 5, updatedAt: 1
  });
  saveDoneSet(doneSet('a'));

  const store = loadStore();
  assert.equal(store.draft, null, '이어할 것이 남아 있으면 안 된다');
  assert.equal(store.done.length, 1);
  assert.equal(store.done[0].answers.length, Q.length);
});

test('다른 스페이스에서 결과를 내도 저쪽에서 풀던 한 벌은 살아남는다', () => {
  stubStorage();
  const mid = {
    spaceId: 'a', spaceName: 'A', nickname: '뚱이',
    answers: answered(0).map((_, i) => (i < 30 ? 4 : 0)), page: 2, updatedAt: 1
  };
  saveDraft(mid);

  // A에서 30문항까지 풀어둔 채 B에 들어가 예전 응답을 재사용해 제출했다.
  saveDoneSet(doneSet('b'));

  const {draft, done} = loadStore();
  assert.equal(draft?.spaceId, 'a', 'B에서 결과를 냈다고 A가 사라질 이유가 없다');
  assert.equal(draft?.answers.filter(Boolean).length, 30);
  assert.deepEqual(done.map(set => set.spaceId), ['b']);
});

test('완료 세트를 지우면 그 스페이스만 빠지고 나머지는 남는다', () => {
  stubStorage();
  saveDoneSet(doneSet('a'));
  saveDoneSet(doneSet('b'));

  deleteDoneSet('a');

  assert.deepEqual(loadStore().done.map(set => set.spaceId), ['b']);
});

test('저장소가 없거나 깨져 있어도 빈 보관소로 읽는다', () => {
  const box = stubStorage();
  assert.deepEqual(loadStore(), {draft: null, done: []});

  box.set('dogtype:answers:v1', '{절대 JSON이');
  assert.deepEqual(loadStore(), {draft: null, done: []});

  globalThis.localStorage = {
    getItem() { throw new Error('시크릿 모드'); },
    setItem() { throw new Error('시크릿 모드'); },
    removeItem() {}
  };
  assert.deepEqual(loadStore(), {draft: null, done: []});
  assert.doesNotThrow(() => saveDoneSet(doneSet('a')), '저장을 못 해도 설문은 진행돼야 한다');
});

test('손을 탄 값은 걸러낸다', () => {
  // 빈칸이 있는 완료 세트는 재사용해도 결과가 안 나온다.
  assert.deepEqual(sanitizeStore({done: [doneSet('a', {answers: answered(0)})]}).done, []);
  // 문항 수가 다른 응답은 지금 문항지의 것이 아니다.
  assert.deepEqual(sanitizeStore({done: [doneSet('a', {answers: [1, 2, 3]})]}).done, []);
  // 없는 유형.
  assert.deepEqual(sanitizeStore({done: [doneSet('a', {primary: 'Z'})]}).done, []);
  // 척도를 벗어난 값은 미응답으로 떨어지고, 그러면 완료 세트가 아니다.
  assert.deepEqual(sanitizeStore({done: [doneSet('a', {answers: answered(9)})]}).done, []);

  assert.deepEqual(sanitizeStore(null), {draft: null, done: []});
  assert.deepEqual(sanitizeStore({done: 'nope', draft: 7}), {draft: null, done: []});

  // 페이지 번호는 문항지 밖으로 나갈 수 없다.
  const wild = sanitizeStore({
    draft: {spaceId: 'a', nickname: '뚱이', answers: answered(1), page: 99, updatedAt: 1}
  });
  assert.equal(wild.draft?.page, Math.ceil(Q.length / 10) - 1);
  assert.equal(wild.draft?.spaceName, 'a', '이름을 안 넣고 저장한 예전 값은 코드로 보여준다');

  // 상한을 넘겨 저장된 값이 들어와도 상한까지만 읽는다.
  const ids = Array.from({length: DONE_MAX + 3}, (_, index) => `s${index}`);
  const many = sanitizeStore({done: ids.map(id => doneSet(id))});
  assert.deepEqual(many.done.map(set => set.spaceId), ids.slice(0, DONE_MAX));
});

test('목록에 붙는 시각은 최근일수록 짧게 읽힌다', () => {
  const now = Date.UTC(2026, 6, 16, 12, 0, 0);
  const ago = ms => formatWhen(now - ms, now);

  assert.equal(ago(30_000), '방금');
  assert.equal(ago(5 * 60_000), '5분 전');
  assert.equal(ago(3 * 3_600_000), '3시간 전');
  assert.equal(ago(30 * 3_600_000), '어제');
  assert.equal(ago(4 * 86_400_000), '4일 전');
  assert.match(ago(40 * 86_400_000), /월/);
});
