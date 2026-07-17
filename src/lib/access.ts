// 스페이스 출입증(공유 토큰) 보관소.
//
// 토큰은 공유 링크의 #k= 프래그먼트로 들어온다. 프래그먼트는 서버로 전송되지 않으므로
// 접속 로그나 Referer에 남지 않는다. 받은 즉시 localStorage로 옮기고 주소창에서는
// 지운다 — 세미나에서 진행자가 화면을 띄워놓고 공유하는 일이 흔한데, 주소창에 토큰이
// 그대로 보이면 그 자체가 유출이다.
//
// 출입증은 "이 스페이스를 볼 수 있다"만 뜻한다. 공유를 다루는 권한은 스페이스
// 비밀번호가 가진다 (space-views 함수) — 링크로 들어온 사람은 비밀번호를 모른다.
//
// 비밀번호는 여기 저장하지 않는다. 공유를 다루는 동안만 세션에 머문다 (MapApp).

const tokenKey = (spaceId: string) => `dogtype:space-token:${spaceId}`;

const TOKEN_RE = /^[A-Za-z0-9_.~-]{8,128}$/;

function readFragment(prefix: string): string {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${prefix}=`)) return '';
  const raw = hash.slice(prefix.length + 2);
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return '';
  }
  return TOKEN_RE.test(value) ? value : '';
}

function stripFragment(prefix: string): void {
  if (!window.location.hash.startsWith(`#${prefix}=`)) return;
  const {pathname, search} = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

function load(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';   // 시크릿 모드나 저장소 차단 — 비밀번호나 링크로 다시 들어오면 된다
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장을 못 해도 이번 세션은 그대로 진행된다
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

/** 공유 링크에서 막 도착한 출입증. 없으면 빈 문자열. */
export const readShareTokenFromUrl = () => readFragment('k');
export const stripShareTokenFromUrl = () => stripFragment('k');

export const loadToken = (spaceId: string) => load(tokenKey(spaceId));
export const saveToken = (spaceId: string, token: string) => save(tokenKey(spaceId), token);
export const clearToken = (spaceId: string) => drop(tokenKey(spaceId));
