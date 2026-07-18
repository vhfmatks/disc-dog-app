import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  isSpaceId, parseRoute, spaceMapShareUrl, spacePasswordUrl, spaceShareUrl,
  spaceTogetherMapUrl, stripPasswordGateFromUrl
} from '../src/lib/router.ts';
import {readShareTokenFromUrl, stripShareTokenFromUrl} from '../src/lib/access.ts';
import {
  DEFAULT_SPACE_ICON_ID as SERVER_DEFAULT_SPACE_ICON_ID,
  NAME_MAX as SERVER_NAME_MAX, NICKNAME_MAX as SERVER_NICKNAME_MAX,
  PASSWORD_MAX as SERVER_PASSWORD_MAX,
  PASSWORD_MIN as SERVER_PASSWORD_MIN, PUBLIC_SPACE_COLUMNS,
  SPACE_ICON_IDS as SERVER_SPACE_ICON_IDS,
  classifySpaceUniqueViolation, hashPassword, isNicknameUniqueViolation,
  isResultIdUniqueViolation, randomSpaceId, validSpaceIconId, validSpaceId,
  verifyPassword
} from '../supabase/functions/_shared/spaces.ts';
import {
  SPACE_NAME_MAX, SPACE_PASSWORD_MAX, SPACE_PASSWORD_MIN,
  validatePasswordConfirmation, validateSpaceName, validateSpacePassword
} from '../src/lib/space-rules.ts';
import {
  DEFAULT_SPACE_ICON_ID, SPACE_ICONS, isSpaceIconId
} from '../src/lib/space-icons.ts';
import {NICKNAME_MAX, validateNickname} from '../src/lib/nickname-rules.ts';

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

test('홈에서 고른 스페이스는 저장된 출입증과 별개로 비밀번호 게이트를 거친다', () => {
  stubWindow('https://x.io/app/');
  const url = spacePasswordUrl('hazel-corgi-427');

  assert.equal(url, 'https://x.io/app/hazel-corgi-427?gate=password');
  assert.deepEqual(parseRoute(new URL(url)), {
    kind: 'participant', spaceId: 'hazel-corgi-427', passwordRequired: true
  });

  stubWindow(url);
  stripPasswordGateFromUrl();
  assert.equal(window.location.href, 'https://x.io/app/hazel-corgi-427');
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

test('서버는 정해진 20종 스페이스 아이콘만 저장한다', () => {
  const clientIds = SPACE_ICONS.map(icon => icon.id);
  assert.equal(SERVER_SPACE_ICON_IDS.length, 20);
  assert.deepEqual(clientIds, [...SERVER_SPACE_ICON_IDS]);
  assert.equal(DEFAULT_SPACE_ICON_ID, SERVER_DEFAULT_SPACE_ICON_ID);
  assert.ok(validSpaceIconId(SERVER_DEFAULT_SPACE_ICON_ID));
  assert.ok(isSpaceIconId(DEFAULT_SPACE_ICON_ID));
  assert.equal(new Set(SERVER_SPACE_ICON_IDS).size, SERVER_SPACE_ICON_IDS.length);
  assert.equal(validSpaceIconId('jindo'), false);
  assert.equal(validSpaceIconId('border-collie'), false);
  assert.equal(validSpaceIconId('unknown-dog'), false);
});

test('20종 스페이스 아이콘은 각자 SVG 그림과 접근성 계약을 가진다', async () => {
  const component = await readFile(new URL('../src/components/SpaceIcon.tsx', import.meta.url), 'utf8');

  for (const {id} of SPACE_ICONS) {
    assert.match(component, new RegExp(`case ['"]${id}['"]:`), `${id} 그림이 없음`);
  }
  assert.match(component, /viewBox="0 0 64 64"/);
  assert.match(component, /aria-label=/);
  assert.match(component, /aria-hidden=/);
  assert.match(component, /data-space-icon=/);
});

test('대표 강아지는 낮은 가로 스크롤 목록에서 탐색하고 선택한다', async () => {
  const [main, css] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../assets/style.css', import.meta.url), 'utf8')
  ]);
  const pickerCss = css.slice(css.indexOf('.space-icon-options'), css.indexOf('.share-box'));

  assert.match(main, /대표 강아지 아이콘 목록/);
  assert.match(main, /좌우로 밀어 둘러본 뒤/);
  assert.match(main, /className="wrap home-wrap create-wrap"/);
  assert.match(css, /\.create-wrap\s*\{\s*padding-top:\s*20px/);
  assert.match(pickerCss, /display:\s*flex/);
  assert.match(pickerCss, /overflow-x:\s*auto/);
  assert.match(pickerCss, /scroll-snap-type:\s*x proximity/);
  assert.match(pickerCss, /flex:\s*0 0 88px/);
});

test('홈은 활성 스페이스부터 보여주고 입장·생성은 햄버거 메뉴가 맡는다', async () => {
  const [main, header] = await Promise.all([
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/AppHeader.tsx', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(main, /home-space-id|어느 스페이스로 갈까요/);
  assert.match(main, /<main className="wrap home-wrap home-with-spaces">\s*<section className="active-spaces"/);
  assert.match(header, /id="menu-space-code"/);
  assert.match(header, /window\.location\.assign\(spacePasswordUrl\(entryCode\)\)/);
  assert.match(header, /label: '새 스페이스 만들기'/);
});

test('닉네임이 중복이면 시작을 막고 해당 스페이스 결과 링크를 보여준다', async () => {
  const participant = await readFile(new URL('../src/ParticipantApp.tsx', import.meta.url), 'utf8');

  assert.match(participant, /disabled=\{!ready \|\| checking \|\| duplicate\}/);
  assert.match(participant, /\{duplicate && \(/);
  assert.match(participant, /href=\{spaceMapUrl\(space\.id\)\}/);
  assert.match(participant, /작성한 결과 보러가기/);
});

test('활성 스페이스 목록은 잠긴 방만 최근 활동순으로 집계하고 비밀값을 반환하지 않는다', async () => {
  // 만료가 사라졌으므로 "활성"의 판정을 expires_at이 아니라 created_at 창으로 한다.
  // 이 함수의 최종 정의는 7_persist_results에 있다.
  const migration = await readFile(new URL(
    '../prisma/migrations/7_persist_results/migration.sql', import.meta.url
  ), 'utf8');
  const returns = migration.slice(migration.indexOf('returns table'), migration.indexOf('language sql'));

  assert.match(migration, /having max\(r\.created_at\) > now\(\) - interval '24 hours'/);
  assert.doesNotMatch(migration, /r\.expires_at/);
  assert.match(migration, /s\.password_hash is not null/);
  assert.match(migration, /count\(r\.id\)::integer as participant_count/);
  assert.match(migration, /max\(r\.created_at\) as last_activity_at/);
  assert.match(PUBLIC_SPACE_COLUMNS, /icon_id/);
  assert.doesNotMatch(PUBLIC_SPACE_COLUMNS, /password_hash|share_token|manage_token/);
  assert.doesNotMatch(returns, /password_hash|share_token|nickname/);
});

test('활성 스페이스 목록은 안정된 순서로 페이지 조회하고 다음 페이지 여부만 공개한다', async () => {
  const [migration, spacesFunction, db, main] = await Promise.all([
    readFile(new URL('../prisma/migrations/10_active_space_pagination/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/spaces/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(migration, /p_offset integer default 0/);
  assert.match(migration, /order by max\(r\.created_at\) desc, count\(r\.id\) desc, s\.created_at desc, s\.id asc/);
  assert.match(migration, /offset greatest\(0, least\(coalesce\(p_offset, 0\), 10000\)\)/);
  assert.match(spacesFunction, /p_limit: ACTIVE_SPACE_LIMIT \+ 1/);
  assert.match(spacesFunction, /p_offset: page \* ACTIVE_SPACE_LIMIT/);
  assert.match(spacesFunction, /hasMore: rows\.length > ACTIVE_SPACE_LIMIT/);
  assert.match(db, /fetchActiveSpaces\(page = 0\)/);
  assert.match(main, /fetchActiveSpaces\(nextPage\)/);
  assert.match(main, /더 보기/);
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

test('한 번 예약한 경로 이름은 스페이스 코드로 되돌려주지 않는다', () => {
  // 'manage'는 진행자 화면이 있던 시절의 예약어다. 그 화면은 지도 아래로 들어와
  // 사라졌지만, 목록에서 빼면 예전에 만들어진 코드가 스페이스 ID로 되살아나 라우팅이
  // 갈린다. router와 _shared 두 곳에 손으로 적힌 목록이라 함께 고정한다.
  for (const reserved of ['admin', 'manage', 'map', 'new', 'profile']) {
    assert.equal(isSpaceId(reserved), false, `프런트가 허용함: ${reserved}`);
    assert.equal(validSpaceId(reserved), false, `서버가 허용함: ${reserved}`);
  }
});

test('관리 링크(#m=)는 더 이상 없다 — 비밀번호가 그 자리를 대신한다', async () => {
  const [access, router] = await Promise.all([
    readFile(new URL('../src/lib/access.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/router.ts', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(access, /manage|#m=/i);
  assert.doesNotMatch(router, /spaceManageUrl|spaceManageShareUrl/);
  // /manage 라우트도 사라졌다.
  assert.deepEqual(parseRoute(new URL('https://x.io/app/hazel-corgi-427/manage')), {kind: 'home'});
});

test('비밀번호는 브라우저에 영구 저장되지 않는다', async () => {
  // 공유를 다루는 동안만 세션에 머문다. 프로젝터에 띄워둔 브라우저의 localStorage에
  // 스페이스 비밀번호가 남으면 그 자체가 유출이다.
  const share = await readFile(new URL('../src/components/ShareSpaces.tsx', import.meta.url), 'utf8');

  assert.match(share, /sessionStorage/);
  assert.doesNotMatch(share, /localStorage\.setItem/);
});

test('함께보기 주소는 고른 스페이스를 쿼리에 싣는다', () => {
  stubWindow('https://x.io/app/b-space/map');

  // 북마크·공유가 되어야 하므로 프래그먼트가 아니라 쿼리다. 권한이 아니라 화면 상태다.
  assert.equal(
    spaceTogetherMapUrl('b-space', ['a-space', 'c-space']),
    'https://x.io/app/b-space/map?with=a-space%2Cc-space'
  );
  assert.equal(spaceTogetherMapUrl('b-space', []), 'https://x.io/app/b-space/map');
});

test('서버와 프런트의 닉네임 길이 규칙이 어긋나지 않는다', () => {
  assert.equal(NICKNAME_MAX, SERVER_NICKNAME_MAX);
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
