// 누구나 부르는 공개 함수. 스페이스를 만들고, 들어가고, 결과를 씁니다.
//
// 이 함수만 spaces 테이블을 볼 수 있습니다 (RLS에 정책이 없어 anon 키로는 조회 자체가
// 막혀 있습니다). 비밀번호와 공유 토큰 검증은 전부 여기서 일어나므로 브라우저가
// 우회할 수 없습니다.
//
// results 쓰기(save-result·check-nickname)도 여기 있습니다. 예전에는 브라우저가 anon
// 키로 직접 INSERT했지만, 함께보기를 만들면서 results의 anon 권한을 통째로 걷어냈기
// 때문입니다 (6_server_side_results). 읽기는 space-views 함수가 맡습니다.

import {createClient} from 'npm:@supabase/supabase-js@2';
import type {SupabaseClient} from 'npm:@supabase/supabase-js@2';
import {
  DEFAULT_SPACE_ICON_ID, NAME_MAX, NICKNAME_MAX, PASSWORD_MAX, PASSWORD_MIN,
  PUBLIC_SPACE_COLUMNS, RESULT_COLUMNS, classifySpaceUniqueViolation, clientKey, corsHeaders,
  hashPassword, isNicknameUniqueViolation, isResultIdUniqueViolation, json,
  randomSpaceId, sameSecret, validSpaceIconId, validSpaceId, verifyPassword
} from '../_shared/spaces.ts';
import {isActive, partnerOf} from '../_shared/view-grants.ts';
import type {SpaceShare} from '../_shared/view-grants.ts';

const CREATE_LIMIT = 10;
const CREATE_WINDOW = '1 hour';
const CHECK_NAME_LIMIT = 60;
const CHECK_NAME_WINDOW = '10 minutes';
const ENTER_LIMIT = 10;
const ENTER_WINDOW = '10 minutes';
const ACTIVE_SPACE_LIMIT = 12;

interface SpaceRecord {
  id: string;
  name: string;
  icon_id: string;
  created_at: string;
  updated_at: string;
  password_hash: string | null;
  share_token: string;
}

interface Input {
  action?: string;
  id?: string;
  name?: string;
  password?: string;
  token?: string;
  iconId?: string;
  nickname?: string;
  result?: Record<string, unknown>;
  page?: number;
}

const publicView = (space: SpaceRecord) => ({
  id: space.id,
  name: space.name,
  icon_id: space.icon_id,
  created_at: space.created_at,
  updated_at: space.updated_at
});

const fail = (reason: string, error: string, status: number, code = 'SPACE_REQUEST_FAILED') =>
  json({ok: false, reason, code, error}, status);

/** 창(window) 안에서 몇 번째 시도인지. 기록에 실패하면 null. */
async function noteAttempt(
  client: SupabaseClient,
  scope: string,
  key: string,
  window: string
): Promise<number | null> {
  const {data, error} = await client.rpc('note_space_attempt', {
    p_scope: scope,
    p_client: key,
    p_window: window
  });
  return error ? null : Number(data);
}

const limiterBroken = () => fail(
  'error',
  '입장 시도를 기록하지 못했습니다. 최신 schema.sql을 적용했는지 확인해주세요.',
  500,
  'SPACE_RATE_LIMITER_FAILED'
);

async function create(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const name = String(input.name || '').trim();
  const password = String(input.password || '');
  const iconId = String(input.iconId || DEFAULT_SPACE_ICON_ID);

  if (name.length < 1 || name.length > NAME_MAX) {
    const code = name.length < 1 ? 'SPACE_NAME_REQUIRED' : 'SPACE_NAME_TOO_LONG';
    return fail('error', `스페이스 이름은 1–${NAME_MAX}자여야 합니다.`, 400, code);
  }
  if (!password) return fail('error', '비밀번호를 입력해주세요.', 400, 'PASSWORD_REQUIRED');
  if (password.length < PASSWORD_MIN) {
    return fail('error', `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`, 400, 'PASSWORD_TOO_SHORT');
  }
  if (password.length > PASSWORD_MAX) {
    return fail('error', `비밀번호는 ${PASSWORD_MAX}자 이하여야 합니다.`, 400, 'PASSWORD_TOO_LONG');
  }
  if (!validSpaceIconId(iconId)) {
    return fail('error', '선택할 수 없는 스페이스 아이콘입니다.', 400, 'SPACE_ICON_INVALID');
  }

  const key = await clientKey(request);
  const tries = await noteAttempt(client, '#create', key, CREATE_WINDOW);
  if (tries === null) return limiterBroken();
  if (tries > CREATE_LIMIT) {
    return fail(
      'rate-limited',
      '한 시간 동안 만들 수 있는 스페이스 수를 넘었습니다. 잠시 뒤에 다시 시도해주세요.',
      429,
      'SPACE_CREATE_RATE_LIMITED'
    );
  }

  const password_hash = await hashPassword(password);

  // 코드가 겹치면 다른 코드로 다시 시도한다. 조합은 50만 개쯤이라 보통 첫 판에 붙는다.
  for (let round = 0; round < 8; round += 1) {
    const {data, error} = await client
      .from('spaces')
      .insert({id: randomSpaceId(), name, icon_id: iconId, password_hash})
      .select(`${PUBLIC_SPACE_COLUMNS},share_token`)
      .single();

    if (!error) {
      const space = data as SpaceRecord;
      return json({ok: true, space: publicView(space), token: space.share_token}, 201);
    }
    const conflict = classifySpaceUniqueViolation(error);
    if (conflict === 'name') {
      return fail('error', '이미 사용 중인 스페이스 이름입니다.', 409, 'SPACE_NAME_DUPLICATE');
    }
    if (conflict !== 'id') return fail('error', error.message, 400, 'SPACE_CREATE_FAILED');
  }
  return fail('error', '스페이스 코드를 만들지 못했습니다. 다시 시도해주세요.', 503, 'SPACE_ID_GENERATION_FAILED');
}

/** 비밀번호가 있고 최근 24시간 안에 결과가 올라온 스페이스만 공개한다. */
async function listActive(client: SupabaseClient, input: Input): Promise<Response> {
  // 공개 목록은 최대 1,000페이지까지만 넘긴다. 그보다 큰 값도 오류 대신 마지막
  // 허용 범위로 고정해, 클라이언트 입력 때문에 DB가 과도하게 건너뛰지 않게 한다.
  const page = Math.max(0, Math.min(1000, Math.floor(Number(input.page) || 0)));
  const {data, error} = await client.rpc('list_active_spaces', {
    p_limit: ACTIVE_SPACE_LIMIT + 1,
    p_offset: page * ACTIVE_SPACE_LIMIT
  });
  if (error) {
    return fail(
      'error',
      '활성 스페이스를 불러오지 못했습니다. 최신 DB 마이그레이션을 적용했는지 확인해주세요.',
      500,
      'ACTIVE_SPACES_FETCH_FAILED'
    );
  }
  const rows = data || [];
  return json({
    ok: true,
    page,
    spaces: rows.slice(0, ACTIVE_SPACE_LIMIT),
    hasMore: rows.length > ACTIVE_SPACE_LIMIT
  });
}

async function checkName(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const name = String(input.name || '').trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    const code = name.length < 1 ? 'SPACE_NAME_REQUIRED' : 'SPACE_NAME_TOO_LONG';
    return fail('error', `스페이스 이름은 1–${NAME_MAX}자여야 합니다.`, 400, code);
  }

  const key = await clientKey(request);
  const tries = await noteAttempt(client, '#name-check', key, CHECK_NAME_WINDOW);
  if (tries === null) return limiterBroken();
  if (tries > CHECK_NAME_LIMIT) {
    return fail(
      'rate-limited',
      '이름 확인 요청이 너무 많습니다. 잠시 뒤에 다시 시도해주세요.',
      429,
      'SPACE_NAME_CHECK_RATE_LIMITED'
    );
  }

  const {count, error} = await client
    .from('spaces')
    .select('id', {count: 'exact', head: true})
    .eq('name', name);
  if (error) return fail('error', '스페이스 이름을 확인하지 못했습니다.', 500, 'SPACE_NAME_CHECK_FAILED');
  if ((count || 0) > 0) {
    return json({
      ok: true,
      available: false,
      code: 'SPACE_NAME_DUPLICATE',
      error: '이미 사용 중인 스페이스 이름입니다.'
    });
  }
  return json({ok: true, available: true});
}

/**
 * 이 스페이스의 결과를 함께보기로 읽을 수 있는 스페이스들.
 *
 * 참가 화면이 "당신의 결과가 어디까지 보이는지"를 말해주려면 필요합니다 — 사람은
 * 자기 이름이 어느 화면에 뜨는지 모른 채로 제출하면 안 됩니다. 수락된(active) 것만
 * 셉니다. 제안만 와 있는 건 아직 아무것도 노출하지 않으니까요.
 *
 * 공유가 양방향이라 방향을 따질 게 없습니다 — 활성 공유의 상대가 곧 내 결과를 보는
 * 쪽이고, 동시에 내가 보는 쪽입니다.
 */
async function sharedWith(client: SupabaseClient, spaceId: string) {
  // 스페이스 ID는 검증된 값이라 필터 문자열에 그대로 넣어도 안전하다.
  const {data, error} = await client
    .from('space_shares')
    .select('*')
    .or(`space_a.eq.${spaceId},space_b.eq.${spaceId}`)
    .is('revoked_at', null);

  // ⚠ 조회가 깨졌으면 "공유 없음"이라고 둘러대지 않는다. 그건 참가자에게 거짓말이 된다.
  if (error) throw new Error(`공유 목록을 확인하지 못했습니다: ${error.message}`);

  const partnerIds = ((data || []) as SpaceShare[])
    .filter(isActive)
    .map(share => partnerOf(share, spaceId));
  if (!partnerIds.length) return [];

  const {data: partners} = await client
    .from('spaces')
    .select('id,name,icon_id')
    .in('id', partnerIds);

  return (partners || []) as Array<{id: string; name: string; icon_id: string}>;
}

async function enter(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const id = String(input.id || '').trim().toLowerCase();
  if (!validSpaceId(id)) return fail('not-found', '없는 스페이스입니다.', 404);

  const {data, error} = await client
    .from('spaces')
    .select(`${PUBLIC_SPACE_COLUMNS},password_hash,share_token`)
    .eq('id', id)
    .maybeSingle();

  if (error) return fail('error', error.message, 500);
  if (!data) return fail('not-found', '없는 스페이스입니다.', 404);

  const space = data as SpaceRecord;

  // 공유 목록 조회가 깨졌으면 입장 자체를 실패시킨다. "공유 없음"이라고 둘러대면
  // 참가자가 자기 결과가 어디까지 보이는지 모른 채 제출하게 된다 — 그건 거짓말이다.
  const granted = async () => {
    try {
      return json({
        ok: true,
        space: publicView(space),
        token: space.share_token,
        sharedWith: await sharedWith(client, space.id)
      });
    } catch (issue) {
      return fail('error', String((issue as Error).message), 500, 'SHARED_WITH_FAILED');
    }
  };

  // 비밀번호가 없는 스페이스 — 코드만 알면 들어옵니다.
  // (groups 시절에 만들어진 방, 관리자가 일부러 열어둔 방)
  if (!space.password_hash) return await granted();

  // 공유 링크(#k=...)를 들고 온 사람. 틀린 토큰은 시도 횟수를 깎지 않는다 —
  // 스페이스를 다시 만들면 브라우저에 남은 옛 토큰이 자동으로 실패하기 때문이다.
  const token = String(input.token || '');
  if (token && sameSecret(token, space.share_token)) return await granted();

  const password = String(input.password || '');
  if (!password) return fail('password-required', '이 스페이스는 비밀번호가 필요합니다.', 401);

  const key = await clientKey(request);
  const tries = await noteAttempt(client, id, key, ENTER_WINDOW);
  if (tries === null) return limiterBroken();
  if (tries > ENTER_LIMIT) {
    return fail('rate-limited', '비밀번호를 너무 여러 번 틀렸습니다. 10분 뒤에 다시 시도해주세요.', 429);
  }

  if (!await verifyPassword(password, space.password_hash)) {
    return fail('password-wrong', '비밀번호가 올바르지 않습니다.', 401);
  }

  await client.from('space_attempts').delete().eq('scope', id).eq('client_key', key);
  return await granted();
}

// ── 결과 쓰기 ──────────────────────────────────────────────────────
// anon의 results 권한을 걷어내면서 브라우저의 직접 INSERT가 여기로 옮겨왔습니다.
//
// ⚠ 옮긴 게 INSERT만이 아닙니다. PostgreSQL은 `insert ... returning`이 돌려주는 행에도
//   SELECT 정책을 적용하므로, 조회만 서버로 옮기고 저장을 남겨둘 수는 없었습니다.
//   닉네임 중복 확인과 재시도 멱등성 조회도 같은 이유로 함께 왔습니다.

/** 저장·조회 요청자가 이 스페이스의 출입증을 들고 있는지. */
async function authorize(client: SupabaseClient, id: string, token: string) {
  const {data} = await client
    .from('spaces')
    .select('id,share_token')
    .eq('id', id)
    .maybeSingle();
  const space = data as {id: string; share_token: string} | null;
  if (!space || !token || !sameSecret(token, space.share_token)) return null;
  return space;
}

const denied = () => json(
  {ok: false, code: 'SPACE_FORBIDDEN', error: '이 스페이스의 출입증이 필요합니다. 다시 들어와주세요.'},
  403
);

const RESULT_CODE_RE = /^[DISC]{1,2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResultDraft {
  id?: string;
  nickname: string;
  code: string;
  primary_type: string;
  totals: unknown;
  charm: number;
  bark: number;
  x: number;
  y: number;
}

/**
 * 모양만 봅니다. 점수의 범위는 DB의 CHECK가 주인이라 여기서 베끼지 않습니다 —
 * 두 벌로 갈라두면 언젠가 어긋나고, 그때 이기는 쪽은 어차피 DB입니다.
 */
function readResultDraft(raw: unknown): {draft: ResultDraft} | {code: string; error: string} {
  const value = (raw || {}) as Record<string, unknown>;
  const nickname = String(value.nickname || '').trim();

  if (!nickname) return {code: 'NICKNAME_REQUIRED', error: '닉네임을 입력해주세요.'};
  if (nickname.length > NICKNAME_MAX) {
    return {code: 'NICKNAME_TOO_LONG', error: `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`};
  }

  const id = value.id === undefined ? undefined : String(value.id);
  if (id !== undefined && !UUID_RE.test(id)) {
    return {code: 'RESULT_ID_INVALID', error: '제출 식별자가 올바르지 않습니다.'};
  }

  const code = String(value.code || '');
  if (!RESULT_CODE_RE.test(code)) return {code: 'RESULT_INVALID', error: '결과 코드가 올바르지 않습니다.'};

  const primary_type = String(value.primary_type || '');
  if (!'DISC'.includes(primary_type) || primary_type.length !== 1) {
    return {code: 'RESULT_INVALID', error: '주 성향이 올바르지 않습니다.'};
  }

  if (!value.totals || typeof value.totals !== 'object' || Array.isArray(value.totals)) {
    return {code: 'RESULT_INVALID', error: '점수 합계가 올바르지 않습니다.'};
  }

  const numbers = {charm: value.charm, bark: value.bark, x: value.x, y: value.y};
  for (const [field, number] of Object.entries(numbers)) {
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      return {code: 'RESULT_INVALID', error: `${field} 값이 올바르지 않습니다.`};
    }
  }

  return {
    draft: {
      id,
      nickname,
      code,
      primary_type,
      totals: value.totals,
      charm: numbers.charm as number,
      bark: numbers.bark as number,
      x: numbers.x as number,
      y: numbers.y as number
    }
  };
}

/**
 * DB가 거절한 이유를 사람의 말로.
 *
 * 정원 트리거와 점수 범위 CHECK는 둘 다 23514로 옵니다. 사람에게는 아주 다른 말이고,
 * 특히 charm 범위 위반은 참가자 잘못이 아니라 배포가 덜 된 것입니다 — 그 말을 해주지
 * 않으면 아무도 원인을 못 찾습니다. (예전에는 브라우저의 friendly()가 하던 일인데,
 * DB 오류를 보는 쪽이 서버가 되면서 함께 넘어왔습니다.)
 */
function classifyResultError(error: {code?: string; message?: string}) {
  const message = error.message || '';

  if (isNicknameUniqueViolation(error)) {
    return {code: 'NICKNAME_DUPLICATE', error: '이 스페이스에서 이미 사용 중인 닉네임입니다.', status: 409};
  }
  if (/정원|cap/i.test(message)) {
    return {code: 'ROOM_FULL', error: '이 스페이스의 정원(200명)이 찼습니다.', status: 409};
  }
  if (/results_charm_check/i.test(message)) {
    return {
      code: 'DB_SCHEMA_OUTDATED',
      error: '데이터베이스가 아직 40문항 점수 범위를 사용 중입니다. 최신 마이그레이션을 적용해주세요.',
      status: 500
    };
  }
  if (/results_room_space_fkey|foreign key/i.test(message)) {
    return {
      code: 'SPACE_DELETED',
      error: '이 스페이스가 삭제되었거나 존재하지 않습니다. 만든 사람에게 새 초대 링크를 받아주세요.',
      status: 404
    };
  }
  return {code: `DB_${error.code || 'SAVE_FAILED'}`, error: message || '결과를 저장하지 못했습니다.', status: 400};
}

async function saveResult(client: SupabaseClient, input: Input): Promise<Response> {
  const id = String(input.id || '').trim().toLowerCase();
  if (!validSpaceId(id)) return json({ok: false, code: 'SPACE_ID_INVALID', error: '없는 스페이스입니다.'}, 404);
  if (!await authorize(client, id, String(input.token || ''))) return denied();

  const parsed = readResultDraft(input.result);
  if ('code' in parsed) return json({ok: false, code: parsed.code, error: parsed.error}, 400);

  // room은 클라이언트가 보낸 값이 아니라 출입증을 검증한 스페이스로 못박는다.
  const row = {...parsed.draft, room: id};

  const {data, error} = await client.from('results').insert(row).select(RESULT_COLUMNS).single();
  if (!error) return json({ok: true, row: data});

  // 응답이 유실돼 같은 제출을 다시 보낸 경우. 같은 한 벌이면 이미 저장된 것으로 답한다.
  if (isResultIdUniqueViolation(error) && row.id) {
    const {data: existing} = await client
      .from('results')
      .select(RESULT_COLUMNS)
      .eq('id', row.id)
      .maybeSingle();
    const committed = existing as {room: string; nickname: string; code: string; primary_type: string} | null;
    if (committed
      && committed.room === row.room
      && committed.nickname === row.nickname
      && committed.code === row.code
      && committed.primary_type === row.primary_type) {
      return json({ok: true, row: existing});
    }
  }

  const classified = classifyResultError(error);
  return json({ok: false, code: classified.code, error: classified.error}, classified.status);
}

/** 시작 버튼의 빠른 확인. 실제 저장 경쟁은 DB unique 제약이 최종 차단한다. */
async function checkNicknameAction(client: SupabaseClient, input: Input): Promise<Response> {
  const id = String(input.id || '').trim().toLowerCase();
  if (!validSpaceId(id)) return json({ok: false, code: 'SPACE_ID_INVALID', error: '없는 스페이스입니다.'}, 404);
  if (!await authorize(client, id, String(input.token || ''))) return denied();

  const nickname = String(input.nickname || '').trim();
  if (!nickname) return json({ok: false, code: 'NICKNAME_REQUIRED', error: '닉네임을 입력해주세요.'}, 400);
  if (nickname.length > NICKNAME_MAX) {
    return json({ok: false, code: 'NICKNAME_TOO_LONG', error: `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`}, 400);
  }

  const {data, error} = await client
    .from('results')
    .select('id')
    .eq('room', id)
    .eq('nickname', nickname)
    .limit(1);

  if (error) return json({ok: false, code: 'NICKNAME_CHECK_FAILED', error: error.message}, 500);
  if ((data || []).length > 0) {
    return json({
      ok: true,
      available: false,
      code: 'NICKNAME_DUPLICATE',
      error: '이 스페이스에서 이미 사용 중인 닉네임입니다.'
    });
  }
  return json({ok: true, available: true});
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return fail('error', 'POST 요청만 허용됩니다.', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return fail('error', 'Supabase 서버 설정을 확인해주세요.', 500);

  let input: Input;
  try {
    input = await request.json();
  } catch {
    return fail('error', '요청 형식이 올바르지 않습니다.', 400);
  }

  const client = createClient(url, serviceRoleKey, {auth: {persistSession: false}});
  if (input.action === 'list-active') return await listActive(client, input);
  if (input.action === 'check-name') return await checkName(client, request, input);
  if (input.action === 'create') return await create(client, request, input);
  if (input.action === 'enter') return await enter(client, request, input);
  if (input.action === 'save-result') return await saveResult(client, input);
  if (input.action === 'check-nickname') return await checkNicknameAction(client, input);
  return fail('error', '지원하지 않는 작업입니다.', 400);
});
