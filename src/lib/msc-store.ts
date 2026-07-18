// MSC 결과 로컬 보관소 (MVP). 서버로 가지 않는다.
//
// DISC(개성)의 answer-store.ts와는 별개의 네임스페이스다 — 저장 구조와 상한이 달라
// 섞지 않는다. MVP에서 MSC는 서버 스페이스가 없으므로, "그룹 지도"는 이 기기에서
// 완료한 전원(done)을 좌뇌/우뇌 휠에 뿌리는 것으로 대신한다 (프로젝터 워크숍 모델).
//
//   draft   진행 중인 한 벌. 새로고침·강제 종료에서 살아남는다. 언제나 0~1벌.
//   done    이 기기에서 끝낸 전원. 닉네임이 같으면 다시 답한 것으로 보고 갈아끼운다.

import {INDICATORS, MSC_ORDER, MSC_PAGES, MSC_Q, MSC_SCALE} from '../tests/msc/data.ts';
import type {DimKey, MscResult, MscTypeCode} from '../tests/msc/data.ts';
import {NICKNAME_MAX} from './nickname-rules.ts';

const KEY = 'msc:results:v2';

/** 한 기기에 담아둘 완료 인원 상한. 서버 스페이스 정원(200)과 맞춘다. */
export const MSC_DONE_MAX = 200;

export interface MscDraft {
  nickname: string;
  answers: number[];
  page: number;
  updatedAt: number;
}

/** 휠·목록에 필요한 값만 추린 완료 한 벌. 채점 근거(answers)까지 함께 보관한다. */
export interface MscDone {
  id: string;
  nickname: string;
  answers: number[];
  code: string;
  primary: MscTypeCode;
  scores: Record<MscTypeCode, number>;
  angle: number;
  radius: number;
  levels: Record<DimKey, number>;
  completedAt: number;
}

export interface MscStore {
  draft: MscDraft | null;
  done: MscDone[];
}

const EMPTY: MscStore = {draft: null, done: []};

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};

/** 0 = 미응답. 척도를 벗어난 값은 전부 미응답으로 본다. */
function sanitizeAnswers(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== MSC_Q.length) return null;
  return raw.map(value => {
    const answer = Number(value);
    return Number.isInteger(answer) && answer >= 1 && answer <= MSC_SCALE.length ? answer : 0;
  });
}

function sanitizeDraft(raw: unknown): MscDraft | null {
  const data = asRecord(raw);
  const answers = sanitizeAnswers(data.answers);
  const nickname = String(data.nickname || '').slice(0, NICKNAME_MAX);
  if (!answers || !answers.some(Boolean) || !nickname) return null;

  const page = Number(data.page);
  return {
    nickname,
    answers,
    page: Math.min(Math.max(0, Number.isInteger(page) ? page : 0), MSC_PAGES - 1),
    updatedAt: Number(data.updatedAt) || 0
  };
}

function sanitizeScores(raw: unknown): Record<MscTypeCode, number> | null {
  const data = asRecord(raw);
  const scores = {} as Record<MscTypeCode, number>;
  for (const code of MSC_ORDER) {
    const value = Number(data[code]);
    if (!Number.isFinite(value)) return null;
    scores[code] = value;
  }
  return scores;
}

function sanitizeDone(raw: unknown): MscDone | null {
  const data = asRecord(raw);
  const answers = sanitizeAnswers(data.answers);
  const nickname = String(data.nickname || '').slice(0, NICKNAME_MAX);
  const code = String(data.code || '');
  const primary = String(data.primary || '') as MscTypeCode;
  const scores = sanitizeScores(data.scores);
  const id = String(data.id || '');

  if (!answers || answers.some(answer => !answer)) return null;
  if (!id || !nickname || !code || !scores || !MSC_ORDER.includes(primary)) return null;

  const rawLevels = asRecord(data.levels);
  const levels = {} as Record<DimKey, number>;
  for (const ind of INDICATORS) {
    levels[ind.key] = Math.max(0, Math.min(3, Number(rawLevels[ind.key]) || 0));
  }
  return {
    id,
    nickname,
    answers,
    code,
    primary,
    scores,
    angle: Number(data.angle) || 0,
    radius: Math.max(0, Math.min(1, Number(data.radius) || 0)),
    levels,
    completedAt: Number(data.completedAt) || 0
  };
}

export function sanitizeMscStore(raw: unknown): MscStore {
  const data = asRecord(raw);
  const list = Array.isArray(data.done) ? data.done : [];
  const done: MscDone[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const set = sanitizeDone(item);
    if (!set || seen.has(set.nickname)) continue;
    seen.add(set.nickname);
    done.push(set);
    if (done.length === MSC_DONE_MAX) break;
  }

  return {draft: sanitizeDraft(data.draft), done};
}

export function loadMscStore(): MscStore {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitizeMscStore(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeStore(store: MscStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 저장을 못 해도 이번 세션은 그대로 진행된다
  }
}

export function saveMscDraft(draft: MscDraft): void {
  writeStore({...loadMscStore(), draft});
}

export function clearMscDraft(): void {
  writeStore({...loadMscStore(), draft: null});
}

/** 완료 시 draft를 비우고 done에 넣는다. 같은 닉네임은 최신 것으로 갈아끼운다. */
export function saveMscResult(
  entry: {id: string; nickname: string; answers: number[]; result: MscResult; completedAt: number}
): void {
  const {done} = loadMscStore();
  const {result} = entry;
  const set: MscDone = {
    id: entry.id,
    nickname: entry.nickname,
    answers: entry.answers,
    code: result.code,
    primary: result.primary,
    scores: result.scores,
    angle: result.angle,
    radius: result.radius,
    levels: result.levels,
    completedAt: entry.completedAt
  };
  const next = [set, ...done.filter(item => item.nickname !== set.nickname)].slice(0, MSC_DONE_MAX);
  writeStore({draft: null, done: next});
}

/** 되돌릴 수 없다. 부르기 전에 사용자에게 확인을 받을 것. */
export function deleteMscResult(id: string): void {
  const {draft, done} = loadMscStore();
  writeStore({draft, done: done.filter(set => set.id !== id)});
}

/** 이 기기의 MSC 기록 전체를 비운다. */
export function clearMscAll(): void {
  writeStore(EMPTY);
}
