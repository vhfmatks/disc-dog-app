// 함께보기 권한 판정. DB도 네트워크도 모르는 순수 함수만 둡니다 —
// 권한 규칙은 눈으로 읽어 확신할 수 있어야 하고, 테스트도 그래야 하기 때문입니다.
//
// **공유는 양방향입니다.** 한쪽이 제안하고 다른 쪽이 수락하면 서로를 봅니다.
// 그래서 "누가 source고 누가 viewer인가"라는 물음이 없습니다 — 두 스페이스가 있을 뿐이고,
// 그 사이의 공유는 하나뿐입니다. 사전순 정렬쌍으로 저장하는 이유입니다.
//
// 전이는 여전히 없습니다: A–B와 B–C가 있어도 A는 C를 못 봅니다. 이 파일에 그런 규칙이
// 없다는 게 곧 보장입니다.

import {validSpaceId} from './spaces.ts';

/** DB의 space_shares 한 행. space_a < space_b가 항상 참이다. */
export interface SpaceShare {
  space_a: string;
  space_b: string;
  requested_by: string;
  requested_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export type ShareState = 'pending' | 'active' | 'ended';

/** 함께보기 한 번에 고를 수 있는 상대 스페이스 수. 내 스페이스까지 하면 10개. */
export const MAX_SOURCES = 9;

/**
 * 한 번에 돌려주는 결과 행의 총량. 스페이스당 정원이 200명이라 10개를 꽉 채우면
 * 2,000행이 됩니다. 지도가 읽히지도 않을뿐더러 함수 응답으로도 과합니다.
 *
 * 이 상한은 최후 방어선입니다. 정상 경로에서는 선택 화면이 스페이스별 인원수를 미리
 * 보여주고 넘는 조합을 못 고르게 막습니다.
 */
export const MAX_ROWS = 1_200;

/** 공유 목록에 한 번에 실어 보내는 스페이스 수. 검색은 브라우저가 이 안에서 한다. */
export const MAX_SHAREABLE = 200;

/** 두 스페이스를 사전순 정렬쌍으로. 저장·조회의 유일한 형태다. */
export function pairKey(one: string, other: string): [string, string] {
  return one < other ? [one, other] : [other, one];
}

/** 이 공유가 나와 상관있나. 아래 판정 함수들이 남의 공유를 잘못 읽지 않게 막는다. */
export function involves(share: Pick<SpaceShare, 'space_a' | 'space_b'>, me: string): boolean {
  return share.space_a === me || share.space_b === me;
}

/**
 * 이 공유에서 나의 상대.
 *
 * ⚠ 내가 낀 공유여야 한다 (involves). 아니면 엉뚱한 쪽을 돌려준다 — B–C 공유를 A로
 *   물으면 B가 나온다. 권한을 판정하는 쪽에서 그 값을 믿으면 A가 B를 볼 수 있다고
 *   착각한다. 그래서 아래 두 함수는 involves로 먼저 거른다.
 */
export function partnerOf(share: Pick<SpaceShare, 'space_a' | 'space_b'>, me: string): string {
  return share.space_a === me ? share.space_b : share.space_a;
}

export function shareState(share: Pick<SpaceShare, 'accepted_at' | 'revoked_at'>): ShareState {
  if (share.revoked_at) return 'ended';
  return share.accepted_at ? 'active' : 'pending';
}

export const isActive = (share: Pick<SpaceShare, 'accepted_at' | 'revoked_at'>) =>
  shareState(share) === 'active';

/** 내가 받은 제안인가 (= 수락 버튼을 띄울 쪽인가). */
export const isIncoming = (share: Pick<SpaceShare, 'requested_by'>, me: string) =>
  share.requested_by !== me;

export type SourceListIssue =
  | {code: 'SOURCE_ID_INVALID'; error: string}
  | {code: 'TOO_MANY_SOURCES'; error: string};

/**
 * 클라이언트가 보낸 상대 목록을 손질한다. 이 결과는 여전히 "요청"일 뿐이고,
 * 권한이 있는지는 공유를 봐야 안다 (deniedSourceIds).
 *
 * - 소문자로 맞추고 공백을 턴다
 * - 중복을 없앤다
 * - 내 스페이스가 섞여 있으면 뺀다 (어차피 언제나 포함되므로 오류가 아니다)
 * - 형식이 틀렸거나 개수가 넘으면 거절한다
 */
export function normalizeSourceIds(
  raw: unknown,
  hostSpaceId: string
): {ids: string[]; issue?: undefined} | {ids?: undefined; issue: SourceListIssue} {
  if (raw === undefined || raw === null) return {ids: []};
  if (!Array.isArray(raw)) {
    return {issue: {code: 'SOURCE_ID_INVALID', error: '함께 볼 스페이스 목록이 올바르지 않습니다.'}};
  }

  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') {
      return {issue: {code: 'SOURCE_ID_INVALID', error: '함께 볼 스페이스 목록이 올바르지 않습니다.'}};
    }
    const id = value.trim().toLowerCase();
    if (!validSpaceId(id)) {
      return {issue: {code: 'SOURCE_ID_INVALID', error: '올바르지 않은 스페이스 코드가 있습니다.'}};
    }
    if (id === hostSpaceId || ids.includes(id)) continue;
    ids.push(id);
  }

  if (ids.length > MAX_SOURCES) {
    return {
      issue: {
        code: 'TOO_MANY_SOURCES',
        error: `함께보기에는 스페이스를 최대 ${MAX_SOURCES}개까지 더할 수 있습니다.`
      }
    };
  }
  return {ids};
}

/**
 * 요청한 상대 중 지금 내가 볼 권한이 없는 것들.
 *
 * 존재하지 않는 스페이스, 수락 전인 것, 종료된 것, 아예 공유가 없는 것을 구분하지 않고
 * 한 자루에 담는다 — 구분해서 알려주면 "그 스페이스가 존재하긴 하는가"를 묻는 도구가 된다.
 *
 * 반환된 ID를 그대로 클라이언트에 돌려주는 건 안전하다: 활성일 때 목록에서 이미 봤던
 * ID다. 이름과 결과는 함께 주지 않는다.
 */
export function deniedSourceIds(
  requested: readonly string[], shares: readonly SpaceShare[], me: string
): string[] {
  const allowed = new Set(
    shares.filter(share => involves(share, me) && isActive(share))
      .map(share => partnerOf(share, me))
  );
  return requested.filter(id => !allowed.has(id));
}

/**
 * 내가 볼 수 있는 행만 남긴다: 내 스페이스의 결과와, 지금 활성 공유가 걸린 상대의 결과.
 *
 * ⚠ 언제 제출됐는지는 보지 않는다. 공유를 맺으면 **그 스페이스의 결과 전부**가 넘어간다 —
 *   공유 전에 이미 제출한 사람 것까지. 예전에는 수락 시각(visible_from) 이후 결과만
 *   넘겼는데, 그러면 기존 스페이스끼리 연결했을 때 지도가 텅 비어 기능이 쓸모없었다.
 *   대신 참가 화면이 "나중에 공유되면 지금 낸 결과도 함께 보인다"를 미리 고지한다
 *   (ParticipantApp). 소급 노출이라 그 고지가 이 결정의 전부다.
 *
 * 왜 서버가 JS로 거르나: 어차피 상대별로 판정해야 하고, 스페이스당 정원이 200이라
 * 여기서 거르는 편이 값싸고 무엇보다 눈으로 읽힌다.
 */
export function visibleRows<T extends {room: string}>(
  rows: readonly T[],
  hostSpaceId: string,
  shares: readonly SpaceShare[]
): T[] {
  const partners = new Set(
    shares.filter(share => involves(share, hostSpaceId) && isActive(share))
      .map(share => partnerOf(share, hostSpaceId))
  );

  // 내 스페이스이거나, 활성 공유가 걸린 상대. 그 밖은 안 보인다 (fail closed).
  return rows.filter(row => row.room === hostSpaceId || partners.has(row.room));
}
