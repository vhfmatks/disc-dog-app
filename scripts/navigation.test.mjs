import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('일반 사용자 내비게이션에는 관리자 진입 링크가 없다', async () => {
  const [header, main] = await Promise.all([
    readFile(new URL('../src/components/AppHeader.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  ]);

  assert.doesNotMatch(header, /adminUrl|label:\s*['"]관리자['"]/);
  assert.doesNotMatch(main, /href=\{adminUrl\(\)\}/);
});
