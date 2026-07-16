// 스페이스 출입증(공유 토큰) 보관소.
//
// 토큰은 공유 링크의 #k=... 프래그먼트로 들어온다. 프래그먼트는 서버로 전송되지
// 않으므로 접속 로그나 Referer에 남지 않는다. 받은 즉시 localStorage로 옮기고
// 주소창에서는 지운다 — 세미나에서 진행자가 화면을 띄워놓고 공유하는 일이 흔한데,
// 주소창에 토큰이 그대로 보이면 그 자체가 유출이다.

const tokenKey = (spaceId: string) => `dogtype:space-token:${spaceId}`;

/** 공유 링크에서 막 도착한 토큰. 없으면 빈 문자열. */
export function readShareTokenFromUrl(): string {
  const match = /^#k=([A-Za-z0-9_.~-]{8,128})$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : '';
}

export function stripShareTokenFromUrl(): void {
  if (!window.location.hash.startsWith('#k=')) return;
  const {pathname, search} = window.location;
  window.history.replaceState(null, '', `${pathname}${search}`);
}

export function loadToken(spaceId: string): string {
  try {
    return localStorage.getItem(tokenKey(spaceId)) || '';
  } catch {
    return '';   // 시크릿 모드나 저장소 차단 — 비밀번호로 들어가면 된다
  }
}

export function saveToken(spaceId: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(spaceId), token);
  } catch {
    // 저장을 못 해도 이번 세션은 그대로 진행된다
  }
}

export function clearToken(spaceId: string): void {
  try {
    localStorage.removeItem(tokenKey(spaceId));
  } catch {
    // noop
  }
}
