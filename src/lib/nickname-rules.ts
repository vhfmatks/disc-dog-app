// 닉네임 입력 규칙. 화면이 미리 걸러주는 데까지가 여기 몫이고, 최종 판정은 DB의
// unique 제약과 CHECK가 한다.
//
// PostgREST의 23505를 가려내던 두 함수는 _shared/spaces.ts로 옮겼습니다 — 결과 저장이
// 서버로 넘어가면서 DB 오류를 보는 쪽도 서버뿐이라서요. 브라우저는 이제 서버가 붙여준
// 코드(NICKNAME_DUPLICATE 등)만 받습니다.

export const NICKNAME_MAX = 16;

export type NicknameValidationCode = 'NICKNAME_REQUIRED' | 'NICKNAME_TOO_LONG';

export interface NicknameIssue {
  code: NicknameValidationCode;
  message: string;
}

export function validateNickname(value: string): NicknameIssue | null {
  const nickname = value.trim();
  if (!nickname) return {code: 'NICKNAME_REQUIRED', message: '닉네임을 입력해주세요.'};
  if (nickname.length > NICKNAME_MAX) {
    return {code: 'NICKNAME_TOO_LONG', message: `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.`};
  }
  return null;
}
