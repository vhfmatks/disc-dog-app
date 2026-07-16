// 누구나 부르는 공개 함수. 스페이스를 만들고, 스페이스에 들어갑니다.
//
// 이 함수만 spaces 테이블을 볼 수 있습니다 (RLS에 정책이 없어 anon 키로는 조회 자체가
// 막혀 있습니다). 비밀번호와 공유 토큰 검증은 전부 여기서 일어나므로 브라우저가
// 우회할 수 없습니다.

import {createClient} from 'npm:@supabase/supabase-js@2';
import type {SupabaseClient} from 'npm:@supabase/supabase-js@2';
import {
  NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PUBLIC_SPACE_COLUMNS,
  classifySpaceUniqueViolation, clientKey, corsHeaders, hashPassword, json,
  randomSpaceId, sameSecret, validSpaceId, verifyPassword
} from '../_shared/spaces.ts';

const CREATE_LIMIT = 10;
const CREATE_WINDOW = '1 hour';
const CHECK_NAME_LIMIT = 60;
const CHECK_NAME_WINDOW = '10 minutes';
const ENTER_LIMIT = 10;
const ENTER_WINDOW = '10 minutes';

interface SpaceRecord {
  id: string;
  name: string;
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
}

const publicView = (space: SpaceRecord) => ({
  id: space.id,
  name: space.name,
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
      .insert({id: randomSpaceId(), name, password_hash})
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
  const granted = () => json({ok: true, space: publicView(space), token: space.share_token});

  // 비밀번호가 없는 스페이스 — 코드만 알면 들어옵니다.
  // (groups 시절에 만들어진 방, 관리자가 일부러 열어둔 방)
  if (!space.password_hash) return granted();

  // 공유 링크(#k=...)를 들고 온 사람. 틀린 토큰은 시도 횟수를 깎지 않는다 —
  // 스페이스를 다시 만들면 브라우저에 남은 옛 토큰이 자동으로 실패하기 때문이다.
  const token = String(input.token || '');
  if (token && sameSecret(token, space.share_token)) return granted();

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
  return granted();
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
  if (input.action === 'check-name') return await checkName(client, request, input);
  if (input.action === 'create') return await create(client, request, input);
  if (input.action === 'enter') return await enter(client, request, input);
  return fail('error', '지원하지 않는 작업입니다.', 400);
});
