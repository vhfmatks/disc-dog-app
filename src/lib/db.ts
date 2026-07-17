// 서버와 이야기하는 유일한 곳.
//
// ⚠ 여기에는 supabase-js가 없습니다. 예전에는 브라우저가 anon 키로 results를 직접
//   읽고 썼지만, 함께보기를 만들면서 그 권한을 통째로 걷어냈습니다 — 화면에서
//   비밀번호를 물어도 API를 직접 두드리면 남의 스페이스 결과가 읽혔기 때문입니다
//   (6_server_side_results). 이제 결과는 전부 Edge Function을 거칩니다:
//     - 읽기: space-views.fetch-results (host 출입증 + grant 확인)
//     - 쓰기: spaces.save-result / check-nickname (출입증 확인)
//   덕분에 브라우저 번들에서 supabase-js도 함께 빠졌습니다.

import {CONFIG} from '../config.ts';
import type {Totals, TypeCode} from '../../assets/data.ts';
import {validateNickname} from './nickname-rules.ts';

export {SPACE_NAME_MAX, SPACE_PASSWORD_MAX, SPACE_PASSWORD_MIN} from './space-rules.ts';

/** 스페이스에서 브라우저가 볼 수 있는 전부. 비밀번호 해시와 토큰들은 서버에만 있다. */
export interface SpaceRow {
  id: string;
  name: string;
  icon_id: string;
  created_at: string;
  updated_at: string;
}

/** 스페이스 요약. 함께보기 선택 목록과 공유 고지에 쓴다. */
export interface SpaceSummary {
  id: string;
  name: string;
  icon_id: string;
}

/** 홈에 공개하는 활성 스페이스 요약. 비밀번호 해시와 공유 토큰은 포함하지 않는다. */
export interface ActiveSpaceRow {
  id: string;
  name: string;
  icon_id: string;
  participant_count: number;
  created_at: string;
  last_activity_at: string;
}

/** 관리자 화면은 초대 링크를 만들어야 해서 공유 토큰까지 받는다. */
export interface AdminSpaceRow extends SpaceRow {
  share_token: string;
  has_password: boolean;
  /** 참가자 수. 서버가 세지 못했으면 null — 0명과 구분한다. */
  result_count: number | null;
}

/** results 테이블에서 읽어오는 행. */
export interface ResultRow {
  id: string;
  room: string;
  nickname: string;
  code: string;
  primary_type: TypeCode;
  /** 채점 버전이 다른 행이 섞일 수 있어 _version으로 구분한다. */
  totals: Totals & {_version?: number};
  charm: number;
  bark: number;
  x: number;
  y: number;
  created_at: string;
}

/**
 * 함께보기가 돌려주는 행. 어느 스페이스에서 왔는지가 붙는다.
 *
 * 단일 지도에서도 같은 타입이다 — 결과를 읽는 길이 하나뿐이라 지도도 한 가지 행만
 * 다루면 된다. 기준 스페이스의 행이면 source_space.id === space.id다.
 */
export interface MapResultRow extends ResultRow {
  source_space: SpaceSummary | null;
}

/** 함께보기에 넣을 수 있는 스페이스. 인원수는 상한을 미리 막는 데 쓴다. */
export interface AvailableSource extends SpaceSummary {
  result_count: number;
}

/** created_at은 DB 기본값이 채운다. id는 재시도 멱등성을 위해 클라이언트가 고정한다. */
export interface NewResult {
  id?: string;
  nickname: string;
  code: string;
  primary_type: TypeCode;
  totals: Totals & {_version?: number};
  charm: number;
  bark: number;
  x: number;
  y: number;
}

export type SaveResponse =
  | {ok: true; row: ResultRow}
  | {ok: false; code: string; error: string};

export type MapFetchResponse =
  | {
    ok: true;
    rows: MapResultRow[];
    availableSources: AvailableSource[];
    /** 수락을 기다리는 제안. 지도 아래에 수락 버튼을 띄울 근거다. */
    pendingOffers: SpaceSummary[];
  }
  | {ok: false; code: string; error: string; deniedSourceIds?: string[]};

export type EnterReason = 'password-required' | 'password-wrong' | 'not-found' | 'rate-limited' | 'error';

export type EnterResponse =
  | {ok: true; space: SpaceRow; token: string; sharedWith: SpaceSummary[]}
  | {ok: false; reason: EnterReason; error: string};

export type CreateSpaceResponse =
  | {ok: true; space: SpaceRow; token: string}
  | {ok: false; code: string; error: string};

export type ActiveSpacesResponse =
  | {ok: true; spaces: ActiveSpaceRow[]}
  | {ok: false; spaces: ActiveSpaceRow[]; code: string; error: string};

export type SpaceNameCheckResponse =
  | {ok: true; available: boolean; code?: string; error?: string}
  | {ok: false; code: string; error: string};

export type NicknameCheckResponse =
  | {ok: true; available: boolean; code?: 'NICKNAME_DUPLICATE'; error?: string}
  | {ok: false; code: string; error: string};

export type AdminSpaceResponse =
  | {ok: true; spaces: AdminSpaceRow[]}
  | {ok: false; spaces: AdminSpaceRow[]; code: string; error: string};

export type AdminResultsResponse =
  | {ok: true; rows: ResultRow[]}
  | {ok: false; code: string; error: string};

/** status 0은 요청 자체가 못 나간 경우다. */
interface FunctionCall {
  status: number;
  body: Record<string, unknown>;
}

async function callFunction(name: string, body: unknown): Promise<FunctionCall> {
  try {
    const response = await fetch(`${CONFIG.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.anonKey,
        Authorization: `Bearer ${CONFIG.anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const parsed = await response.json().catch(() => ({}));
    return {status: response.status, body: parsed as Record<string, unknown>};
  } catch {
    return {status: 0, body: {code: 'NETWORK_UNREACHABLE', error: unreachable(name)}};
  }
}

/**
 * fetch가 예외를 던졌을 때. 브라우저는 이유를 알려주지 않는다 — 진짜 네트워크 장애든
 * CORS 차단이든 똑같은 TypeError로 온다. 그래서 원인을 흔한 순서대로 같이 말해준다.
 *
 * ⚠ 함수를 배포하지 않았을 때도 여기로 떨어진다. Supabase 게이트웨이의 "함수 없음" 404는
 *   access-control-allow-headers에 content-type을 빼고 주는데, 우리는 JSON을 보내느라
 *   Content-Type을 달기 때문에 preflight에서 막힌다. 즉 브라우저는 404를 볼 기회조차 없다.
 *   여기서 네트워크 탓만 하면 배포를 잊은 사람이 사내망을 뒤지게 된다.
 */
function unreachable(name: string): string {
  return `스페이스 서버에 닿지 못했습니다. \`${name}\` Edge Function이 배포되지 않았거나, `
    + '네트워크가 막혀 있습니다 (사내망이라면 LTE로 바꿔서 다시 해보세요).';
}

/** 요청이 못 나갔을 때(status 0)는 callFunction이 이미 설명을 채워준다. */
const statusSuffix = (status: number) => (status ? ` (${status})` : '');

const failCode = (body: Record<string, unknown>, status: number) =>
  String(body.code || (status ? `HTTP_${status}` : 'NETWORK_UNREACHABLE'));

/**
 * 비밀번호나 공유 토큰을 서버에 확인시키고, 통과하면 스페이스 정보와 토큰을 받는다.
 * 검증은 전적으로 Edge Function에서 일어난다 — anon 키로는 spaces를 읽을 수 없다.
 */
export async function enterSpace(
  id: string,
  credentials: {token?: string; password?: string} = {}
): Promise<EnterResponse> {
  const {status, body} = await callFunction('spaces', {action: 'enter', id, ...credentials});
  if (status === 200 && body.ok) {
    return {
      ok: true,
      space: body.space as SpaceRow,
      token: String(body.token || ''),
      sharedWith: (body.sharedWith as SpaceSummary[]) || []
    };
  }
  const reason = (typeof body.reason === 'string' ? body.reason : 'error') as EnterReason;
  return {
    ok: false,
    reason,
    error: String(body.error || `스페이스에 들어가지 못했습니다${statusSuffix(status)}`)
  };
}

export async function createSpace(values: {
  name: string;
  password: string;
  iconId: string;
}): Promise<CreateSpaceResponse> {
  const {status, body} = await callFunction('spaces', {action: 'create', ...values});
  if (status === 201 && body.ok) {
    return {ok: true, space: body.space as SpaceRow, token: String(body.token || '')};
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `스페이스를 만들지 못했습니다${statusSuffix(status)}`)
  };
}

/** 최근 24시간 안에 참가 결과가 있는 잠긴 스페이스를 최근 활동순으로 불러온다. */
export async function fetchActiveSpaces(): Promise<ActiveSpacesResponse> {
  const {status, body} = await callFunction('spaces', {action: 'list-active'});
  if (status === 200 && body.ok) {
    return {ok: true, spaces: (body.spaces as ActiveSpaceRow[]) || []};
  }
  return {
    ok: false,
    spaces: [],
    code: failCode(body, status),
    error: String(body.error || `활성 스페이스를 불러오지 못했습니다${statusSuffix(status)}`)
  };
}

export async function checkSpaceName(name: string): Promise<SpaceNameCheckResponse> {
  const {status, body} = await callFunction('spaces', {action: 'check-name', name});
  if (status === 200 && body.ok) {
    return {
      ok: true,
      available: Boolean(body.available),
      code: typeof body.code === 'string' ? body.code : undefined,
      error: typeof body.error === 'string' ? body.error : undefined
    };
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `이름 중복을 확인하지 못했습니다${statusSuffix(status)}`)
  };
}

/** 관리자 비밀번호는 Edge Function에서만 검증하며 브라우저 설정에 포함하지 않는다. */
export async function adminSpaceRequest(
  action: 'list' | 'create' | 'update' | 'delete',
  password: string,
  values: {id?: string; name?: string; spacePassword?: string; iconId?: string} = {}
): Promise<AdminSpaceResponse> {
  const {status, body} = await callFunction('admin-spaces', {action, password, ...values});
  if (status !== 200) {
    return {
      ok: false,
      spaces: [],
      code: failCode(body, status),
      error: String(body.error || `관리자 요청 실패${statusSuffix(status)}`)
    };
  }
  return {ok: true, spaces: (body.spaces as AdminSpaceRow[]) || []};
}

/**
 * 한 스페이스의 참가자 데이터. 스페이스 비밀번호는 묻지 않는다 — 관리자 비밀번호가
 * 이미 모든 스페이스의 마스터 키다 (admin-spaces 함수 머리말).
 */
export async function adminSpaceResults(password: string, id: string): Promise<AdminResultsResponse> {
  const {status, body} = await callFunction('admin-spaces', {action: 'results', password, id});
  if (status !== 200) {
    return {
      ok: false,
      code: failCode(body, status),
      error: String(body.error || `참가자 데이터를 불러오지 못했습니다${statusSuffix(status)}`)
    };
  }
  return {ok: true, rows: (body.results as ResultRow[]) || []};
}

export async function saveResult(
  spaceId: string, token: string, result: NewResult
): Promise<SaveResponse> {
  const {status, body} = await callFunction('spaces', {
    action: 'save-result', id: spaceId, token, result
  });
  if (status === 200 && body.ok) return {ok: true, row: body.row as ResultRow};
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `결과를 저장하지 못했습니다${statusSuffix(status)}`)
  };
}

/** 시작 버튼의 빠른 확인. 실제 저장 경쟁은 DB unique 제약이 최종 차단한다. */
export async function checkNickname(
  spaceId: string, token: string, value: string
): Promise<NicknameCheckResponse> {
  const issue = validateNickname(value);
  if (issue) return {ok: false, code: issue.code, error: issue.message};

  const {status, body} = await callFunction('spaces', {
    action: 'check-nickname', id: spaceId, token, nickname: value.trim()
  });
  if (status === 200 && body.ok) {
    return {
      ok: true,
      available: Boolean(body.available),
      code: body.code === 'NICKNAME_DUPLICATE' ? 'NICKNAME_DUPLICATE' : undefined,
      error: typeof body.error === 'string' ? body.error : undefined
    };
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `닉네임을 확인하지 못했습니다${statusSuffix(status)}`)
  };
}

/**
 * 지도가 그릴 모든 것. sourceSpaceIds가 비어 있으면 단일 지도다.
 *
 * 권한이 없는 스페이스가 섞여 있으면 아무 데이터도 주지 않고 실패하되(fail closed),
 * 어떤 ID가 빠졌는지는 deniedSourceIds로 알려준다 — 열려 있던 화면이 스스로 줄어들
 * 수 있어야 하기 때문이다.
 */
export async function fetchMapResults(
  hostSpaceId: string, hostToken: string, sourceSpaceIds: readonly string[] = []
): Promise<MapFetchResponse> {
  const {status, body} = await callFunction('space-views', {
    action: 'fetch-results', hostSpaceId, hostToken, sourceSpaceIds
  });
  if (status === 200 && body.ok) {
    return {
      ok: true,
      rows: (body.rows as MapResultRow[]) || [],
      availableSources: (body.availableSources as AvailableSource[]) || [],
      pendingOffers: (body.pendingOffers as SpaceSummary[]) || []
    };
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `데이터를 불러오지 못했습니다${statusSuffix(status)}`),
    deniedSourceIds: Array.isArray(body.deniedSourceIds) ? body.deniedSourceIds as string[] : undefined
  };
}

// ── 공유 관리 ──────────────────────────────────────────────────────
// 전부 스페이스 비밀번호가 필요하다. 출입증으로는 아무것도 바꿀 수 없다.
//
// 공유는 양방향이다 — 수락하면 서로를 본다. 그래서 "누가 주고 누가 받나"가 아니라
// "누가 먼저 제안했나"(incoming)만 남는다.

export type ShareState = 'none' | 'pending' | 'active' | 'ended';

/** 공유 대상 목록의 한 줄. 화면은 state와 incoming으로 버튼을 고른다. */
export interface ShareCandidate extends SpaceSummary {
  state: ShareState;
  /** 상대가 먼저 제안했나. pending일 때 수락 버튼을 띄울지 정한다. */
  incoming: boolean;
}

export interface ShareView {
  space: SpaceSummary | null;
  state: ShareState;
  incoming: boolean;
  requested_at: string;
  accepted_at: string | null;
  visible_from: string | null;
}

export type ShareableResponse =
  | {ok: true; space: SpaceSummary; spaces: ShareCandidate[]; limit: number}
  | {ok: false; code: string; error: string};

export type ShareActionResponse =
  | {ok: true; share: ShareView}
  | {ok: false; code: string; error: string};

/**
 * 공유할 수 있는 스페이스 전부 + 지금 상태.
 *
 * ⚠ 이름과 입장 코드가 실려 온다. 비밀번호를 확인한 뒤에만 준다.
 * 검색은 브라우저가 이 목록 안에서 한다 — 타이핑마다 서버를 두드리지 않는다.
 */
export async function listShareableSpaces(
  spaceId: string, password: string
): Promise<ShareableResponse> {
  const {status, body} = await callFunction('space-views', {action: 'list-shareable', spaceId, password});
  if (status === 200 && body.ok) {
    return {
      ok: true,
      space: body.space as SpaceSummary,
      spaces: (body.spaces as ShareCandidate[]) || [],
      limit: Number(body.limit || 0)
    };
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `공유할 스페이스를 불러오지 못했습니다${statusSuffix(status)}`)
  };
}

async function shareAction(
  action: 'share' | 'accept' | 'unshare',
  spaceId: string,
  partnerSpaceId: string,
  password: string,
  failure: string
): Promise<ShareActionResponse> {
  const {status, body} = await callFunction('space-views', {action, spaceId, partnerSpaceId, password});
  if ((status === 200 || status === 201) && body.ok) {
    return {ok: true, share: body.share as ShareView};
  }
  return {
    ok: false,
    code: failCode(body, status),
    error: String(body.error || `${failure}${statusSuffix(status)}`)
  };
}

/** 공유 제안. 상대가 수락해야 발효된다. */
export const shareSpace = (spaceId: string, partnerSpaceId: string, password: string) =>
  shareAction('share', spaceId, partnerSpaceId, password, '공유를 제안하지 못했습니다');

/** 받은 제안 수락. 이 순간부터 서로 본다. */
export const acceptShare = (spaceId: string, partnerSpaceId: string, password: string) =>
  shareAction('accept', spaceId, partnerSpaceId, password, '공유를 수락하지 못했습니다');

/** 제안 취소·거절·공유 종료가 모두 같은 일이다. 양쪽 다 할 수 있다. */
export const unshareSpace = (spaceId: string, partnerSpaceId: string, password: string) =>
  shareAction('unshare', spaceId, partnerSpaceId, password, '공유를 해제하지 못했습니다');
