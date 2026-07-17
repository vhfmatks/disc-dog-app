// 함께보기. 여러 스페이스의 결과를 복사하지 않고 한 지도에서 조합해 봅니다.
//
// 이 함수가 지키는 것은 하나입니다: **누가 무엇을 볼 수 있는가**. 브라우저가 보낸
// 상대 목록은 언제나 "요청"이고, 권한은 매번 여기서 공유를 다시 읽어 판정합니다.
// 주소창의 ?with=도, 화면에 뜬 목록도 권한의 근거가 되지 못합니다.
//
// 열쇠는 둘입니다.
//   - 입장 토큰(share_token) : 결과 읽기(fetch-results). 공유를 만들 수는 없습니다.
//   - 스페이스 비밀번호       : 공유 제안·수락·해제, 공유 대상 목록 보기.
//
// ⚠ 비밀번호는 참가자 입장에도 쓰입니다. 즉 **비밀번호를 아는 참가자는 누구나** 이
//   스페이스의 결과를 남에게 공유할 수 있습니다. 초대 링크로 들어온 사람은 비밀번호를
//   모르니 못 하지만, 생성자 전용 권한은 아닙니다 — 의도된 선택입니다 (8_mutual_shares).
//
// 단일 지도도 이 함수를 씁니다 (sourceSpaceIds가 빈 배열). 결과를 읽는 길이 하나뿐이면
// 권한 계약도 하나뿐입니다.

import {createClient} from 'npm:@supabase/supabase-js@2';
import type {SupabaseClient} from 'npm:@supabase/supabase-js@2';
import {
  RESULT_COLUMNS, clientKey, corsHeaders, json, sameSecret, validSpaceId, verifyPassword
} from '../_shared/spaces.ts';
import {
  MAX_ROWS, MAX_SHAREABLE, deniedSourceIds, isActive, isIncoming, normalizeSourceIds,
  pairKey, partnerOf, shareState, visibleRows
} from '../_shared/view-grants.ts';
import type {ShareState, SpaceShare} from '../_shared/view-grants.ts';

/** 비밀번호 대입 제한. 입장(spaces 함수)과 같은 창을 쓴다 — 같은 비밀번호니까. */
const PASSWORD_LIMIT = 10;
const PASSWORD_WINDOW = '10 minutes';
/** 한 스페이스가 뿌릴 수 있는 제안. 초대 스팸을 막는다. */
const SHARE_LIMIT = 30;
const SHARE_WINDOW = '1 hour';

interface Input {
  action?: string;
  spaceId?: string;
  partnerSpaceId?: string;
  hostSpaceId?: string;
  sourceSpaceIds?: unknown;
  password?: string;
  hostToken?: string;
}

interface SpaceRecord {
  id: string;
  name: string;
  icon_id: string;
  password_hash: string | null;
  share_token: string;
}

interface SpaceSummary {
  id: string;
  name: string;
  icon_id: string;
}

const fail = (code: string, error: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ok: false, code, error, ...extra}, status);

const summary = (space: SpaceRecord | SpaceSummary): SpaceSummary =>
  ({id: space.id, name: space.name, icon_id: space.icon_id});

async function noteAttempt(
  client: SupabaseClient, scope: string, key: string, window: string
): Promise<number | null> {
  const {data, error} = await client.rpc('note_space_attempt', {
    p_scope: scope, p_client: key, p_window: window
  });
  return error ? null : Number(data);
}

async function loadSpace(client: SupabaseClient, id: string): Promise<SpaceRecord | null> {
  const {data} = await client
    .from('spaces')
    .select('id,name,icon_id,password_hash,share_token')
    .eq('id', id)
    .maybeSingle();
  return (data as SpaceRecord | null) || null;
}

async function loadSummaries(client: SupabaseClient, ids: string[]): Promise<Map<string, SpaceSummary>> {
  if (!ids.length) return new Map();
  const {data} = await client.from('spaces').select('id,name,icon_id').in('id', ids);
  return new Map(((data || []) as SpaceSummary[]).map(space => [space.id, space]));
}

/** 이 스페이스가 얽힌 모든 공유 (양쪽 컬럼 어디에 있든). */
async function loadShares(client: SupabaseClient, me: string): Promise<SpaceShare[]> {
  // 스페이스 ID는 ^[a-z0-9-]{3,24}$로 검증된 값이라 필터 문자열에 그대로 넣어도 안전하다.
  const {data} = await client
    .from('space_shares')
    .select('*')
    .or(`space_a.eq.${me},space_b.eq.${me}`)
    .is('revoked_at', null);
  return (data || []) as SpaceShare[];
}

async function loadShare(client: SupabaseClient, one: string, other: string): Promise<SpaceShare | null> {
  const [a, b] = pairKey(one, other);
  const {data} = await client
    .from('space_shares')
    .select('*')
    .eq('space_a', a)
    .eq('space_b', b)
    .maybeSingle();
  return (data as SpaceShare | null) || null;
}

/**
 * 스페이스 비밀번호를 확인하고 스페이스를 돌려준다.
 *
 * 스페이스가 없을 때도 비밀번호가 틀렸을 때와 똑같이 답한다 — 비밀번호를 넣어보는
 * 것으로 어떤 코드가 살아 있는지 훑을 수 있게 두지 않는다. 맞으면 시도 기록을 지운다.
 *
 * 비밀번호가 없는 스페이스(코드만 알면 들어오는 열린 방)는 통과시키지 않는다. 그런
 * 방에는 지킬 비밀이 없어 아무나 공유를 주무를 수 있게 되기 때문이다.
 */
async function withPassword(
  client: SupabaseClient, request: Request, id: string, password: string
): Promise<{space: SpaceRecord} | {response: Response}> {
  const wrong = () => ({
    response: fail('SPACE_PASSWORD_WRONG', '스페이스 비밀번호가 올바르지 않습니다.', 403)
  });
  if (!validSpaceId(id) || !password) return wrong();

  const key = await clientKey(request);
  const tries = await noteAttempt(client, id, key, PASSWORD_WINDOW);
  if (tries === null) {
    return {response: fail('RATE_LIMITER_FAILED', '요청을 기록하지 못했습니다. 최신 마이그레이션을 적용했는지 확인해주세요.', 500)};
  }
  if (tries > PASSWORD_LIMIT) {
    return {response: fail('RATE_LIMITED', '비밀번호를 너무 여러 번 틀렸습니다. 10분 뒤에 다시 시도해주세요.', 429)};
  }

  const space = await loadSpace(client, id);
  if (!space?.password_hash) {
    // 열린 방이거나 없는 방. 둘을 구분해주지 않는다.
    return {response: fail(
      'SPACE_PASSWORD_UNSET',
      '비밀번호가 없는 스페이스는 공유를 다룰 수 없습니다.',
      403
    )};
  }
  if (!await verifyPassword(password, space.password_hash)) return wrong();

  await client.from('space_attempts').delete().eq('scope', id).eq('client_key', key);
  return {space};
}

/** 화면이 버튼을 고르는 데 필요한 것 전부. */
const shareView = (share: SpaceShare, me: string, space: SpaceSummary | undefined) => ({
  space: space || null,
  state: shareState(share),
  incoming: isIncoming(share, me),
  requested_at: share.requested_at,
  accepted_at: share.accepted_at
});

// ── 공유 관리 (비밀번호) ───────────────────────────────────────────

/**
 * 공유 대상 목록. 비밀번호가 설정된 모든 스페이스를 상태와 함께 돌려준다.
 *
 * ⚠ 이름과 입장 코드가 목록에 실린다. 홈에 뜨지 않던 조용한 스페이스도 포함이다 —
 *   비밀번호를 아는 사람에게만 보이지만, 그 사람이 곧 참가자 전원일 수 있다.
 *   의도된 선택이다.
 *
 * 검색은 브라우저가 이 목록 안에서 한다. 한 번의 왕복으로 즉시 걸러지는 편이
 * 타이핑마다 서버를 두드리는 것보다 낫고, 상한(MAX_SHAREABLE)이 있어 양도 뻔하다.
 */
async function listShareable(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const spaceId = String(input.spaceId || '').trim().toLowerCase();
  const authorized = await withPassword(client, request, spaceId, String(input.password || ''));
  if ('response' in authorized) return authorized.response;

  const shares = await loadShares(client, spaceId);
  const stateBy = new Map<string, {state: ShareState; incoming: boolean}>();
  for (const share of shares) {
    stateBy.set(partnerOf(share, spaceId), {
      state: shareState(share),
      incoming: isIncoming(share, spaceId)
    });
  }

  // 비밀번호 없는 방은 공유 상대가 될 수 없다 — 애초에 목록에 넣지 않는다.
  const {data, error} = await client
    .from('spaces')
    .select('id,name,icon_id')
    .not('password_hash', 'is', null)
    .neq('id', spaceId)
    .order('name')
    .limit(MAX_SHAREABLE);
  if (error) return fail('SHAREABLE_FETCH_FAILED', error.message, 500);

  const spaces = ((data || []) as SpaceSummary[]).map(space => ({
    ...space,
    ...(stateBy.get(space.id) || {state: 'none' as const, incoming: false})
  }));

  return json({ok: true, space: summary(authorized.space), spaces, limit: MAX_SHAREABLE});
}

/** 공유 제안. 상대가 수락해야 발효된다. */
async function share(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const spaceId = String(input.spaceId || '').trim().toLowerCase();
  const partnerId = String(input.partnerSpaceId || '').trim().toLowerCase();

  const authorized = await withPassword(client, request, spaceId, String(input.password || ''));
  if ('response' in authorized) return authorized.response;

  if (!validSpaceId(partnerId)) return fail('PARTNER_NOT_FOUND', '없는 스페이스 코드입니다.', 404);
  if (partnerId === spaceId) return fail('SELF_SHARE', '자기 스페이스에는 공유할 수 없습니다.', 400);

  const key = await clientKey(request);
  const tries = await noteAttempt(client, `#share:${spaceId}`, key, SHARE_WINDOW);
  if (tries === null) return fail('RATE_LIMITER_FAILED', '요청을 기록하지 못했습니다.', 500);
  if (tries > SHARE_LIMIT) {
    return fail('SHARE_RATE_LIMITED', '한 시간 동안 보낼 수 있는 공유 제안 수를 넘었습니다.', 429);
  }

  const partner = await loadSpace(client, partnerId);
  if (!partner) return fail('PARTNER_NOT_FOUND', '없는 스페이스 코드입니다.', 404);

  // ⚠ 비밀번호 없는 스페이스는 코드만 알면 누구나 들어옵니다. 스페이스 코드는 일부러
  //   추측 가능하게 만든 값이고요 (_shared/spaces.ts). 그런 방과 공유하면
  //   "구성원만 본다"는 이 기능의 전제가 아무것도 지키지 못합니다 — 전체 공개입니다.
  if (!partner.password_hash) {
    return fail(
      'PARTNER_OPEN',
      '비밀번호가 없는 스페이스와는 공유할 수 없습니다. 코드만 알면 누구나 들어오는 방이라, 사실상 전체 공개가 됩니다.',
      400
    );
  }

  const existing = await loadShare(client, spaceId, partnerId);
  if (existing && shareState(existing) !== 'ended') {
    // 이미 제안했거나 이미 공유 중이다. 다시 눌러도 같은 상태로 답한다.
    return json({ok: true, share: shareView(existing, spaceId, summary(partner))});
  }

  const [space_a, space_b] = pairKey(spaceId, partnerId);
  const {data, error} = await client
    .from('space_shares')
    .upsert({
      space_a, space_b,
      requested_by: spaceId,
      requested_at: new Date().toISOString(),
      accepted_at: null,
      revoked_at: null
    })
    .select('*')
    .single();

  if (error) return fail('SHARE_FAILED', error.message, 400);
  return json({ok: true, share: shareView(data as SpaceShare, spaceId, summary(partner))}, 201);
}

/**
 * 제안 수락. 이 순간부터 **서로** 본다 — 수락은 맞교환이다.
 *
 * ⚠ 넘어가는 건 앞으로 제출될 결과만이 아니다. 양쪽 스페이스의 **기존 결과 전부**가
 *   이 순간 서로에게 보인다 (9_share_all_results). 소급 노출이라, 수락 버튼 옆에 그
 *   말이 적혀 있어야 한다 (ShareSpaces).
 */
async function accept(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const spaceId = String(input.spaceId || '').trim().toLowerCase();
  const partnerId = String(input.partnerSpaceId || '').trim().toLowerCase();

  const authorized = await withPassword(client, request, spaceId, String(input.password || ''));
  if ('response' in authorized) return authorized.response;
  if (!validSpaceId(partnerId)) return fail('SHARE_NOT_FOUND', '없는 공유 제안입니다.', 404);

  const existing = await loadShare(client, spaceId, partnerId);
  if (!existing) return fail('SHARE_NOT_FOUND', '없는 공유 제안입니다.', 404);
  if (shareState(existing) === 'ended') return fail('SHARE_ENDED', '이미 종료된 공유 제안입니다.', 409);

  const spaces = await loadSummaries(client, [partnerId]);
  if (shareState(existing) === 'active') {
    return json({ok: true, share: shareView(existing, spaceId, spaces.get(partnerId))});
  }
  // 내가 보낸 제안을 내가 수락할 수는 없다. 상대가 눌러야 한다.
  if (!isIncoming(existing, spaceId)) {
    return fail('SHARE_NOT_INCOMING', '상대가 수락해야 하는 제안입니다.', 403);
  }

  const now = new Date().toISOString();
  const [a, b] = pairKey(spaceId, partnerId);
  const {data, error} = await client
    .from('space_shares')
    .update({accepted_at: now})
    .eq('space_a', a)
    .eq('space_b', b)
    .select('*')
    .single();

  if (error) return fail('ACCEPT_FAILED', error.message, 400);
  return json({ok: true, share: shareView(data as SpaceShare, spaceId, spaces.get(partnerId))});
}

/** 해제. 제안 취소·거절·공유 종료가 모두 같은 일이다. 양쪽 다 할 수 있다. */
async function unshare(client: SupabaseClient, request: Request, input: Input): Promise<Response> {
  const spaceId = String(input.spaceId || '').trim().toLowerCase();
  const partnerId = String(input.partnerSpaceId || '').trim().toLowerCase();

  const authorized = await withPassword(client, request, spaceId, String(input.password || ''));
  if ('response' in authorized) return authorized.response;
  if (!validSpaceId(partnerId)) return fail('SHARE_NOT_FOUND', '없는 공유입니다.', 404);

  const existing = await loadShare(client, spaceId, partnerId);
  if (!existing) return fail('SHARE_NOT_FOUND', '없는 공유입니다.', 404);

  const spaces = await loadSummaries(client, [partnerId]);
  if (shareState(existing) === 'ended') {
    return json({ok: true, share: shareView(existing, spaceId, spaces.get(partnerId))});
  }

  const [a, b] = pairKey(spaceId, partnerId);
  const {data, error} = await client
    .from('space_shares')
    .update({revoked_at: new Date().toISOString()})
    .eq('space_a', a)
    .eq('space_b', b)
    .select('*')
    .single();

  if (error) return fail('UNSHARE_FAILED', error.message, 400);
  return json({ok: true, share: shareView(data as SpaceShare, spaceId, spaces.get(partnerId))});
}

// ── 지도 (입장 토큰) ───────────────────────────────────────────────

interface ResultRecord {
  id: string;
  room: string;
  created_at: string;
  [key: string]: unknown;
}

/**
 * 지도가 그릴 모든 것. 단일 지도(sourceSpaceIds 없음)와 함께보기가 같은 문을 쓴다.
 *
 * 응답에 availableSources와 pendingOffers를 함께 실어 보내므로, 지도는 요청 한 번으로
 * "무엇을 볼 수 있는지" · "지금 보는 것" · "수락을 기다리는 제안"을 모두 얻는다.
 * 비밀번호 없이 얻는다 — 지도를 여는 데 비밀번호를 또 묻지 않기 위해서다.
 */
async function fetchResults(client: SupabaseClient, input: Input): Promise<Response> {
  const hostSpaceId = String(input.hostSpaceId || '').trim().toLowerCase();
  if (!validSpaceId(hostSpaceId)) return fail('SPACE_ID_INVALID', '없는 스페이스입니다.', 404);

  const host = await loadSpace(client, hostSpaceId);
  const hostToken = String(input.hostToken || '');
  if (!host || !hostToken || !sameSecret(hostToken, host.share_token)) {
    return fail('SPACE_FORBIDDEN', '이 스페이스의 출입증이 필요합니다. 다시 들어와주세요.', 403);
  }

  const requested = normalizeSourceIds(input.sourceSpaceIds, hostSpaceId);
  if (requested.issue) return fail(requested.issue.code, requested.issue.error, 400);

  const shares = await loadShares(client, hostSpaceId);

  // 열린 방이 남의 결과를 받고 있으면 안 된다. share·accept에서 이미 막지만, 수락 뒤에
  // 비밀번호가 사라지는 길이 생기더라도 여기서 다시 닫는다 (fail closed).
  const live = host.password_hash ? shares : [];
  const active = live.filter(isActive);

  const denied = deniedSourceIds(requested.ids, active, hostSpaceId);
  if (denied.length) {
    // 어떤 ID가 빠졌는지는 알려준다. host는 그 공유가 활성일 때 이미 목록에서 본 ID다.
    // 이게 없으면 열려 있던 화면이 "일부가 사라졌다"는 걸 알아챌 방법이 없다.
    // 이름과 결과는 주지 않는다.
    return fail(
      'SOURCE_NOT_GRANTED',
      '공유가 종료되었거나 권한이 없는 스페이스가 있습니다.',
      403,
      {deniedSourceIds: denied}
    );
  }

  const partnerIds = active.map(share => partnerOf(share, hostSpaceId));
  const pendingIds = live
    .filter(share => shareState(share) === 'pending' && isIncoming(share, hostSpaceId))
    .map(share => partnerOf(share, hostSpaceId));
  const spaces = await loadSummaries(client, [hostSpaceId, ...partnerIds, ...pendingIds]);

  // 고를 수 있는 스페이스마다 몇 명인지. 선택 화면이 이 숫자로 상한을 미리 막는다 —
  // 사용자가 풀 방법이 없는 오류를 정상 경로로 삼지 않기 위해서다.
  //
  // 공유가 하나도 없는 스페이스에서는 이 조회를 건너뛴다. 고를 것도 없거니와, 한
  // 스페이스는 정원이 200명이라 총량 상한에 닿을 수가 없다. 단독 지도의 왕복 횟수는
  // 예전 그대로다.
  let availableSources: Array<SpaceSummary & {result_count: number}> = [];
  if (active.length) {
    const {data: countRows, error: countError} = await client
      .from('results')
      .select('id,room,created_at')
      .in('room', [hostSpaceId, ...partnerIds]);
    if (countError) return fail('RESULTS_FETCH_FAILED', countError.message, 500);

    const counted = visibleRows((countRows || []) as ResultRecord[], hostSpaceId, active);
    const countBySpace = new Map<string, number>([hostSpaceId, ...partnerIds].map(id => [id, 0]));
    for (const row of counted) countBySpace.set(row.room, (countBySpace.get(row.room) || 0) + 1);

    availableSources = partnerIds.flatMap(id => {
      const space = spaces.get(id);
      return space ? [{...space, result_count: countBySpace.get(id) || 0}] : [];
    });

    // 무거운 조회 전에 센다. 넘을 조합이면 애초에 읽지 않는다.
    const total = [hostSpaceId, ...requested.ids]
      .reduce((sum, id) => sum + (countBySpace.get(id) || 0), 0);
    if (total > MAX_ROWS) {
      return fail(
        'TOO_MANY_ROWS',
        `한 번에 볼 수 있는 인원(${MAX_ROWS}명)을 넘었습니다. 스페이스를 몇 개 빼주세요.`,
        400,
        {availableSources}
      );
    }
  }

  const {data: resultRows, error} = await client
    .from('results')
    .select(RESULT_COLUMNS)
    .in('room', [hostSpaceId, ...requested.ids])
    .order('created_at', {ascending: true});
  if (error) return fail('RESULTS_FETCH_FAILED', error.message, 500);

  const visible = visibleRows((resultRows || []) as ResultRecord[], hostSpaceId, active);
  const rows = visible.map(row => ({...row, source_space: spaces.get(row.room) || null}));

  return json({
    ok: true,
    rows,
    availableSources,
    // 지도 아래에 수락 버튼을 띄울 근거. 비밀번호는 누를 때 묻는다.
    pendingOffers: pendingIds.flatMap(id => {
      const space = spaces.get(id);
      return space ? [space] : [];
    })
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
  if (request.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'POST 요청만 허용됩니다.', 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return fail('SERVER_MISCONFIGURED', 'Supabase 서버 설정을 확인해주세요.', 500);

  let input: Input;
  try {
    input = await request.json();
  } catch {
    return fail('BAD_REQUEST', '요청 형식이 올바르지 않습니다.', 400);
  }

  const client = createClient(url, serviceRoleKey, {auth: {persistSession: false}});
  switch (input.action) {
    case 'list-shareable': return await listShareable(client, request, input);
    case 'share':          return await share(client, request, input);
    case 'accept':         return await accept(client, request, input);
    case 'unshare':        return await unshare(client, request, input);
    case 'fetch-results':  return await fetchResults(client, input);
    default:               return fail('UNSUPPORTED_ACTION', '지원하지 않는 작업입니다.', 400);
  }
});
