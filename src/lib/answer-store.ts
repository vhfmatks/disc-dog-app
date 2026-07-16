// 이 브라우저에만 남는 응답 보관소 — done 열 벌 + draft 한 벌.
//
//   draft   진행 중인 한 벌. 새로고침하거나 실수로 닫아도 60문항을 처음부터 다시
//           답하지 않게 한다. 다 풀면 그 자리에서 done으로 옮겨간다. 그래서 언제나 0~1벌이다.
//           done 상한과는 무관하다 — 서로 다른 칸이다.
//   done    끝낸 응답 최근 10벌. 같은 사람이 다음 세미나에서 다른 스페이스에 들어왔을 때
//           60문항을 또 답하는 대신 골라서 그대로 낼 수 있다. 넘치면 오래된 것부터 지운다.
//
// sessionStorage가 아니라 localStorage인 이유가 전부다 — 탭을 닫아도 남아야 한다.
// 담기는 건 닉네임과 응답뿐이고, 이 보관소는 서버로 가지 않는다.

import {ORDER, PAGES, Q, SCALE} from '../../assets/data.ts';
import type {TypeCode} from '../../assets/data.ts';
import {NICKNAME_MAX} from './nickname-rules.ts';

const KEY = 'dogtype:answers:v1';

/** 완료 세트 상한. draft는 여기에 들어가지 않으므로 이 브라우저가 갖는 세트는 최대 11벌이다. */
export const DONE_MAX = 10;

/** db.ts의 SPACE_NAME_MAX와 같은 값. db.ts를 부르면 Supabase 클라이언트까지 딸려온다. */
const SPACE_NAME_MAX = 50;

export interface Draft {
  spaceId: string;
  spaceName: string;
  nickname: string;
  answers: number[];
  page: number;
  updatedAt: number;
}

export interface DoneSet {
  spaceId: string;
  spaceName: string;
  nickname: string;
  /** 60문항 응답 전부. 재사용할 때는 언제나 이걸로 다시 채점한다. */
  answers: number[];
  /** 그때 받은 결과. 목록에 보여줄 용도이며, 채점의 근거는 항상 answers다. */
  code: string;
  primary: TypeCode;
  completedAt: number;
}

export interface AnswerStore {
  draft: Draft | null;
  /** 최근 순. spaceId는 겹치지 않는다 — 같은 스페이스를 다시 하면 새 응답이 예전 것을 대신한다. */
  done: DoneSet[];
}

const EMPTY: AnswerStore = {draft: null, done: []};

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

/** 0 = 미응답. 척도를 벗어난 값은 전부 미응답으로 본다. */
function sanitizeAnswers(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== Q.length) return null;
  return raw.map(value => {
    const answer = Number(value);
    return Number.isInteger(answer) && answer >= 1 && answer <= SCALE.length ? answer : 0;
  });
}

/** 한 문항도 답하지 않았으면 이어할 것이 없다 — 그건 draft가 아니라 빈칸이다. */
function sanitizeDraft(raw: unknown): Draft | null {
  const data = asRecord(raw);
  const answers = sanitizeAnswers(data.answers);
  const spaceId = String(data.spaceId || '');
  const nickname = String(data.nickname || '').slice(0, NICKNAME_MAX);
  if (!answers || !answers.some(Boolean) || !spaceId || !nickname) return null;

  const page = Number(data.page);
  return {
    spaceId,
    spaceName: String(data.spaceName || spaceId).slice(0, SPACE_NAME_MAX),
    nickname,
    answers,
    page: Math.min(Math.max(0, Number.isInteger(page) ? page : 0), PAGES - 1),
    updatedAt: Number(data.updatedAt) || 0
  };
}

/** 완료 세트는 60문항이 다 채워져 있어야 한다 — 빈칸이 있으면 재사용해도 결과가 안 나온다. */
function sanitizeDoneSet(raw: unknown): DoneSet | null {
  const data = asRecord(raw);
  const answers = sanitizeAnswers(data.answers);
  const spaceId = String(data.spaceId || '');
  const nickname = String(data.nickname || '').slice(0, NICKNAME_MAX);
  const code = String(data.code || '');
  const primary = String(data.primary || '') as TypeCode;

  if (!answers || answers.some(answer => !answer)) return null;
  if (!spaceId || !nickname || !code || !ORDER.includes(primary)) return null;

  return {
    spaceId,
    spaceName: String(data.spaceName || spaceId).slice(0, SPACE_NAME_MAX),
    nickname,
    answers,
    code,
    primary,
    completedAt: Number(data.completedAt) || 0
  };
}

/** 남의 손을 탔거나 예전 버전이 쓴 값이 들어와도 화면이 깨지지 않을 만큼만 남긴다. */
export function sanitizeStore(raw: unknown): AnswerStore {
  const data = asRecord(raw);
  const list = Array.isArray(data.done) ? data.done : [];
  const done: DoneSet[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const set = sanitizeDoneSet(item);
    if (!set || seen.has(set.spaceId)) continue;
    seen.add(set.spaceId);
    done.push(set);
    if (done.length === DONE_MAX) break;
  }

  return {draft: sanitizeDraft(data.draft), done};
}

/** 최근이 앞. 같은 스페이스의 예전 응답은 밀어내고, 넘치면 제일 오래된 것부터 버린다. */
export function insertDoneSet(done: DoneSet[], set: DoneSet): DoneSet[] {
  return [set, ...done.filter(item => item.spaceId !== set.spaceId)].slice(0, DONE_MAX);
}

/** 새 스페이스 응답을 더했을 때 프로필에서 밀려날 가장 오래된 세트. */
export function doneSetToEvict(done: DoneSet[], spaceId: string): DoneSet | null {
  if (done.length < DONE_MAX || done.some(set => set.spaceId === spaceId)) return null;
  return done.at(-1) ?? null;
}

export function loadStore(): AnswerStore {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeStore(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;   // 시크릿 모드, 저장소 차단, 깨진 JSON — 전부 "없음"으로 본다
  }
}

function writeStore(store: AnswerStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 저장을 못 해도 이번 세션은 그대로 진행된다
  }
}

export function saveDraft(draft: Draft): void {
  writeStore({...loadStore(), draft});
}

export function clearDraft(): void {
  writeStore({...loadStore(), draft: null});
}

/**
 * 이 스페이스를 다 풀었으면 여기서 이어할 것은 없다 — draft를 완료 세트로 옮긴다.
 * 단 다른 스페이스에서 풀던 한 벌은 건드리지 않는다. B에서 결과를 냈다고 해서
 * A에서 30문항까지 답해둔 게 사라질 이유가 없다.
 */
export function saveDoneSet(set: DoneSet): void {
  const {draft, done} = loadStore();
  const elsewhere = draft && draft.spaceId !== set.spaceId ? draft : null;
  writeStore({draft: elsewhere, done: insertDoneSet(done, set)});
}

/** 되돌릴 수 없다. 부르기 전에 사용자에게 반드시 확인을 받을 것. */
export function deleteDoneSet(spaceId: string): void {
  const {draft, done} = loadStore();
  writeStore({draft, done: done.filter(set => set.spaceId !== spaceId)});
}

/** 목록에 붙이는 짧은 시각. now를 받는 건 테스트 때문이다. */
export function formatWhen(timestamp: number, now = Date.now()): string {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const diff = now - timestamp;

  if (diff < minute) return '방금';
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < 2 * day) return '어제';
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`;
  return new Date(timestamp).toLocaleDateString('ko-KR', {month: 'long', day: 'numeric'});
}
