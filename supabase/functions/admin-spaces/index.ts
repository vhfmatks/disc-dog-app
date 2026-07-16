// 관리자 전용. ADMIN_PASSWORD를 아는 사람만 모든 스페이스를 보고 지울 수 있습니다.
//
// 스페이스 만들기 자체는 이제 아무나 할 수 있고(spaces 함수), 이 함수는 운영용입니다.
// 목록 훑기 · 이름 고치기 · 지우기, 그리고 원하는 코드를 직접 정해 스페이스 열기.

import {createClient} from 'npm:@supabase/supabase-js@2';
import {
  NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PUBLIC_SPACE_COLUMNS,
  classifySpaceUniqueViolation, corsHeaders, hashPassword, json, sameSecret, validSpaceId
} from '../_shared/spaces.ts';

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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'POST 요청만 허용됩니다.'}, 405);

  const expectedPassword = Deno.env.get('ADMIN_PASSWORD') || '';
  if (!expectedPassword) return json({error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.'}, 500);
  if (expectedPassword.length < 12) return json({error: 'ADMIN_PASSWORD는 12자 이상으로 설정해주세요.'}, 500);

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

  // 해시 자체는 관리자 화면에도 내려보내지 않는다. 설정 여부만 알면 충분하다.
  return json({
    spaces: ((spaces || []) as SpaceRecord[]).map(space => ({
      id: space.id,
      name: space.name,
      created_at: space.created_at,
      updated_at: space.updated_at,
      share_token: space.share_token,
      has_password: Boolean(space.password_hash)
    }))
  });
});
