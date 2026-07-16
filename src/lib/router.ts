import {useEffect, useState} from 'react';

export type Route =
  | {kind: 'home'}
  | {kind: 'admin'}
  | {kind: 'participant'; groupId: string}
  | {kind: 'map'; groupId: string};

const GROUP_ID_RE = /^[a-z0-9-]{3,24}$/;

export function normalizeGroupId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
}

export function isGroupId(value: string): boolean {
  return GROUP_ID_RE.test(value) && value !== 'admin' && value !== 'map';
}

function legacyHashRoute(hash: string): Route | null {
  if (!hash.startsWith('#/')) return null;
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const groupId = normalizeGroupId(params.get('r') || params.get('room') || '');
  if (!isGroupId(groupId)) return null;
  return path === 'map' ? {kind: 'map', groupId} : {kind: 'participant', groupId};
}

/**
 * 새 주소는 /{groupId}, /{groupId}/map, /admin 이다.
 * 예전에 배포된 #/?r=... 링크도 당분간 같은 화면으로 연결한다.
 */
export function parseRoute(location: Location = window.location): Route {
  const legacy = legacyHashRoute(location.hash);
  if (legacy) return legacy;

  const legacyParams = new URLSearchParams(location.search);
  const legacyGroupId = normalizeGroupId(legacyParams.get('r') || legacyParams.get('room') || '');
  if (isGroupId(legacyGroupId)) {
    return /map\.html$/i.test(location.pathname)
      ? {kind: 'map', groupId: legacyGroupId}
      : {kind: 'participant', groupId: legacyGroupId};
  }

  const parts = location.pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return ''; }
  });
  if (location.pathname.endsWith('/') || parts.length === 0) return {kind: 'home'};

  const last = parts.at(-1) || '';
  const previous = parts.at(-2) || '';
  if (last === 'admin') return {kind: 'admin'};
  if (last === 'map' && isGroupId(previous)) return {kind: 'map', groupId: previous};
  if (isGroupId(last)) return {kind: 'participant', groupId: last};
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

export function groupUrl(groupId: string, route?: Route): string {
  return new URL(encodeURIComponent(groupId), appBaseUrl(route)).href;
}

export function groupMapUrl(groupId: string, route?: Route): string {
  return new URL(`${encodeURIComponent(groupId)}/map`, appBaseUrl(route)).href;
}

export function adminUrl(route?: Route): string {
  return new URL('admin', appBaseUrl(route)).href;
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
