import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('두 검사는 링크 공유 안내에서 참여 방식이 구분된다', async () => {
  const [msc, main] = await Promise.all([
    readFile(new URL('../src/tests/msc/MscApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(msc, /뇌인지유형맵 링크/);
  assert.match(msc, /개인형 링크/);
  assert.match(msc, /자동으로 합쳐지지 않습니다/);
  assert.match(main, /개성 스페이스 초대 링크/);
  assert.match(main, /같은 스페이스에 참여/);
  assert.match(main, /관계도에 함께 표시/);
});
