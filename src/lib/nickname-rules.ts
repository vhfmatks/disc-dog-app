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

/** PostgREST의 unique 위반이 스페이스 내 닉네임 충돌인지 판별한다. */
export function isNicknameUniqueViolation(error: unknown): boolean {
  const value = error as {code?: string; message?: string; details?: string} | null;
  if (value?.code !== '23505') return false;
  const text = `${value.message || ''} ${value.details || ''}`;
  return /results_room_nickname_key|key\s*\(room\s*,\s*nickname\)/i.test(text);
}

/** 응답 유실 뒤 같은 제출을 재시도했는지 확인하기 위한 primary-key 충돌 판별. */
export function isResultIdUniqueViolation(error: unknown): boolean {
  const value = error as {code?: string; message?: string; details?: string} | null;
  if (value?.code !== '23505') return false;
  const text = `${value.message || ''} ${value.details || ''}`;
  return /results_pkey|key\s*\(id\)/i.test(text);
}
