import {rel} from '../../assets/data.ts';
import type {Relation} from '../../assets/data.ts';
import type {MapResultRow, ResultRow} from './db.ts';

export interface RelationGroup {
  kind: Relation;
  label: string;
  names: string[];
}

type MapCoordinate = Pick<ResultRow, 'id' | 'x' | 'y'>;
type MapPrimaryType = Pick<ResultRow, 'id' | 'primary_type'>;

export const RELATION_LABEL: Record<Relation, string> = {
  good: '통하는 사이',
  bad: '설명이 필요한 사이',
  same: '같은 유형'
};

export const RELATION_ORDER: Relation[] = ['good', 'bad', 'same'];

/** 함께보기에서 사람을 가리키는 이름. 밖에서 온 사람만 스페이스를 앞에 붙인다. */
export function personLabel(
  row: Pick<MapResultRow, 'room' | 'nickname' | 'source_space'>,
  hostSpaceId: string
): string {
  if (row.room === hostSpaceId) return row.nickname;
  return `${row.source_space?.name || row.room} · ${row.nickname}`;
}

/**
 * 선택한 참가자를 기준으로 빈 관계를 제외한 표시 그룹을 만든다.
 *
 * 함께보기에서는 같은 닉네임이 여러 스페이스에 있을 수 있다. 이름만 늘어놓으면
 * "보리, 보리"가 되어 누구를 말하는지 알 수 없으므로, 밖에서 온 사람에게는
 * 스페이스를 붙인다.
 */
export function relationGroups(
  row: MapResultRow, rows: MapResultRow[], hostSpaceId: string
): RelationGroup[] {
  const names: Record<Relation, string[]> = {good: [], bad: [], same: []};

  rows.forEach(other => {
    if (other.id === row.id) return;
    names[rel(row.primary_type, other.primary_type)].push(personLabel(other, hostSpaceId));
  });

  return RELATION_ORDER.flatMap(kind => names[kind].length
    ? [{kind, label: RELATION_LABEL[kind], names: names[kind]}]
    : []
  );
}

/**
 * 선택한 사람에게서 뻗는 관계선. 거리로 자르지 않고 모두와 잇되, 켜둔 관계만 남긴다 —
 * 몇 명까지 볼지가 아니라 어떤 사이를 볼지가 지도를 읽는 축이다.
 */
export function relationLinks<T extends MapPrimaryType>(
  selected: T,
  rows: readonly T[],
  kinds: readonly Relation[]
): Array<{row: T; kind: Relation}> {
  const on = new Set(kinds);
  return rows.flatMap(row => {
    if (row.id === selected.id) return [];
    const kind = rel(selected.primary_type, row.primary_type);
    return on.has(kind) ? [{row, kind}] : [];
  });
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
