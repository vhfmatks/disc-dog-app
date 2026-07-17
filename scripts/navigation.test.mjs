import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import test from 'node:test';

test('일반 사용자 내비게이션에는 관리자 진입 링크가 없다', async () => {
  const [header, main] = await Promise.all([
    readFile(new URL('../src/components/AppHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(header, /adminUrl|label:\s*['"]관리자['"]/);
  assert.doesNotMatch(main, /href=\{adminUrl\(\)\}/);
});

test('지도 도구에는 확대 버튼 그룹이 없다', async () => {
  const map = await readFile(new URL('../src/MapApp.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(map, /className="map-zoom"|aria-label="지도 확대"/);
  assert.match(map, /aria-label="관계선 종류"/);
});

test('발자국 아래에는 닉네임만 쓰고, 스페이스는 색이 말한다', async () => {
  const map = await readFile(new URL('../src/MapApp.tsx', import.meta.url), 'utf8');

  // 스페이스 이름까지 붙이면 라벨이 서로 밀어내 지도가 글자밭이 된다.
  assert.match(map, /<text className="node-label"[^>]*>\{row\.nickname\}<\/text>/);

  // 대신 테두리 색이 어느 스페이스인지 말한다.
  assert.match(map, /className="node-source-ring"[^/]*stroke=\{sourceColor\}/);

  // ⚠ 색은 눈으로 읽는 사람에게만 말한다. 스크린리더에는 이름을 그대로 줘야 한다 —
  //   여기서 spaceName을 빼면 밖에서 온 사람인지 알 방법이 아예 없어진다.
  assert.match(map, /aria-label=\{[\s\S]{0,80}foreign \? `\$\{spaceName\} 스페이스의 `/);
});

test('관리 토큰의 흔적이 코드베이스에 남아 있지 않다', async () => {
  // 비밀번호가 그 자리를 대신하면서 통째로 사라졌다. 반쯤 남으면 다음 사람이
  // "관리 링크가 어디 있지"를 찾아 헤맨다.
  const sources = await readdir(new URL('../src', import.meta.url), {recursive: true});
  const files = [
    ...sources.filter(name => /\.(ts|tsx)$/.test(name)).map(name => `src/${name}`),
    'supabase/functions/_shared/spaces.ts',
    'supabase/functions/spaces/index.ts',
    'supabase/functions/space-views/index.ts',
    'supabase/functions/admin-spaces/index.ts'
  ];

  for (const file of files) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /manageToken|manage_token_hash|randomManageToken|verifyManageToken/,
      `${file}에 관리 토큰이 남아 있음`);
  }
});

test('공유는 지도만 넘긴다 — 상대가 우리 설문에 발자국을 찍을 수는 없다', async () => {
  // 사용자가 못박은 계약이다. 공유했다고 저쪽 사람이 우리 스페이스에서 닉네임을 만들고
  // DISC 검사를 해서 발자국을 남길 수는 없다. 그러려면 우리 초대 링크나 비밀번호가
  // 있어야 하고, 공유는 그 둘 중 어느 것도 주지 않는다.
  const [views, spaces] = await Promise.all([
    readFile(new URL('../supabase/functions/space-views/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/functions/spaces/index.ts', import.meta.url), 'utf8')
  ]);

  // space-views는 읽기만 한다 — results를 쓰는 코드가 없다.
  assert.doesNotMatch(views, /\.from\('results'\)[\s\S]{0,80}\.(insert|update|delete)/);
  // 결과를 쓰는 유일한 곳은 spaces.save-result이고, 그 문은 그 스페이스의 출입증만 연다.
  assert.match(spaces, /async function saveResult[\s\S]{0,400}await authorize\(client, id, String\(input\.token/);
  assert.match(spaces, /async function checkNicknameAction[\s\S]{0,400}await authorize\(client, id, String\(input\.token/);

  // 비밀값이 응답으로 새지 않는다. share_token·password_hash가 나오는 자리를 전부
  // 못박는다 — 타입 선언, 조회 컬럼, 그리고 대조하는 그 한 줄뿐이어야 한다.
  const allowed = [
    /^\s*(share_token|password_hash): string(\s*\| null)?;$/,      // 타입 선언
    /select\('id,name,icon_id,password_hash,share_token'\)/,        // 서버가 읽는 컬럼
    /sameSecret\(hostToken, host\.share_token\)/,                   // 출입증 대조
    // 비밀번호 대조와 "열린 방인가" 판정. 값을 밖으로 내보내는 자리가 아니다.
    /verifyPassword\(password, space\.password_hash\)/,
    /space\?\.password_hash|host\.password_hash|partner\.password_hash|authorized\.space\.password_hash/,
    /\.not\('password_hash', 'is', null\)/,                         // 열린 방 제외
    /^\s*\/\//                                                       // 주석
  ];
  for (const line of views.split('\n')) {
    if (!/share_token|password_hash/.test(line)) continue;
    assert.ok(
      allowed.some(pattern => pattern.test(line)),
      `space-views에서 비밀값이 예상 밖의 자리에 쓰임: ${line.trim()}`
    );
  }

  // 브라우저에 내려가는 스페이스 요약은 세 컬럼뿐이다.
  assert.match(views, /const summary = \(space[^)]*\): SpaceSummary =>\s*\(\{id: space\.id, name: space\.name, icon_id: space\.icon_id\}\)/);
});

test('지도는 서버가 판정한 결과만 그리고, 실시간 구독은 남아 있지 않다', async () => {
  const map = await readFile(new URL('../src/MapApp.tsx', import.meta.url), 'utf8');

  // anon의 results 권한이 사라지면서 postgres_changes는 조용히 아무것도 주지 않는다.
  assert.doesNotMatch(map, /watchRoom|postgres_changes|실시간 연결됨/);
  assert.match(map, /fetchMapResults/);
  // 권한이 끝난 스페이스를 화면에서 빼려면 매번 갈아끼워야 한다. 누적하면 남는다.
  assert.doesNotMatch(map, /addRows/);
});

test('브라우저는 결과 테이블을 직접 만지지 않는다', async () => {
  const db = await readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8');

  // supabase-js가 db.ts에서 사라졌다 = anon 키로 테이블을 두드릴 길이 없다.
  assert.doesNotMatch(db, /import .*@supabase\/supabase-js/);
  assert.doesNotMatch(db, /\.from\(['"]results['"]\)|createClient/);
});
