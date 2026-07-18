import {useMemo} from 'react';
import {MSC_ORDER, MSC_TYPES} from './data.ts';
import type {MscTypeCode} from './data.ts';

// 좌뇌/우뇌 8분할 휠. 세로축을 경계로 오른쪽=우뇌(따뜻한 색), 왼쪽=좌뇌(차가운 색).
// 참가자는 자기 주유형 부채꼴에 발자국으로 놓이고, 중심에서 멀수록 성향이 진하다.
//
// DISC 관계도(x/y 사각지도)와는 다른 검사의 지도라 별도 컴포넌트다. MVP에서는
// 관계선·최장거리쌍 같은 분석은 넣지 않고, 배치와 이름표까지만 그린다.

const W = 620;
const H = 620;
const CX = W / 2;
const CY = H / 2;
const R_OUTER = 250;      // 부채꼴 바깥 반지름
const R_NODE_MIN = 78;    // 발자국이 놓이는 최소 반지름(중심을 비운다)
const R_NODE_MAX = 232;   // 발자국 최대 반지름

const PAW_D =
  'M50 58c-9 0-16 6-16 13 0 6 5 10 16 10s16-4 16-10c0-7-7-13-16-13z' +
  'M29 47c-5 0-8 4-8 9s3 8 7 8 7-4 7-9-2-8-6-8z' +
  'M71 47c5 0 8 4 8 9s-3 8-7 8-7-4-7-9 2-8 6-8z' +
  'M39 28c-4 0-7 4-7 9s3 9 7 9 7-4 7-9-3-9-7-9z' +
  'M61 28c4 0 7 4 7 9s-3 9-7 9-7-4-7-9 3-9 7-9z';

const rad = (deg: number) => (deg * Math.PI) / 180;
const px = (r: number, deg: number) => CX + r * Math.cos(rad(deg));
const py = (r: number, deg: number) => CY - r * Math.sin(rad(deg));

/** 부채꼴을 부채살 폴리곤으로 그린다 — 호 방향(sweep flag) 착오를 피한다. */
function sectorPath(centerDeg: number): string {
  const half = 22.5;
  const points: string[] = [`M ${CX} ${CY}`];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const deg = centerDeg - half + (2 * half * i) / steps;
    points.push(`L ${px(R_OUTER, deg).toFixed(1)} ${py(R_OUTER, deg).toFixed(1)}`);
  }
  points.push('Z');
  return points.join(' ');
}

export interface WheelNode {
  id: string;
  nickname: string;
  primary: MscTypeCode;
  angle: number;
  radius: number;   // 0~1
}

interface PlacedNode extends WheelNode {
  x: number;
  y: number;
}

function layout(nodes: WheelNode[]): PlacedNode[] {
  const bucket = new Map<string, number>();
  return nodes.map(node => {
    const r = R_NODE_MIN + node.radius * (R_NODE_MAX - R_NODE_MIN);
    const x = px(r, node.angle);
    const y = py(r, node.angle);
    const key = `${Math.round(x / 24)}:${Math.round(y / 24)}`;
    const stack = bucket.get(key) || 0;
    bucket.set(key, stack + 1);
    return {...node, x, y: y + stack * 10};
  });
}

export function BrainWheel({nodes, selectedId, onSelect}: {
  nodes: WheelNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const placed = useMemo(() => layout(nodes), [nodes]);

  return (
    <svg className="brain-wheel" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="뇌인지 행동유형 지도">
      <defs>
        <clipPath id="wheel-clip"><circle cx={CX} cy={CY} r={R_OUTER} /></clipPath>
      </defs>

      {/* 부채꼴 배경 */}
      <g clipPath="url(#wheel-clip)">
        {MSC_ORDER.map(code => {
          const info = MSC_TYPES[code];
          return <path key={code} className="wheel-sector" d={sectorPath(info.angle)} fill={info.hex} />;
        })}
      </g>

      {/* 테두리 원 + 좌우뇌 경계선 */}
      <circle className="wheel-ring" cx={CX} cy={CY} r={R_OUTER} fill="none" />
      <line className="wheel-axis" x1={CX} y1={CY - R_OUTER} x2={CX} y2={CY + R_OUTER} />

      {/* 부채꼴 라벨 */}
      {MSC_ORDER.map(code => {
        const info = MSC_TYPES[code];
        const lx = px(R_OUTER * 0.82, info.angle);
        const ly = py(R_OUTER * 0.82, info.angle);
        return (
          <text key={code} className="wheel-label" x={lx} y={ly} fill={info.hex} textAnchor="middle" dominantBaseline="middle">
            {info.short}
          </text>
        );
      })}

      {/* 좌/우뇌 안내 */}
      <text className="wheel-hemi" x={CX + R_OUTER - 6} y={26} textAnchor="end">우뇌</text>
      <text className="wheel-hemi" x={CX - R_OUTER + 6} y={26} textAnchor="start">좌뇌</text>

      {/* 참가자 발자국 */}
      <g className="wheel-nodes">
        {placed.map(node => {
          const info = MSC_TYPES[node.primary];
          const isSel = node.id === selectedId;
          return (
            <g
              key={node.id}
              className={`wheel-node ${isSel ? 'sel' : ''}`}
              transform={`translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`}
              tabIndex={onSelect ? 0 : undefined}
              role={onSelect ? 'button' : undefined}
              aria-label={`${node.nickname} · ${info.name}`}
              onClick={onSelect ? () => onSelect(node.id) : undefined}
              onKeyDown={onSelect ? event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); }
              } : undefined}
            >
              {isSel && <circle className="wheel-node-ring" r="20" />}
              <circle r="14" fill={info.hex} opacity="0.18" />
              <path d={PAW_D} transform="translate(-10,-10) scale(0.2)" fill={info.hex} />
              <text className="wheel-node-label" y="26" textAnchor="middle">{node.nickname}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
