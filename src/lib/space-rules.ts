export const SPACE_PASSWORD_MIN = 6;
export const SPACE_PASSWORD_MAX = 72;
export const SPACE_NAME_MAX = 50;

export type SpaceValidationCode =
  | 'SPACE_NAME_REQUIRED'
  | 'SPACE_NAME_TOO_LONG'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_CONFIRM_MISMATCH';

export interface ValidationIssue {
  code: SpaceValidationCode;
  message: string;
}

export function validateSpaceName(value: string): ValidationIssue | null {
  const name = value.trim();
  if (!name) return {code: 'SPACE_NAME_REQUIRED', message: '스페이스 이름을 입력해주세요.'};
  if (name.length > SPACE_NAME_MAX) {
    return {code: 'SPACE_NAME_TOO_LONG', message: `스페이스 이름은 ${SPACE_NAME_MAX}자 이하여야 합니다.`};
  }
  return null;
}

export function validateSpacePassword(value: string, optional = false): ValidationIssue | null {
  if (!value) return optional ? null : {code: 'PASSWORD_REQUIRED', message: '비밀번호를 입력해주세요.'};
  if (value.length < SPACE_PASSWORD_MIN) {
    return {code: 'PASSWORD_TOO_SHORT', message: `비밀번호는 ${SPACE_PASSWORD_MIN}자 이상이어야 합니다.`};
  }
  if (value.length > SPACE_PASSWORD_MAX) {
    return {code: 'PASSWORD_TOO_LONG', message: `비밀번호는 ${SPACE_PASSWORD_MAX}자 이하여야 합니다.`};
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): ValidationIssue | null {
  if (confirmation && password !== confirmation) {
    return {code: 'PASSWORD_CONFIRM_MISMATCH', message: '두 비밀번호가 다릅니다.'};
  }
  return null;
}
