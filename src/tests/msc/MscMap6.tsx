import {INDICATORS} from './data.ts';
import type {DimKey} from './data.ts';

// 공식 "뇌인지행동유형맵" — 6개 열(지표) × 4행(단계)의 평행좌표 그래프.
// 사람마다 열마다 한 칸(레벨)을 고르고, 그 칸들을 선으로 잇는다. 여러 명이면 선을
// 겹쳐 그리고, 선택된 한 명의 선과 칸을 진하게 강조한다.

const W = 980;
const PAD_X = 14;
const COL_GAP = 8;
const COLS = INDICATORS.length;               // 6
const COL_W = (W - 2 * PAD_X - (COLS - 1) * COL_GAP) / COLS;

const TOP = 16;
const ROW_H = 62;
const ROW_GAP = 8;
const ROWS = 4;
const ROWS_H = ROWS * ROW_H + (ROWS - 1) * ROW_GAP;
const FOOT_GAP = 10;
const FOOT_H = 46;
const H = TOP + ROWS_H + FOOT_GAP + FOOT_H + 14;

const colX = (c: number) => PAD_X + c * (COL_W + COL_GAP);
const cx = (c: number) => colX(c) + COL_W / 2;
// level 3 = 맨 위 행, level 0 = 맨 아래 행.
const rowY = (level: number) => TOP + (3 - level) * (ROW_H + ROW_GAP);
const cy = (level: number) => rowY(level) + ROW_H / 2;

export interface MapProfile {
  id: string;
  nickname: string;
  levels: Record<DimKey, number>;
}

export function MscMap6({profiles, selectedId}: {
  profiles: MapProfile[];
  selectedId?: string | null;
}) {
  const selected = profiles.find(p => p.id === selectedId)
    || (profiles.length === 1 ? profiles[0] : null);

  return (
    <div className="msc-map6-scroll">
      <svg className="brain-map6" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="뇌인지 행동유형맵">
        {/* 칸 */}
        {INDICATORS.map((ind, c) => ind.levels.map((lv, level) => {
          const on = selected ? selected.levels[ind.key] === level : false;
          return (
            <g key={`${ind.key}-${level}`}>
              <rect
                x={colX(c)} y={rowY(level)} width={COL_W} height={ROW_H} rx={10}
                fill={on ? ind.hex : `${ind.hex}18`}
                stroke={on ? ind.hex : 'var(--line)'}
                strokeWidth={on ? 2 : 1}
              />
              <text className="map6-ko" x={cx(c)} y={cy(level) - 2} textAnchor="middle" fill={on ? '#fff' : 'var(--ink)'}>
                {lv.label}
              </text>
              <text className="map6-en" x={cx(c)} y={cy(level) + 13} textAnchor="middle" fill={on ? 'rgba(255,255,255,.85)' : 'var(--muted)'}>
                {lv.en}
              </text>
            </g>
          );
        }))}

        {/* 프로파일 선 (선택되지 않은 사람은 회색, 선택된 사람은 진하게) */}
        {profiles.map(p => {
          const isSel = selected?.id === p.id;
          const points = INDICATORS.map((ind, c) => `${cx(c).toFixed(1)},${cy(p.levels[ind.key]).toFixed(1)}`).join(' ');
          return <polyline key={p.id} className={`map6-line ${isSel ? 'sel' : ''}`} points={points} />;
        })}

        {/* 선택된 사람의 꼭짓점 */}
        {selected && INDICATORS.map((ind, c) => (
          <circle key={`dot-${ind.key}`} className="map6-dot" cx={cx(c)} cy={cy(selected.levels[ind.key])} r={4} />
        ))}

        {/* 열 제목(하단 색 바) */}
        {INDICATORS.map((ind, c) => {
          const y = TOP + ROWS_H + FOOT_GAP;
          return (
            <g key={`foot-${ind.key}`}>
              <rect x={colX(c)} y={y} width={COL_W} height={FOOT_H} rx={10} fill={ind.hex} />
              <text className="map6-foot-ko" x={cx(c)} y={y + 19} textAnchor="middle" fill="#fff">{ind.title}</text>
              <text className="map6-foot-en" x={cx(c)} y={y + 34} textAnchor="middle" fill="rgba(255,255,255,.85)">{ind.en}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
