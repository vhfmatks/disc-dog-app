import {rel} from '../../assets/data.ts';
import type {Relation} from '../../assets/data.ts';
import type {ResultRow} from './db.ts';

export interface RelationGroup {
  kind: Relation;
  label: string;
  names: string[];
}

type MapCoordinate = Pick<ResultRow, 'id' | 'x' | 'y'>;

const RELATION_LABEL: Record<Relation, string> = {
  good: '통하는 사이',
  bad: '설명이 필요한 사이',
  same: '같은 유형'
};

const RELATION_ORDER: Relation[] = ['good', 'bad', 'same'];

/** 선택한 참가자를 기준으로 빈 관계를 제외한 표시 그룹을 만든다. */
export function relationGroups(row: ResultRow, rows: ResultRow[]): RelationGroup[] {
  const names: Record<Relation, string[]> = {good: [], bad: [], same: []};

  rows.forEach(other => {
    if (other.id !== row.id) names[rel(row.primary_type, other.primary_type)].push(other.nickname);
  });

  return RELATION_ORDER.flatMap(kind => names[kind].length
    ? [{kind, label: RELATION_LABEL[kind], names: names[kind]}]
    : []
  );
}

/**
 * 화면 비율이 아니라 DISC의 두 축을 같은 비중으로 보고 가장 먼 참가자 쌍을 찾는다.
 * 거리가 같으면 id가 빠른 쌍을 골라 입력 순서와 관계없이 결과를 고정한다.
 */
export function farthestPair<T extends MapCoordinate>(rows: readonly T[]): [T, T] | null {
  if (rows.length < 2) return null;

  const ordered = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let best: [T, T] | null = null;
  let bestDistance = -1;

  for (let left = 0; left < ordered.length - 1; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      // 점수 좌표는 소수 넷째 자리까지 저장된다. 정수로 바꿔 동률 비교를 정확하게 한다.
      const dx = Math.round(ordered[left].x * 10_000) - Math.round(ordered[right].x * 10_000);
      const dy = Math.round(ordered[left].y * 10_000) - Math.round(ordered[right].y * 10_000);
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [ordered[left], ordered[right]];
      }
    }
  }

  return best;
}
