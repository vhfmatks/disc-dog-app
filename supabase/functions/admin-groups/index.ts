import {createClient} from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {...corsHeaders, 'Content-Type': 'application/json; charset=utf-8'}
});

function sameSecret(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(actual);
  const right = encoder.encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

function validId(id: string): boolean {
  return /^[a-z0-9-]{3,24}$/.test(id) && id !== 'admin' && id !== 'map';
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'POST 요청만 허용됩니다.'}, 405);

  const expectedPassword = Deno.env.get('ADMIN_PASSWORD') || '';
  if (!expectedPassword) return json({error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.'}, 500);
  if (expectedPassword.length < 12) return json({error: 'ADMIN_PASSWORD는 12자 이상으로 설정해주세요.'}, 500);

  let input: {action?: string; password?: string; id?: string; name?: string};
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

  if (action === 'create') {
    if (!validId(id)) return json({error: 'Group ID는 영문 소문자·숫자·하이픈 3–24자여야 합니다.'}, 400);
    if (name.length < 1 || name.length > 50) return json({error: '그룹 이름은 1–50자여야 합니다.'}, 400);
    const {error} = await client.from('groups').insert({id, name});
    if (error) {
      const message = error.code === '23505' ? '이미 사용 중인 Group ID입니다.' : error.message;
      return json({error: message}, 400);
    }
  } else if (action === 'update') {
    if (!validId(id)) return json({error: '올바르지 않은 Group ID입니다.'}, 400);
    if (name.length < 1 || name.length > 50) return json({error: '그룹 이름은 1–50자여야 합니다.'}, 400);
    const {data, error} = await client.from('groups').update({name}).eq('id', id).select('id').maybeSingle();
    if (error) return json({error: error.message}, 400);
    if (!data) return json({error: '그룹을 찾을 수 없습니다.'}, 404);
  } else if (action === 'delete') {
    if (!validId(id)) return json({error: '올바르지 않은 Group ID입니다.'}, 400);
    const {data, error} = await client.from('groups').delete().eq('id', id).select('id').maybeSingle();
    if (error) return json({error: error.message}, 400);
    if (!data) return json({error: '그룹을 찾을 수 없습니다.'}, 404);
  } else if (action !== 'list') {
    return json({error: '지원하지 않는 작업입니다.'}, 400);
  }

  const {data: groups, error} = await client
    .from('groups')
    .select('id,name,created_at,updated_at')
    .order('created_at', {ascending: false});
  if (error) return json({error: error.message}, 500);
  return json({groups: groups || []});
});
