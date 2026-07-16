#!/usr/bin/env node
// .env (또는 프로세스 환경변수) → src/config.js 생성.
// Vite가 이 모듈을 브라우저 번들에 포함한다. anon 키는 공개 키이며 RLS가 방어선이다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const OUT_PATH = resolve(ROOT, 'src/config.js');

function parseEnv(text) {
  const out = {};
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/s.test(val)) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function fail(msg) {
  console.error('\n  ✗ ' + msg + '\n');
  process.exit(1);
}

const fileEnv = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, 'utf8')) : {};
// 프로세스 환경변수가 우선 — GitHub Actions는 secrets를 이쪽으로 주입한다.
const url = (process.env.SUPABASE_URL || fileEnv.SUPABASE_URL || '').trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || '').trim();

if (!url || !anonKey || url.includes('YOUR-PROJECT-REF') || anonKey.includes('YOUR-ANON')) {
  fail(
    'SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.\n' +
    '    로컬:   cp .env.example .env  →  값 채우기  →  npm run config\n' +
    '    Actions: 저장소 Secrets 에 SUPABASE_URL / SUPABASE_ANON_KEY 등록'
  );
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  fail(`SUPABASE_URL 형식이 이상합니다: ${url}\n    예: https://abcdefghijk.supabase.co`);
}

// service_role 키 방지. JWT payload를 열어 role을 확인한다.
try {
  const payload = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString('utf8'));
  if (payload.role && payload.role !== 'anon') {
    fail(
      `SUPABASE_ANON_KEY 에 role="${payload.role}" 키가 들어 있습니다.\n` +
      '    이 키는 브라우저에 그대로 노출됩니다. anon public 키만 사용하세요.'
    );
  }
} catch (e) {
  if (e?.message?.startsWith('SUPABASE_ANON_KEY')) throw e;
  // sb_publishable_... 형태의 신규 키는 JWT가 아니다. 접두사로만 걸러낸다.
  if (/secret|service_role/i.test(anonKey)) {
    fail('SUPABASE_ANON_KEY 가 secret/service_role 키로 보입니다. anon public 키만 사용하세요.');
  }
}

const body = `// 자동 생성 파일 — 직접 수정하지 마세요.
// .env 를 고친 뒤 \`npm run config\` 를 다시 실행하세요. (scripts/gen-config.mjs)
export const CONFIG = {
  url:     ${JSON.stringify(url.replace(/\/$/, ''))},
  anonKey: ${JSON.stringify(anonKey)}
};
`;

writeFileSync(OUT_PATH, body, 'utf8');
console.log(`  ✓ src/config.js 생성 완료 → ${url.replace(/\/$/, '')}`);
