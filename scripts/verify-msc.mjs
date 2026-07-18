#!/usr/bin/env node
// MSC 문항 균형 검증. 문항을 고쳤으면 반드시 통과해야 한다.
// 기대: 유형별 6 · env 6 · phys 6 · lead 8 · soc 8 · task 6 · 총 82 · 중복 0 · 힌트 0.
//
// data.ts는 import가 없어 --experimental-strip-types로 바로 불러올 수 있다.
// (package.json의 verify가 이 플래그로 실행한다.)

import {MSC_Q, MSC_ORDER} from '../src/tests/msc/data.ts';

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const byScale = scale => MSC_Q.filter(q => q.k === scale);
const typeQ = byScale('type');

check(MSC_Q.length === 82, `문항 수 ${MSC_Q.length} != 82`);
for (const code of MSC_ORDER) {
  const n = typeQ.filter(q => q.t === code).length;
  check(n === 6, `${code} = ${n} != 6`);
}
for (const [scale, expected] of [['env', 6], ['phys', 6], ['lead', 8], ['soc', 8], ['task', 6]]) {
  check(byScale(scale).length === expected, `${scale} = ${byScale(scale).length} != ${expected}`);
}

const texts = MSC_Q.map(q => q.x);
check(new Set(texts).size === texts.length, '중복 문항 존재');

// 검사가 끝날 때까지 유형·지표·검사 힌트가 문항에 보이면 안 된다.
const banned = [
  '직관', '분석', '논리', '전략', '소통', '통합', '창의', '예술',
  '완벽', '좌뇌', '우뇌', '뇌', '유형', 'DISC', 'MSC'
];
for (const t of texts) {
  for (const w of banned) check(!t.includes(w), `힌트 노출("${w}"): ${t}`);
}

if (errors.length) {
  console.error('\n  ✗ MSC 문항 검증 실패');
  for (const e of errors) console.error('    · ' + e);
  console.error('');
  process.exit(1);
}

console.log('  ✓ MSC 문항 검증 통과',
  `type ${typeQ.length} / env ${byScale('env').length} / phys ${byScale('phys').length}`
  + ` / lead ${byScale('lead').length} / soc ${byScale('soc').length} / task ${byScale('task').length}`);
