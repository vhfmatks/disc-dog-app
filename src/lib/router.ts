import {useEffect, useState} from 'react';

export type Route =
  | {kind: 'home'}
  | {kind: 'create'}
  | {kind: 'admin'}
  | {kind: 'profile'}
  | {kind: 'participant'; spaceId: string; passwordRequired?: true}
  /** withSpaceIds는 함께보기로 고른 스페이스. 비어 있으면 넣지 않는다. */
  | {kind: 'map'; spaceId: string; withSpaceIds?: string[]};

const SPACE_ID_RE = /^[a-z0-9-]{3,24}$/;

/**
 * 이 이름들은 경로에서 다른 뜻을 가진다. _shared/spaces.ts의 목록과 같아야 한다.
 *
 * 'manage'는 진행자 화면이 있던 시절의 예약어다. 그 화면은 지도 아래로 들어와
 * 사라졌지만, 목록에서 빼면 예전에 만들어진 코드가 스페이스 ID로 되살아나 라우팅이
 * 갈린다. 한 번 예약한 이름은 놓아주지 않는다.
 */
const RESERVED_IDS = new Set(['admin', 'manage', 'map', 'new', 'profile']);

/** 함께보기 한 번에 고를 수 있는 외부 스페이스. _shared/view-grants.ts의 MAX_SOURCES와 같다. */
export const MAX_WITH_SPACES = 9;

export function normalizeSpaceId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
}

export function isSpaceId(value: string): boolean {
  return SPACE_ID_RE.test(value) && !RESERVED_IDS.has(value);
}

/**
 * `?with=a,c` — 함께보기로 고른 외부 스페이스.
 *
 * 주소는 사용자가 고쳐 쓸 수 있는 값이므로 여기서 하는 일은 손질뿐이다. 권한이
 * 있는지는 서버가 grant를 다시 읽어 판정한다 (space-views). 기준 스페이스는 언제나
 * 포함되므로 목록에 섞여 있으면 조용히 뺀다 — 오류로 삼을 일이 아니다.
 */
export function parseWithSpaceIds(search: string, hostSpaceId: string): string[] {
  const raw = new URLSearchParams(search).get('with');
  if (!raw) return [];

  const ids: string[] = [];
  for (const part of raw.split(',')) {
    const id = normalizeSpaceId(part);
    if (!isSpaceId(id) || id === hostSpaceId || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.slice(0, MAX_WITH_SPACES);
}

function mapRoute(spaceId: string, search: string): Route {
  const withSpaceIds = parseWithSpaceIds(search, spaceId);
  return withSpaceIds.length ? {kind: 'map', spaceId, withSpaceIds} : {kind: 'map', spaceId};
}

function legacyHashRoute(hash: string): Route | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const spaceId = normalizeSpaceId(params.get('r') || params.get('room') || '');
  if (!isSpaceId(spaceId)) return null;
  return path === 'map' ? mapRoute(spaceId, query) : {kind: 'participant', spaceId};
}

/**
 * 새 주소는 /{spaceId}, /{spaceId}/map, /{spaceId}/manage, /new, /admin, /profile 이다.
 * 공유 링크는 여기에 #k=<토큰>이, 관리 링크는 #m=<토큰>이 붙는다 (access.ts).
 * 예전에 배포된 #/?r=... 링크도 당분간 같은 화면으로 연결한다.
 */
export function parseRoute(location: Location = window.location): Route {
  const legacy = legacyHashRoute(location.hash);
  if (legacy) return legacy;

  const legacyParams = new URLSearchParams(location.search);
  const passwordRequired = legacyParams.get('gate') === 'password';
  const legacySpaceId = normalizeSpaceId(legacyParams.get('r') || legacyParams.get('room') || '');
  if (isSpaceId(legacySpaceId)) {
    return /map\.html$/i.test(location.pathname)
      ? mapRoute(legacySpaceId, location.search)
      : passwordRequired
        ? {kind: 'participant', spaceId: legacySpaceId, passwordRequired: true}
        : {kind: 'participant', spaceId: legacySpaceId};
  }

  const parts = location.pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return ''; }
  });
  if (location.pathname.endsWith('/') || parts.length === 0) return {kind: 'home'};

  const last = parts.at(-1) || '';
  const previous = parts.at(-2) || '';
  if (last === 'admin') return {kind: 'admin'};
  if (last === 'new') return {kind: 'create'};
  if (last === 'profile') return {kind: 'profile'};
  if (last === 'map' && isSpaceId(previous)) return mapRoute(previous, location.search);
  if (isSpaceId(last)) {
    return passwordRequired
      ? {kind: 'participant', spaceId: last, passwordRequired: true}
      : {kind: 'participant', spaceId: last};
  }
  return {kind: 'home'};
}

export function appBaseUrl(route: Route = parseRoute()): URL {
  const url = new URL(window.location.href);
  if (url.pathname.endsWith('/')) {
    url.search = '';
    url.hash = '';
    return url;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const legacyHtml = /\.html$/i.test(parts.at(-1) || '');
  // /{spaceId}/map만 두 칸 깊이다.
  const removeCount = legacyHtml ? 1 : route.kind === 'map' ? 2 : route.kind === 'home' ? 0 : 1;
  const baseParts = removeCount ? parts.slice(0, -removeCount) : parts;
  url.pathname = `/${baseParts.join('/')}${baseParts.length ? '/' : ''}`;
  url.search = '';
  url.hash = '';
  return url;
}

export function spaceUrl(spaceId: string, route?: Route): string {
  return new URL(encodeURIComponent(spaceId), appBaseUrl(route)).href;
}

/** 홈처럼 공개된 진입점에서는 저장된 출입증 대신 스페이스 비밀번호를 새로 확인한다. */
export function spacePasswordUrl(spaceId: string, route?: Route): string {
  const url = new URL(encodeURIComponent(spaceId), appBaseUrl(route));
  url.searchParams.set('gate', 'password');
  return url.href;
}

/** 비밀번호 확인이 끝난 뒤 새로고침 때 같은 게이트가 다시 뜨지 않도록 일회성 표식을 지운다. */
export function stripPasswordGateFromUrl(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('gate') !== 'password') return;
  url.searchParams.delete('gate');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function spaceMapUrl(spaceId: string, route?: Route): string {
  return new URL(`${encodeURIComponent(spaceId)}/map`, appBaseUrl(route)).href;
}

/**
 * 함께보기 주소. 고른 스페이스를 ?with=에 싣는다.
 *
 * 이 주소는 권한이 아니라 화면 상태다 — 누가 복사해 가도 그 사람의 출입증과 grant로
 * 다시 판정된다. 그래서 프래그먼트가 아니라 쿼리에 둔다 (공유·북마크가 되어야 한다).
 */
export function spaceTogetherMapUrl(
  spaceId: string, withSpaceIds: readonly string[], route?: Route
): string {
  const url = new URL(`${encodeURIComponent(spaceId)}/map`, appBaseUrl(route));
  if (withSpaceIds.length) url.searchParams.set('with', withSpaceIds.join(','));
  return url.href;
}


/**
 * 진행자 화면을 비밀번호 없이 여는 링크. 관리자 화면이 스페이스마다 만든다.
 *
 * 초대 링크(spaceShareUrl)와 달리 clean URL을 그대로 쓴다 — 이 주소는 채팅방에
 * 뿌리는 게 아니라 관리자가 자기 브라우저에서 바로 열기 때문에 OG 크롤러를
 * 신경 쓸 이유가 없다. 404.html이 #k=까지 함께 복원해준다.
 */
export function spaceMapShareUrl(spaceId: string, token: string, route?: Route): string {
  const url = new URL(`${encodeURIComponent(spaceId)}/map`, appBaseUrl(route));
  url.hash = `k=${encodeURIComponent(token)}`;
  return url.href;
}

/** 이 링크를 가진 사람은 비밀번호 없이 들어온다. 토큰은 프래그먼트에만 싣는다. */
export function spaceShareUrl(spaceId: string, token: string, route?: Route): string {
  // GitHub Pages는 /<spaceId>를 HTTP 404로 응답한 뒤 JS로 복원한다.
  // 공유 크롤러는 그 JS를 실행하지 않을 수 있으므로, OG 메타가 있는 루트를
  // 바로 열고 이미 지원하는 ?r= 파라미터로 스페이스를 전달한다.
  const url = appBaseUrl(route);
  url.searchParams.set('r', spaceId);
  url.hash = `k=${encodeURIComponent(token)}`;
  return url.href;
}

export function homeUrl(route?: Route): string {
  return appBaseUrl(route).href;
}

export function createUrl(route?: Route): string {
  return new URL('new', appBaseUrl(route)).href;
}

export function adminUrl(route?: Route): string {
  return new URL('admin', appBaseUrl(route)).href;
}

export function profileUrl(route?: Route): string {
  return new URL('profile', appBaseUrl(route)).href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onChange = () => setRoute(parseRoute());
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  return route;
}
