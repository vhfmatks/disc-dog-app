import assert from 'node:assert/strict';
import test from 'node:test';
import {isSpaceId, parseRoute, spaceMapShareUrl, spaceShareUrl} from '../src/lib/router.ts';
import {readShareTokenFromUrl, stripShareTokenFromUrl} from '../src/lib/access.ts';
import {
  NAME_MAX as SERVER_NAME_MAX, PASSWORD_MAX as SERVER_PASSWORD_MAX,
  PASSWORD_MIN as SERVER_PASSWORD_MIN, classifySpaceUniqueViolation, hashPassword,
  randomSpaceId, validSpaceId, verifyPassword
} from '../supabase/functions/_shared/spaces.ts';
import {
  SPACE_NAME_MAX, SPACE_PASSWORD_MAX, SPACE_PASSWORD_MIN,
  validatePasswordConfirmation, validateSpaceName, validateSpacePassword
} from '../src/lib/space-rules.ts';
import {
  NICKNAME_MAX, isNicknameUniqueViolation, isResultIdUniqueViolation, validateNickname
} from '../src/lib/nickname-rules.ts';

/** router/access는 window.location과 history만 본다. 딱 그만큼만 흉내낸다. */
function stubWindow(href) {
  const location = new URL(href);
  globalThis.window = {
    location,
    history: {
      replaceState(_state, _title, next) {
        const updated = new URL(next, location.origin);
        location.href = updated.href;
      }
    }
  };
  return location;
}

test('스페이스 주소를 화면별로 갈라 읽는다', () => {
  const at = href => parseRoute(new URL(href));

  assert.deepEqual(at('https://x.io/app/'), {kind: 'home'});
  assert.deepEqual(at('https://x.io/app/new'), {kind: 'create'});
  assert.deepEqual(at('https://x.io/app/admin'), {kind: 'admin'});
  assert.deepEqual(at('https://x.io/app/hazel-corgi-427'), {kind: 'participant', spaceId: 'hazel-corgi-427'});
  assert.deepEqual(at('https://x.io/app/hazel-corgi-427/map'), {kind: 'map', spaceId: 'hazel-corgi-427'});
});

test('공유 링크의 #k= 토큰은 라우팅을 바꾸지 않는다', () => {
  assert.deepEqual(
    parseRoute(new URL('https://x.io/app/hazel-corgi-427#k=0123456789abcdef')),
    {kind: 'participant', spaceId: 'hazel-corgi-427'}
  );
  // 예전에 배포된 해시 링크는 계속 열려야 한다.
  assert.deepEqual(parseRoute(new URL('https://x.io/app/#/?r=demo')), {kind: 'participant', spaceId: 'demo'});
  assert.deepEqual(parseRoute(new URL('https://x.io/app/#/map?r=demo')), {kind: 'map', spaceId: 'demo'});
});

test('초대 링크를 만들고 다시 읽으면 같은 스페이스와 토큰이 나온다', () => {
  stubWindow('https://x.io/app/new');
  const url = spaceShareUrl('hazel-corgi-427', '0123456789abcdef');
  // GitHub Pages의 루트(index.html, HTTP 200)를 바로 열어야
  // 카카오톡·Slack 크롤러가 OG 메타데이터를 안정적으로 읽는다.
  assert.equal(url, 'https://x.io/app/?r=hazel-corgi-427#k=0123456789abcdef');

  stubWindow(url);
  assert.deepEqual(parseRoute(window.location), {kind: 'participant', spaceId: 'hazel-corgi-427'});
  assert.equal(readShareTokenFromUrl(), '0123456789abcdef');
});

test('관리자의 진행자 화면 링크는 지도로 가면서 출입증을 함께 싣는다', () => {
  stubWindow('https://x.io/app/admin');
  const url = spaceMapShareUrl('hazel-corgi-427', '0123456789abcdef');
  assert.equal(url, 'https://x.io/app/hazel-corgi-427/map#k=0123456789abcdef');

  // 이 링크 하나로 게이트를 지나야 한다 — 관리자는 스페이스 비밀번호를 모른다.
  stubWindow(url);
  assert.deepEqual(parseRoute(window.location), {kind: 'map', spaceId: 'hazel-corgi-427'});
  assert.equal(readShareTokenFromUrl(), '0123456789abcdef');
});

test('미리보기 용도의 스페이스 코드는 토큰을 지운 뒤에도 남는다', () => {
  stubWindow('https://x.io/app/?r=hazel-corgi-427#k=0123456789abcdef');

  stripShareTokenFromUrl();

  assert.equal(window.location.href, 'https://x.io/app/?r=hazel-corgi-427');
  assert.deepEqual(parseRoute(window.location), {kind: 'participant', spaceId: 'hazel-corgi-427'});
});

test('토큰을 챙긴 뒤에는 주소창에서 지운다', () => {
  stubWindow('https://x.io/app/hazel-corgi-427#k=0123456789abcdef');
  assert.equal(readShareTokenFromUrl(), '0123456789abcdef');

  stripShareTokenFromUrl();

  assert.equal(window.location.hash, '');
  assert.equal(window.location.pathname, '/app/hazel-corgi-427');
  assert.equal(readShareTokenFromUrl(), '');
});

test('토큰이 없는 주소에서는 빈 문자열을 준다', () => {
  stubWindow('https://x.io/app/hazel-corgi-427');
  assert.equal(readShareTokenFromUrl(), '');
  stubWindow('https://x.io/app/hazel-corgi-427#k=short');   // 8자 미만
  assert.equal(readShareTokenFromUrl(), '');
});

test('자동 생성한 입장 코드는 언제나 라우팅 가능한 형식이다', () => {
  for (let round = 0; round < 300; round += 1) {
    const id = randomSpaceId();
    assert.ok(validSpaceId(id), `서버가 거부하는 코드: ${id}`);
    assert.ok(isSpaceId(id), `프런트가 거부하는 코드: ${id}`);
  }
});

test('프런트(router)와 서버(_shared)의 코드 규칙이 어긋나지 않는다', () => {
  const samples = [
    'admin', 'map', 'new', 'demo', 'hazel-corgi-427', 'design-team',
    'ab', '', 'a'.repeat(24), 'a'.repeat(25), 'Bad-Case', 'x_y', '한글', 'has space'
  ];
  for (const value of samples) {
    assert.equal(isSpaceId(value), validSpaceId(value), `규칙이 갈림: ${value}`);
  }
});

test('스페이스 생성 필드 규칙과 사용자 오류 코드를 고정한다', () => {
  assert.equal(SPACE_NAME_MAX, SERVER_NAME_MAX);
  assert.equal(SPACE_PASSWORD_MIN, SERVER_PASSWORD_MIN);
  assert.equal(SPACE_PASSWORD_MAX, SERVER_PASSWORD_MAX);
  assert.deepEqual(validateSpaceName('   '), {
    code: 'SPACE_NAME_REQUIRED', message: '스페이스 이름을 입력해주세요.'
  });
  assert.equal(validateSpaceName('가'.repeat(SPACE_NAME_MAX)), null);
  assert.equal(validateSpaceName('가'.repeat(SPACE_NAME_MAX + 1))?.code, 'SPACE_NAME_TOO_LONG');
  assert.equal(validateSpacePassword('a'.repeat(SPACE_PASSWORD_MIN - 1))?.code, 'PASSWORD_TOO_SHORT');
  assert.equal(validateSpacePassword('a'.repeat(SPACE_PASSWORD_MAX + 1))?.code, 'PASSWORD_TOO_LONG');
  assert.equal(validateSpacePassword('', true), null);
  assert.equal(validatePasswordConfirmation('abcdef', 'abcdeg')?.code, 'PASSWORD_CONFIRM_MISMATCH');
});

test('DB unique 충돌을 스페이스 코드와 이름으로 구분한다', () => {
  assert.equal(classifySpaceUniqueViolation({
    code: '23505', message: 'duplicate key value violates unique constraint "spaces_name_key"'
  }), 'name');
  assert.equal(classifySpaceUniqueViolation({
    code: '23505', details: 'Key (id)=(demo) already exists.'
  }), 'id');
  assert.equal(classifySpaceUniqueViolation({code: '42501', message: 'permission denied'}), 'other');
});

test('닉네임 규칙과 스페이스 범위 unique 오류 코드를 고정한다', () => {
  assert.deepEqual(validateNickname('   '), {
    code: 'NICKNAME_REQUIRED', message: '닉네임을 입력해주세요.'
  });
  assert.equal(validateNickname('가'.repeat(NICKNAME_MAX)), null);
  assert.equal(validateNickname('가'.repeat(NICKNAME_MAX + 1))?.code, 'NICKNAME_TOO_LONG');
  assert.equal(isNicknameUniqueViolation({
    code: '23505', message: 'duplicate key violates unique constraint "results_room_nickname_key"'
  }), true);
  assert.equal(isNicknameUniqueViolation({
    code: '23505', details: 'Key (room, nickname)=(demo, 뚱이) already exists.'
  }), true);
  assert.equal(isNicknameUniqueViolation({code: '23505', message: 'results_pkey'}), false);
  assert.equal(isResultIdUniqueViolation({
    code: '23505', details: 'Key (id)=(00000000-0000-0000-0000-000000000001) already exists.'
  }), true);
  assert.equal(isResultIdUniqueViolation({code: '23505', message: 'results_room_nickname_key'}), false);
});

test('비밀번호는 PBKDF2로 저장되고 원문은 남지 않는다', async () => {
  const stored = await hashPassword('열려라참깨');

  assert.match(stored, /^pbkdf2-sha256\$210000\$/);
  assert.ok(!stored.includes('열려라참깨'));
  assert.equal(await verifyPassword('열려라참깨', stored), true);
  assert.equal(await verifyPassword('열려라참께', stored), false);
});

test('같은 비밀번호라도 salt가 달라 해시는 매번 달라진다', async () => {
  const [first, second] = await Promise.all([hashPassword('open-sesame'), hashPassword('open-sesame')]);

  assert.notEqual(first, second);
  assert.equal(await verifyPassword('open-sesame', first), true);
  assert.equal(await verifyPassword('open-sesame', second), true);
});

test('깨졌거나 약한 해시는 통과시키지 않는다', async () => {
  const bad = [
    '',
    'nonsense',
    'pbkdf2-sha256$210000$$',
    'md5$210000$YQ==$YQ==',
    'pbkdf2-sha256$1$YQ==$YQ==',          // 반복 횟수가 하한 미만
    'pbkdf2-sha256$210000$!!!$!!!'        // base64가 아님
  ];
  for (const stored of bad) {
    assert.equal(await verifyPassword('anything', stored), false, `통과해버림: ${stored}`);
  }
});
