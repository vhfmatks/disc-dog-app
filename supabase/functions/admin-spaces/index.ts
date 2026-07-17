// 관리자 전용. ADMIN_PASSWORD를 아는 사람만 모든 스페이스를 보고 지울 수 있습니다.
//
// 스페이스 만들기 자체는 이제 아무나 할 수 있고(spaces 함수), 이 함수는 운영용입니다.
// 목록 훑기 · 이름 고치기 · 지우기 · 참가자 데이터 보기, 그리고 원하는 코드를 직접
// 정해 스페이스 열기.
//
// ⚠ 관리자 비밀번호는 모든 스페이스의 마스터 키입니다. 원래부터 그랬습니다 —
//   list가 스페이스마다 share_token(초대 링크의 출입증)을 내려주므로, 이 비밀번호를
//   아는 사람은 스페이스 비밀번호를 몰라도 어느 스페이스든 들어갈 수 있었습니다.
//   results 액션은 그 권한의 범위를 넓히는 게 아니라, 화면에서 쓸 수 있게 한 것입니다.

import {createClient} from 'npm:@supabase/supabase-js@2';
import {
  NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PUBLIC_SPACE_COLUMNS,
  classifySpaceUniqueViolation, corsHeaders, hashPassword, json, sameSecret, validSpaceId
} from '../_shared/spaces.ts';

/**
 * 서버에 박아둔 관리자 비밀번호의 최소 길이. 사용자 입력이 아니라 배포 설정을 본다.
 *
 * ⚠ 이 함수에는 시도 제한이 없다 (spaces 함수의 ENTER_LIMIT 같은 게 없다). 공개
 *   엔드포인트에 무제한으로 넣어볼 수 있다는 뜻이고, 이 비밀번호 하나가 모든
 *   스페이스의 마스터 키다. 짧게 잡을수록 사전 공격에 그대로 노출된다 —
 *   여기를 낮췄다면 사람이 외우는 낱말 대신 무작위 문자열을 쓰는 게 좋다.
 */
const ADMIN_PASSWORD_MIN = 8;

interface Input {
  action?: string;
  password?: string;
  id?: string;
  name?: string;
  spacePassword?: string;
}

interface SpaceRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  share_token: string;
  password_hash: string | null;
}

/** 관리자 화면이 보는 결과 행. expires_at은 살아 있는 행을 고르는 데만 쓴다. */
const RESULT_COLUMNS = 'id,room,nickname,code,primary_type,totals,charm,bark,x,y,created_at';

// service role은 RLS를 우회하므로 만료된 행까지 다 보입니다. 그러면 안 됩니다 —
// 참가자에게 "24시간 뒤에 사라진다"고 약속했고, pg_cron이 늦어 아직 테이블에 남아
// 있을 뿐인 행은 이미 사라진 것으로 취급해야 합니다. 관리자에게도 마찬가지입니다.
// 그래서 아래 두 조회는 anon에게 걸리는 results_select_live 정책과 같은 조건을
// 손으로 겁니다.

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'POST 요청만 허용됩니다.'}, 405);

  const expectedPassword = Deno.env.get('ADMIN_PASSWORD') || '';
  if (!expectedPassword) return json({error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.'}, 500);
  if (expectedPassword.length < ADMIN_PASSWORD_MIN) {
    return json({error: `ADMIN_PASSWORD는 ${ADMIN_PASSWORD_MIN}자 이상으로 설정해주세요.`}, 500);
  }

  let input: Input;
  try {
    input = await request.json();
  } catch {
    return json({error: '요청 형식이 올바르지 않습니다.'}, 400);
  }

  if (!sameSecret(String(input.password || ''), expectedPassword)) {
    return json({error: '관리자 비밀번호가 올바르지 않습니다.'}, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return json({error: 'Supabase 서버 설정을 확인해주세요.'}, 500);

  const client = createClient(url, serviceRoleKey, {auth: {persistSession: false}});
  const action = input.action || '';
  const id = String(input.id || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  const spacePassword = String(input.spacePassword || '');
  const nowIso = new Date().toISOString();

  // 한 스페이스의 참가자 데이터. 목록을 다시 내려보내지 않는 유일한 액션이다.
  if (action === 'results') {
    if (!validSpaceId(id)) return json({code: 'SPACE_ID_INVALID', error: '올바르지 않은 스페이스 코드입니다.'}, 400);
    const {data, error} = await client
      .from('results')
      .select(RESULT_COLUMNS)
      .eq('room', id)
      .gt('expires_at', nowIso)
      .order('created_at', {ascending: true});
    if (error) return json({code: 'RESULTS_FETCH_FAILED', error: error.message}, 500);
    return json({results: data || []});
  }

  if (action === 'create') {
    if (!validSpaceId(id)) {
      return json({code: 'SPACE_ID_INVALID', error: '스페이스 코드는 영문 소문자·숫자·하이픈 3–24자여야 합니다.'}, 400);
    }
    if (name.length < 1 || name.length > NAME_MAX) {
      const code = name.length < 1 ? 'SPACE_NAME_REQUIRED' : 'SPACE_NAME_TOO_LONG';
      return json({code, error: `스페이스 이름은 1–${NAME_MAX}자여야 합니다.`}, 400);
    }
    // 비밀번호를 비우면 코드만 알면 누구나 들어오는 열린 스페이스가 된다.
    if (spacePassword && (spacePassword.length < PASSWORD_MIN || spacePassword.length > PASSWORD_MAX)) {
      const code = spacePassword.length < PASSWORD_MIN ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_TOO_LONG';
      return json({code, error: `비밀번호는 ${PASSWORD_MIN}자 이상 ${PASSWORD_MAX}자 이하여야 합니다.`}, 400);
    }
    const password_hash = spacePassword ? await hashPassword(spacePassword) : null;
    const {error} = await client.from('spaces').insert({id, name, password_hash});
    if (error) {
      const conflict = classifySpaceUniqueViolation(error);
      if (conflict === 'name') {
        return json({code: 'SPACE_NAME_DUPLICATE', error: '이미 사용 중인 스페이스 이름입니다.'}, 409);
      }
      if (conflict === 'id') {
        return json({code: 'SPACE_ID_DUPLICATE', error: '이미 사용 중인 스페이스 코드입니다.'}, 409);
      }
      return json({code: 'SPACE_CREATE_FAILED', error: error.message}, 400);
    }
  } else if (action === 'update') {
    if (!validSpaceId(id)) return json({code: 'SPACE_ID_INVALID', error: '올바르지 않은 스페이스 코드입니다.'}, 400);
    if (name.length < 1 || name.length > NAME_MAX) {
      const code = name.length < 1 ? 'SPACE_NAME_REQUIRED' : 'SPACE_NAME_TOO_LONG';
      return json({code, error: `스페이스 이름은 1–${NAME_MAX}자여야 합니다.`}, 400);
    }
    const {data, error} = await client.from('spaces').update({name}).eq('id', id).select('id').maybeSingle();
    if (error) {
      if (classifySpaceUniqueViolation(error) === 'name') {
        return json({code: 'SPACE_NAME_DUPLICATE', error: '이미 사용 중인 스페이스 이름입니다.'}, 409);
      }
      return json({code: 'SPACE_UPDATE_FAILED', error: error.message}, 400);
    }
    if (!data) return json({error: '스페이스를 찾을 수 없습니다.'}, 404);
  } else if (action === 'delete') {
    if (!validSpaceId(id)) return json({error: '올바르지 않은 스페이스 코드입니다.'}, 400);
    const {data, error} = await client.from('spaces').delete().eq('id', id).select('id').maybeSingle();
    if (error) return json({error: error.message}, 400);
    if (!data) return json({error: '스페이스를 찾을 수 없습니다.'}, 404);
  } else if (action !== 'list') {
    return json({error: '지원하지 않는 작업입니다.'}, 400);
  }

  const {data: spaces, error} = await client
    .from('spaces')
    .select(`${PUBLIC_SPACE_COLUMNS},share_token,password_hash`)
    .order('created_at', {ascending: false});
  if (error) return json({error: error.message}, 500);

  // 스페이스별 참가자 수. 세지 못해도 목록 자체는 내려보낸다 — 이 조회가 실패했다고
  // 관리자를 로그인에서 막을 이유가 없다. 대신 0명이라고 둘러대지 않고 null을 준다.
  const {data: liveRows} = await client.from('results').select('room').gt('expires_at', nowIso);
  const counts = liveRows
    ? (liveRows as Array<{room: string}>).reduce((tally, row) => {
      tally.set(row.room, (tally.get(row.room) || 0) + 1);
      return tally;
    }, new Map<string, number>())
    : null;

  // 해시 자체는 관리자 화면에도 내려보내지 않는다. 설정 여부만 알면 충분하다.
  return json({
    spaces: ((spaces || []) as SpaceRecord[]).map(space => ({
      id: space.id,
      name: space.name,
      created_at: space.created_at,
      updated_at: space.updated_at,
      share_token: space.share_token,
      has_password: Boolean(space.password_hash),
      result_count: counts ? counts.get(space.id) || 0 : null
    }))
  });
});
