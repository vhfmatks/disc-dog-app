import {createClient} from '@supabase/supabase-js';
import {CONFIG} from '../config.ts';
import type {Totals, TypeCode} from '../../assets/data.ts';
import {isNicknameUniqueViolation, isResultIdUniqueViolation, validateNickname} from './nickname-rules.ts';

export {SPACE_NAME_MAX, SPACE_PASSWORD_MAX, SPACE_PASSWORD_MIN} from './space-rules.ts';

const COLUMNS = 'id,room,nickname,code,primary_type,totals,charm,bark,x,y,created_at';

/** 스페이스에서 브라우저가 볼 수 있는 전부. 비밀번호 해시와 공유 토큰은 서버에만 있다. */
export interface SpaceRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** 관리자 화면은 초대 링크를 만들어야 해서 공유 토큰까지 받는다. */
export interface AdminSpaceRow extends SpaceRow {
  share_token: string;
  has_password: boolean;
  /** 살아 있는 참가자 수. 서버가 세지 못했으면 null — 0명과 구분한다. */
  result_count: number | null;
}

/** results 테이블에서 읽어오는 행. expires_at은 조회하지 않는다 (schema.sql). */
export interface ResultRow {
  id: string;
  room: string;
  nickname: string;
  code: string;
  primary_type: TypeCode;
  /** 채점 버전이 다른 행이 24시간 동안 남아 있을 수 있어 _version으로 구분한다. */
  totals: Totals & {_version?: number};
  charm: number;
  bark: number;
  x: number;
  y: number;
  created_at: string;
}

/** created_at·expires_at은 DB 기본값이 채운다. id는 재시도 멱등성을 위해 클라이언트가 고정할 수 있다. */
export type NewResultRow = Omit<ResultRow, 'id' | 'created_at'> & {id?: string};

export type SaveResponse =
  | {ok: true; row: ResultRow}
  | {ok: false; code: string; error: string};

export type FetchResponse =
  | {ok: true; rows: ResultRow[]}
  | {ok: false; rows: ResultRow[]; error: string};

export type EnterReason = 'password-required' | 'password-wrong' | 'not-found' | 'rate-limited' | 'error';

export type EnterResponse =
  | {ok: true; space: SpaceRow; token: string}
  | {ok: false; reason: EnterReason; error: string};

export type CreateSpaceResponse =
  | {ok: true; space: SpaceRow; token: string}
  | {ok: false; code: string; error: string};

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

const client = createClient(CONFIG.url, CONFIG.anonKey, {
  auth: {persistSession: false},
  realtime: {params: {eventsPerSecond: 5}}
});

function friendly(raw: unknown): string {
  const msg = String((raw as {message?: string} | null)?.message || raw || '');
  if (/failed to fetch|networkerror|load failed|fetch failed|typeerror/i.test(msg)) {
    return '네트워크에 연결하지 못했습니다. 사내망이 막고 있을 수 있어요 — LTE로 바꿔서 다시 해보세요.';
  }
  if (/results_charm_check/i.test(msg)) {
    return '데이터베이스가 아직 40문항 점수 범위를 사용 중입니다. schema.sql의 60문항 마이그레이션을 적용해주세요.';
  }
  if (/results_room_space_fkey|foreign key/i.test(msg)) {
    return '이 스페이스가 삭제되었거나 존재하지 않습니다. 만든 사람에게 새 초대 링크를 받아주세요.';
  }
  if (/public\.spaces|schema cache/i.test(msg)) {
    return '스페이스 기능이 아직 데이터베이스에 적용되지 않았습니다. 새 schema.sql을 실행해주세요.';
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return '저장 권한이 없습니다. RLS 정책을 확인하세요.';
  }
  if (/정원|cap/i.test(msg)) return '이 방의 정원(200명)이 찼습니다.';
  if (/duplicate|unique/i.test(msg)) return '이미 제출된 결과입니다.';
  return msg || '알 수 없는 오류';
}

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
    return {ok: true, space: body.space as SpaceRow, token: String(body.token || '')};
  }
  const reason = (typeof body.reason === 'string' ? body.reason : 'error') as EnterReason;
  return {
    ok: false,
    reason,
    error: String(body.error || `스페이스에 들어가지 못했습니다${statusSuffix(status)}`)
  };
}

export async function createSpace(values: {name: string; password: string}): Promise<CreateSpaceResponse> {
  const {status, body} = await callFunction('spaces', {action: 'create', ...values});
  if (status === 201 && body.ok) {
    return {ok: true, space: body.space as SpaceRow, token: String(body.token || '')};
  }
  return {
    ok: false,
    code: String(body.code || (status ? `HTTP_${status}` : 'NETWORK_UNREACHABLE')),
    error: String(body.error || `스페이스를 만들지 못했습니다${statusSuffix(status)}`)
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
    code: String(body.code || (status ? `HTTP_${status}` : 'NETWORK_UNREACHABLE')),
    error: String(body.error || `이름 중복을 확인하지 못했습니다${statusSuffix(status)}`)
  };
}

/** 관리자 비밀번호는 Edge Function에서만 검증하며 브라우저 설정에 포함하지 않는다. */
export async function adminSpaceRequest(
  action: 'list' | 'create' | 'update' | 'delete',
  password: string,
  values: {id?: string; name?: string; spacePassword?: string} = {}
): Promise<AdminSpaceResponse> {
  const {status, body} = await callFunction('admin-spaces', {action, password, ...values});
  if (status !== 200) {
    return {
      ok: false,
      spaces: [],
      code: String(body.code || (status ? `HTTP_${status}` : 'NETWORK_UNREACHABLE')),
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
      code: String(body.code || (status ? `HTTP_${status}` : 'NETWORK_UNREACHABLE')),
      error: String(body.error || `참가자 데이터를 불러오지 못했습니다${statusSuffix(status)}`)
    };
  }
  return {ok: true, rows: (body.results as ResultRow[]) || []};
}

export async function saveResult(row: NewResultRow): Promise<SaveResponse> {
  const findCommittedSubmission = async (): Promise<ResultRow | null> => {
    if (!row.id) return null;
    const {data, error} = await client.from('results').select(COLUMNS).eq('id', row.id).maybeSingle();
    if (error || !data) return null;
    const existing = data as ResultRow;
    return existing.room === row.room
      && existing.nickname === row.nickname
      && existing.code === row.code
      && existing.primary_type === row.primary_type
      ? existing
      : null;
  };

  try {
    const {data, error} = await client
      .from('results')
      .insert(row)
      .select(COLUMNS)
      .single();

    if (error) {
      if (isResultIdUniqueViolation(error)) {
        const committed = await findCommittedSubmission();
        if (committed) return {ok: true, row: committed};
      }
      if (isNicknameUniqueViolation(error)) {
        return {
          ok: false,
          code: 'NICKNAME_DUPLICATE',
          error: '이 스페이스에서 이미 사용 중인 닉네임입니다.'
        };
      }
      return {ok: false, code: `DB_${error.code || 'SAVE_FAILED'}`, error: friendly(error)};
    }
    return {ok: true, row: data as ResultRow};
  } catch (error) {
    const committed = await findCommittedSubmission().catch(() => null);
    if (committed) return {ok: true, row: committed};
    return {ok: false, code: 'NETWORK_UNREACHABLE', error: friendly(error)};
  }
}

/** 시작 버튼의 빠른 확인. 실제 저장 경쟁은 DB unique 제약이 최종 차단한다. */
export async function checkNickname(room: string, value: string): Promise<NicknameCheckResponse> {
  const issue = validateNickname(value);
  if (issue) return {ok: false, code: issue.code, error: issue.message};

  try {
    const {data, error} = await client
      .from('results')
      .select('id')
      .eq('room', room)
      .eq('nickname', value.trim())
      .limit(1);

    if (error) return {ok: false, code: 'NICKNAME_CHECK_FAILED', error: friendly(error)};
    if ((data || []).length > 0) {
      return {
        ok: true,
        available: false,
        code: 'NICKNAME_DUPLICATE',
        error: '이 스페이스에서 이미 사용 중인 닉네임입니다.'
      };
    }
    return {ok: true, available: true};
  } catch (error) {
    return {ok: false, code: 'NETWORK_UNREACHABLE', error: friendly(error)};
  }
}

export async function fetchRoom(room: string): Promise<FetchResponse> {
  try {
    const {data, error} = await client
      .from('results')
      .select(COLUMNS)
      .eq('room', room)
      .order('created_at', {ascending: true});

    if (error) return {ok: false, rows: [], error: friendly(error)};
    return {ok: true, rows: (data || []) as ResultRow[]};
  } catch (error) {
    return {ok: false, rows: [], error: friendly(error)};
  }
}

export function watchRoom(
  room: string,
  onInsert: (row: ResultRow) => void,
  onStatus?: (status: string) => void
): () => void {
  const channel = client
    .channel(`room:${room}`)
    .on(
      'postgres_changes',
      {event: 'INSERT', schema: 'public', table: 'results', filter: `room=eq.${room}`},
      payload => onInsert(payload.new as ResultRow)
    )
    .subscribe(status => onStatus?.(status));

  return () => {
    client.removeChannel(channel);
  };
}
