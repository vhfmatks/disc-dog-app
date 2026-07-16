import {createClient} from '@supabase/supabase-js';
import {CONFIG} from '../config.ts';
import type {Totals, TypeCode} from '../../assets/data.ts';

const COLUMNS = 'id,room,nickname,code,primary_type,totals,charm,bark,x,y,created_at';
const GROUP_COLUMNS = 'id,name,created_at,updated_at';

export interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
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

/** id·created_at·expires_at은 DB 기본값이 채운다. */
export type NewResultRow = Omit<ResultRow, 'id' | 'created_at'>;

export type SaveResponse =
  | {ok: true; row: ResultRow}
  | {ok: false; error: string};

export type FetchResponse =
  | {ok: true; rows: ResultRow[]}
  | {ok: false; rows: ResultRow[]; error: string};

export type GroupResponse =
  | {ok: true; group: GroupRow | null}
  | {ok: false; group: null; error: string};

export type AdminGroupResponse =
  | {ok: true; groups: GroupRow[]}
  | {ok: false; groups: GroupRow[]; error: string};

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
  if (/results_room_group_fkey|foreign key/i.test(msg)) {
    return '이 그룹이 삭제되었거나 존재하지 않습니다. 관리자에게 새 참가 링크를 받아주세요.';
  }
  if (/public\.groups|schema cache/i.test(msg)) {
    return '그룹 기능이 아직 데이터베이스에 적용되지 않았습니다. 새 schema.sql을 실행해주세요.';
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return '저장 권한이 없습니다. RLS 정책을 확인하세요.';
  }
  if (/정원|cap/i.test(msg)) return '이 방의 정원(200명)이 찼습니다.';
  if (/duplicate|unique/i.test(msg)) return '이미 제출된 결과입니다.';
  return msg || '알 수 없는 오류';
}

export async function saveResult(row: NewResultRow): Promise<SaveResponse> {
  try {
    const {data, error} = await client
      .from('results')
      .insert(row)
      .select(COLUMNS)
      .single();

    if (error) return {ok: false, error: friendly(error)};
    return {ok: true, row: data as ResultRow};
  } catch (error) {
    return {ok: false, error: friendly(error)};
  }
}

export async function fetchGroup(groupId: string): Promise<GroupResponse> {
  try {
    const {data, error} = await client
      .from('groups')
      .select(GROUP_COLUMNS)
      .eq('id', groupId)
      .maybeSingle();

    if (error) return {ok: false, group: null, error: friendly(error)};
    return {ok: true, group: data as GroupRow | null};
  } catch (error) {
    return {ok: false, group: null, error: friendly(error)};
  }
}

/** 관리자 비밀번호는 Edge Function에서만 검증하며 브라우저 설정에 포함하지 않는다. */
export async function adminGroupRequest(
  action: 'list' | 'create' | 'update' | 'delete',
  password: string,
  values: {id?: string; name?: string} = {}
): Promise<AdminGroupResponse> {
  try {
    const response = await fetch(`${CONFIG.url}/functions/v1/admin-groups`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.anonKey,
        Authorization: `Bearer ${CONFIG.anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({action, password, ...values})
    });
    const body = await response.json().catch(() => ({})) as {groups?: GroupRow[]; error?: string};
    if (!response.ok) {
      return {ok: false, groups: [], error: body.error || `관리자 요청 실패 (${response.status})`};
    }
    return {ok: true, groups: body.groups || []};
  } catch (error) {
    return {ok: false, groups: [], error: friendly(error)};
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
