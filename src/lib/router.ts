import {useEffect, useState} from 'react';

export type Route =
  | {kind: 'home'}
  | {kind: 'create'}
  | {kind: 'admin'}
  | {kind: 'profile'}
  | {kind: 'participant'; spaceId: string}
  | {kind: 'map'; spaceId: string};

const SPACE_ID_RE = /^[a-z0-9-]{3,24}$/;

/** 이 이름들은 경로에서 다른 뜻을 가진다. _shared/spaces.ts의 목록과 같아야 한다. */
const RESERVED_IDS = new Set(['admin', 'map', 'new', 'profile']);

export function normalizeSpaceId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
}

export function isSpaceId(value: string): boolean {
  return SPACE_ID_RE.test(value) && !RESERVED_IDS.has(value);
}

function legacyHashRoute(hash: string): Route | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const spaceId = normalizeSpaceId(params.get('r') || params.get('room') || '');
  if (!isSpaceId(spaceId)) return null;
  return path === 'map' ? {kind: 'map', spaceId} : {kind: 'participant', spaceId};
}

/**
 * 새 주소는 /{spaceId}, /{spaceId}/map, /new, /admin, /profile 이다.
 * 공유 링크는 여기에 #k=<토큰>이 붙는다 (access.ts).
 * 예전에 배포된 #/?r=... 링크도 당분간 같은 화면으로 연결한다.
 */
export function parseRoute(location: Location = window.location): Route {
  const legacy = legacyHashRoute(location.hash);
  if (legacy) return legacy;

  const legacyParams = new URLSearchParams(location.search);
  const legacySpaceId = normalizeSpaceId(legacyParams.get('r') || legacyParams.get('room') || '');
  if (isSpaceId(legacySpaceId)) {
    return /map\.html$/i.test(location.pathname)
      ? {kind: 'map', spaceId: legacySpaceId}
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
  if (last === 'map' && isSpaceId(previous)) return {kind: 'map', spaceId: previous};
  if (isSpaceId(last)) return {kind: 'participant', spaceId: last};
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

export function spaceMapUrl(spaceId: string, route?: Route): string {
  return new URL(`${encodeURIComponent(spaceId)}/map`, appBaseUrl(route)).href;
}

/** 이 링크를 가진 사람은 비밀번호 없이 들어온다. 토큰은 프래그먼트에만 싣는다. */
export function spaceShareUrl(spaceId: string, token: string, route?: Route): string {
  return `${spaceUrl(spaceId, route)}#k=${encodeURIComponent(token)}`;
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
