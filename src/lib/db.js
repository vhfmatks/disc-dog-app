import {createClient} from '@supabase/supabase-js';
import {CONFIG} from '../config.js';

const COLUMNS = 'id,room,nickname,code,primary_type,totals,charm,bark,x,y,created_at';

const client = createClient(CONFIG.url, CONFIG.anonKey, {
  auth: {persistSession: false},
  realtime: {params: {eventsPerSecond: 5}}
});

function friendly(raw) {
  const msg = String(raw?.message || raw || '');
  if (/failed to fetch|networkerror|load failed|fetch failed|typeerror/i.test(msg)) {
    return '네트워크에 연결하지 못했습니다. 사내망이 막고 있을 수 있어요 — LTE로 바꿔서 다시 해보세요.';
  }
  if (/results_charm_check/i.test(msg)) {
    return '데이터베이스가 아직 40문항 점수 범위를 사용 중입니다. schema.sql의 60문항 마이그레이션을 적용해주세요.';
  }
  if (/row-level security|permission denied/i.test(msg)) {
    return '저장 권한이 없습니다. RLS 정책을 확인하세요.';
  }
  if (/정원|cap/i.test(msg)) return '이 방의 정원(200명)이 찼습니다.';
  if (/duplicate|unique/i.test(msg)) return '이미 제출된 결과입니다.';
  return msg || '알 수 없는 오류';
}

export async function saveResult(row) {
  try {
    const {data, error} = await client
      .from('results')
      .insert(row)
      .select(COLUMNS)
      .single();

    if (error) return {ok: false, error: friendly(error)};
    return {ok: true, row: data};
  } catch (error) {
    return {ok: false, error: friendly(error)};
  }
}

export async function fetchRoom(room) {
  try {
    const {data, error} = await client
      .from('results')
      .select(COLUMNS)
      .eq('room', room)
      .order('created_at', {ascending: true});

    if (error) return {ok: false, rows: [], error: friendly(error)};
    return {ok: true, rows: data || []};
  } catch (error) {
    return {ok: false, rows: [], error: friendly(error)};
  }
}

export function watchRoom(room, onInsert, onStatus) {
  const channel = client
    .channel(`room:${room}`)
    .on(
      'postgres_changes',
      {event: 'INSERT', schema: 'public', table: 'results', filter: `room=eq.${room}`},
      payload => onInsert(payload.new)
    )
    .subscribe(status => onStatus?.(status));

  return () => client.removeChannel(channel);
}

