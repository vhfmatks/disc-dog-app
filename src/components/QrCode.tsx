import {useMemo} from 'react';
import {qrPath} from '../lib/qr-path.ts';

interface QrCodeProps {
  value: string;
  /** 화면에 그려질 한 변 (px). SVG라 확대해도 깨지지 않는다. */
  size?: number;
  /** 스크린리더에 읽힐 설명. QR 자체는 이미지라 아무 정보도 주지 못한다. */
  label: string;
}

/**
 * 초대 링크를 QR로 그린다.
 *
 * ⚠ 외부 QR 생성 API(api.qrserver.com 등)를 쓰면 안 된다. 이 링크에는 스페이스
 *   출입증 토큰이 들어 있어서, URL을 남의 서버에 넘기는 순간 그 서버는 스페이스에
 *   들어올 수 있게 된다. 그래서 브라우저 안에서만 만든다.
 *
 * qrcode 라이브러리(gzip 14KB)를 끌고 오므로 main.tsx가 lazy로 불러온다. 이 화면은
 * 스페이스를 만든 사람만 보고, 폰으로 들어오는 참가자 대다수는 볼 일이 없다.
 */
export function QrCode({value, size = 220, label}: QrCodeProps) {
  const {path, span} = useMemo(() => qrPath(value), [value]);

  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      // 모듈 경계가 소수점 픽셀에 걸리면 흰 실선이 생겨 스캔이 흔들린다.
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {/* 여백까지 흰색이어야 한다. 카드 배경(--paper)이 비치면 대비가 무너진다. */}
      <rect width={span} height={span} fill="#fff" />
      <path d={path} fill="#16130F" />
    </svg>
  );
}
