#!/usr/bin/env node
// SPEC § 10 — 문항 균형 검증. 문항을 고쳤으면 반드시 통과해야 한다.
// 기대값: 유형별 매력(+) 10개 / 짖음(-) 5개, 중복 0, 총 60.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(ROOT, 'assets/data.ts'), 'utf8');
const m = [...src.matchAll(/\{t:'([DISC])',p:\s*(-?1),x:'([^']+)'\}/g)];

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

check(m.length === 60, `문항 수 ${m.length} != 60`);

const counts = {};
for (const [, t, p] of m) {
  const k = t + (p === '1' ? '+' : '-');
  counts[k] = (counts[k] || 0) + 1;
}
for (const k of ['D+', 'D-', 'I+', 'I-', 'S+', 'S-', 'C+', 'C-']) {
  const expected = k.endsWith('+') ? 10 : 5;
  check(counts[k] === expected, `${k} = ${counts[k] || 0} != ${expected}`);
}

check(new Set(m.map(x => x[3])).size === m.length, '중복 문항 존재');

// 페이지별 유형 분포 — 한 유형이 몰리면 규칙성이 드러난다 (SPEC § 4.2).
for (let page = 0; page < 6; page++) {
  const slice = m.slice(page * 10, page * 10 + 10);
  const dist = {};
  for (const [, t] of slice) dist[t] = (dist[t] || 0) + 1;
  const shape = Object.values(dist).sort((a, b) => b - a).join('-');
  check(Object.keys(dist).length === 4 && dist.D <= 3 && dist.I <= 3 && dist.S <= 3 && dist.C <= 3,
    `Page ${page + 1} 유형 분포 편중: ${JSON.stringify(dist)} (${shape})`);

  const positive = slice.filter(([, , p]) => p === '1').length;
  check(positive >= 6 && positive <= 7,
    `Page ${page + 1} 매력/짖음 분포 편중: +${positive} / -${10 - positive}`);
}

// 검사가 끝날 때까지 "DISC"가 화면에 보이면 안 된다 (SPEC § 12).
const qText = m.map(x => x[3]).join(' ');
check(!/DISC/i.test(qText), '문항 텍스트에 "DISC"가 노출됨');

if (errors.length) {
  console.error('\n  ✗ 문항 검증 실패');
  for (const e of errors) console.error('    · ' + e);
  console.error('');
  process.exit(1);
}

console.log('  ✓ 문항 검증 통과', JSON.stringify(counts));
