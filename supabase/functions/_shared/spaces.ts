// spaces / admin-spaces / space-views 세 함수가 함께 쓰는 조각들.
// 비밀번호 해시와 스페이스 ID 규칙은 반드시 한 곳에만 있어야 합니다.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {...corsHeaders, ...headers, 'Content-Type': 'application/json; charset=utf-8'}
  });

/** 브라우저에 돌려줘도 되는 컬럼. password_hash와 share_token은 절대 포함하지 않습니다. */
export const PUBLIC_SPACE_COLUMNS = 'id,name,icon_id,created_at,updated_at';

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;
export const NAME_MAX = 50;

/** src/lib/nickname-rules.ts와 DB의 nickname check가 같은 값을 쓴다. */
export const NICKNAME_MAX = 16;

/** 결과 한 행에서 브라우저가 볼 수 있는 전부. src/lib/db.ts의 ResultRow와 짝이다. */
export const RESULT_COLUMNS = 'id,room,nickname,code,primary_type,totals,charm,bark,x,y,created_at';

/** src/lib/space-icons.ts와 DB의 spaces_icon_id_check가 같은 목록을 사용한다. */
export const SPACE_ICON_IDS = [
  'corgi', 'dachshund', 'husky', 'pug', 'poodle',
  'beagle', 'dalmatian', 'bulldog', 'chihuahua', 'maltese',
  'samoyed', 'schnauzer', 'papillon', 'yorkshire-terrier', 'pomeranian',
  'doberman', 'boxer', 'great-dane', 'shih-tzu', 'old-english-sheepdog'
] as const;
export const DEFAULT_SPACE_ICON_ID = 'corgi';

export function validSpaceIconId(value: string): boolean {
  return (SPACE_ICON_IDS as readonly string[]).includes(value);
}

/** router.ts의 예약어와 같은 목록. 스페이스 ID가 이 값이면 라우팅이 깨집니다. */
const RESERVED_IDS = new Set(['admin', 'manage', 'map', 'new', 'profile']);

export function validSpaceId(id: string): boolean {
  return /^[a-z0-9-]{3,24}$/.test(id) && !RESERVED_IDS.has(id);
}

export type SpaceUniqueViolation = 'id' | 'name' | 'other';

/** PostgREST가 돌려주는 23505 메시지에서 어떤 스페이스 키가 충돌했는지 구분한다. */
export function classifySpaceUniqueViolation(error: unknown): SpaceUniqueViolation {
  const value = error as {code?: string; message?: string; details?: string} | null;
  if (value?.code !== '23505') return 'other';
  const text = `${value.message || ''} ${value.details || ''}`;
  if (/spaces_name_key|key\s*\(name\)/i.test(text)) return 'name';
  if (/spaces_pkey|key\s*\(id\)/i.test(text)) return 'id';
  return 'other';
}

// results의 23505를 가려내는 두 함수는 원래 src/lib에 있었습니다. 결과 저장이 서버로
// 넘어오면서 PostgREST 오류를 보는 쪽도 서버뿐이라 이리로 옮겼습니다 — 브라우저는
// 이제 이 함수들이 만든 코드(NICKNAME_DUPLICATE 등)만 받습니다.

/** 스페이스 안 닉네임 충돌인가. */
export function isNicknameUniqueViolation(error: unknown): boolean {
  const value = error as {code?: string; message?: string; details?: string} | null;
  if (value?.code !== '23505') return false;
  const text = `${value.message || ''} ${value.details || ''}`;
  return /results_room_nickname_key|key\s*\(room\s*,\s*nickname\)/i.test(text);
}

/** 응답 유실 뒤 같은 제출을 재시도했는지 확인하기 위한 primary-key 충돌 판별. */
export function isResultIdUniqueViolation(error: unknown): boolean {
  const value = error as {code?: string; message?: string; details?: string} | null;
  if (value?.code !== '23505') return false;
  const text = `${value.message || ''} ${value.details || ''}`;
  return /results_pkey|key\s*\(id\)/i.test(text);
}

// ── 스페이스 ID 생성 ───────────────────────────────────────────────
// 프로젝터 화면에 띄워놓고 눈으로 읽어 옮겨 적는 코드입니다. 짧고, 읽을 수 있고,
// 헷갈리는 글자가 없어야 합니다. 비밀값이 아니므로 추측 가능해도 괜찮습니다 —
// 입장을 막는 건 비밀번호와 공유 토큰입니다.

const ADJECTIVES = [
  'sunny', 'hazel', 'brave', 'cozy', 'merry', 'swift', 'jolly', 'lucky',
  'mellow', 'nimble', 'cheery', 'breezy', 'plucky', 'snowy', 'amber', 'ruby',
  'olive', 'misty', 'happy', 'tidy', 'zippy', 'bold', 'calm', 'fuzzy'
];

const BREEDS = [
  'corgi', 'beagle', 'husky', 'poodle', 'collie', 'shiba', 'jindo', 'maltese',
  'spitz', 'pug', 'akita', 'bichon', 'terrier', 'setter', 'boxer', 'pointer',
  'sapsali', 'samoyed', 'borzoi', 'basenji', 'vizsla', 'sheltie', 'whippet', 'papillon'
];

function pick<T>(items: T[]): T {
  return items[crypto.getRandomValues(new Uint32Array(1))[0] % items.length];
}

/** 예: hazel-corgi-427 */
export function randomSpaceId(): string {
  const number = 100 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900);
  return `${pick(ADJECTIVES)}-${pick(BREEDS)}-${number}`;
}

// ── 비밀번호 해시 ──────────────────────────────────────────────────
// Web Crypto에 scrypt/argon2가 없어 PBKDF2-SHA256을 씁니다. 반복 횟수는 OWASP 권고치.
// 저장 형식: pbkdf2-sha256$<반복>$<salt b64>$<hash b64>

const ITERATIONS = 210_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));

// salt를 그냥 Uint8Array로 받으면 Uint8Array<ArrayBufferLike>가 되어 BufferSource에
// 안 맞는다 (SharedArrayBuffer일 수도 있으니까). 실제로 넘어오는 건 항상 ArrayBuffer다.
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, key, 256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = String(stored).split('$');
  if (scheme !== 'pbkdf2-sha256' || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  try {
    const actual = await derive(password, fromBase64(saltRaw), iterations);
    return timingSafeEqual(actual, fromBase64(hashRaw));
  } catch {
    return false;   // 저장된 해시가 깨졌으면 통과시키지 않는다
  }
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

export function sameSecret(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(actual), encoder.encode(expected));
}

// ── 요청자 식별 ────────────────────────────────────────────────────

/** 시도 횟수를 세는 용도로만 씁니다. 원본 IP는 어디에도 남기지 않습니다. */
export async function clientKey(request: Request): Promise<string> {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return toBase64(new Uint8Array(digest)).slice(0, 22);
}
