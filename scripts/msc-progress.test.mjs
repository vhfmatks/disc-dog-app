import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

test('MSC 진행률은 발바닥 대신 반짝이 아이콘과 전용 상태 스타일을 쓴다', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/tests/msc/MscApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../assets/style.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /msc-progress-icons/);
  assert.match(app, /✨/);
  assert.doesNotMatch(app, /pawPath/);
  assert.match(css, /\.msc-progress-icon\.done/);
  assert.match(css, /\.msc-progress-icon\.todo/);
});
