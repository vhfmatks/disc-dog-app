import QRCode from 'qrcode';

/** QR 규격이 요구하는 최소 여백. 이게 없으면 스캐너가 코드를 못 찾는다. */
export const QUIET_ZONE = 4;

export interface QrPath {
  /** 어두운 모듈을 전부 담은 SVG path의 d 속성. */
  path: string;
  /** 여백을 포함한 한 변의 모듈 수. viewBox에 그대로 쓴다. */
  span: number;
}

/**
 * QR 모듈 행렬을 path 하나로 만든다.
 *
 * 모듈마다 <rect>를 찍으면 41x41 = 1681개짜리 DOM이 된다. 좌표만 이어붙여 path
 * 하나로 몰아넣는다.
 *
 * 행/열을 뒤집으면 전치된 QR이 나오는데, 이건 눈으로 보면 그럴듯하지만 스캐너는
 * 읽지 못한다. scripts/qr-path.test.mjs가 실제로 디코딩해서 이 함수를 지킨다.
 */
export function qrPath(value: string): QrPath {
  const {modules} = QRCode.create(value, {errorCorrectionLevel: 'M'});
  const count = modules.size;
  let path = '';

  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      // get(row, column) — x가 column, y가 row다. 뒤집으면 스캔이 안 된다.
      if (modules.get(row, column)) path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }

  return {path, span: count + QUIET_ZONE * 2};
}
