import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {SCORE, TYPES, gapNote, pawPath, rel} from '../assets/data.ts';
import type {Relation, TypeCode} from '../assets/data.ts';
import {DogFace, SvgDogFace} from './components/DogFace.tsx';
import {fetchRoom, watchRoom} from './lib/db.ts';
import type {GroupRow, ResultRow} from './lib/db.ts';
import {participantUrl} from './lib/room.ts';

const W = 900;
const H = 600;
const PAD = 64;
const CX = W / 2;
const CY = H / 2;
const RX = CX - PAD;
const RY = CY - PAD;
const PAW_D = pawPath();

const QUADS: Array<{type: TypeCode; qx: number; qy: number}> = [
  {type: 'D', qx: -1, qy: 1},
  {type: 'I', qx: 1, qy: 1},
  {type: 'S', qx: 1, qy: -1},
  {type: 'C', qx: -1, qy: -1}
];

const sx = (x: number) => CX + x * RX;
const sy = (y: number) => CY - y * RY;

/** 화면 좌표와 겹침 보정을 얹은 행. */
interface PlacedRow extends ResultRow {
  px: number;
  py: number;
  stack: number;
}

function layout(rows: ResultRow[]): PlacedRow[] {
  const bucket = new Map<string, number>();
  return rows.map(row => {
    const px = sx(row.x);
    const py = sy(row.y);
    const key = `${Math.round(px / 10)}:${Math.round(py / 10)}`;
    const stack = bucket.get(key) || 0;
    bucket.set(key, stack + 1);
    return {...row, px, py: py + stack * 8, stack};
  });
}

function isLinked(selected: PlacedRow | null, row: PlacedRow | null): boolean {
  if (!selected || !row || row.id === selected.id) return false;
  return rel(selected.primary_type, row.primary_type) !== 'same';
}

/** 라벨을 놓아볼 후보 위치 [dx, dy]. */
type Slot = [number, number];

function slotsFor(width: number): Slot[] {
  const slots: Slot[] = [[0, 26], [0, -24]];
  for (const radius of [30, 42, 54, 66]) {
    for (let angle = 0; angle < 12; angle += 1) {
      const theta = (angle / 12) * 2 * Math.PI;
      slots.push([
        Math.cos(theta) * (radius + width / 2),
        Math.sin(theta) * radius
      ]);
    }
  }
  return slots;
}

function useRoom(room: string) {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [status, setStatus] = useState({message: '연결 중…', error: false});

  useEffect(() => {
    let active = true;

    const addRows = (incoming: ResultRow[]) => {
      setRows(current => {
        const ids = new Set(current.map(row => row.id));
        const additions = incoming.filter(row => !ids.has(row.id));
        return additions.length ? [...current, ...additions] : current;
      });
    };

    const load = async () => {
      const response = await fetchRoom(room);
      if (!active) return;
      if (!response.ok) {
        setStatus({message: `데이터를 불러오지 못했습니다 — ${response.error}`, error: true});
        return;
      }
      addRows(response.rows);
    };

    load();
    const unsubscribe = watchRoom(
      room,
      row => {
        if (active) addRows([row]);
      },
      realtimeStatus => {
        if (!active) return;
        if (realtimeStatus === 'SUBSCRIBED') {
          setStatus({message: '실시간 연결됨 · 제출하면 바로 나타납니다', error: false});
        } else if (realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT') {
          setStatus({message: '실시간 연결이 끊겼습니다. 20초마다 자동으로 새로고침합니다.', error: true});
        }
      }
    );
    const interval = window.setInterval(load, 20_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [room]);

  return {rows, status};
}

interface Rect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface RelationMapProps {
  rows: ResultRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function RelationMap({rows, selectedId, onSelect}: RelationMapProps) {
  const nodesRef = useRef<SVGGElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const placed = useMemo(() => layout(rows), [rows]);
  const selected = placed.find(row => row.id === selectedId) || null;
  const freshIds = new Set(placed.filter(row => !seen.current.has(row.id)).map(row => row.id));

  useEffect(() => {
    freshIds.forEach(id => seen.current.add(id));
  }, [freshIds]);

  const painted = useMemo(() => [...placed].sort((a, b) => {
    const rank = (row: PlacedRow) => {
      if (row.id === selectedId) return 2;
      if (isLinked(selected, row)) return 1;
      return 0;
    };
    return rank(a) - rank(b);
  }), [placed, selected, selectedId]);

  useLayoutEffect(() => {
    const box = nodesRef.current;
    if (!box) return;

    const taken: Rect[] = [];
    const hits = (candidate: Rect) => taken.some(other => (
      candidate.x1 < other.x2 && candidate.x2 > other.x1 &&
      candidate.y1 < other.y2 && candidate.y2 > other.y1
    ));
    const rank = (element: Element) => element.classList.contains('sel') ? 0 : element.classList.contains('linked') ? 1 : 2;
    const order = new Map(placed.map((row, index) => [row.id, index]));
    const orderOf = (element: SVGGElement) => order.get(element.dataset.id ?? '') ?? 0;

    for (const label of box.querySelectorAll<SVGTextElement>('.node-label')) {
      label.setAttribute('x', '0');
      label.setAttribute('y', label.dataset.base ?? '0');
    }

    const elements = [...box.querySelectorAll<SVGGElement>('.node')]
      .filter(element => !element.classList.contains('dim'))
      .sort((a, b) => rank(a) - rank(b) || orderOf(a) - orderOf(b));

    for (const element of elements) {
      const row = placed.find(item => item.id === element.dataset.id);
      const label = element.querySelector<SVGTextElement>('.node-label');
      if (!row || !label) continue;

      const base = Number(label.dataset.base);
      const bounds = label.getBBox();
      const width = bounds.width;
      const height = bounds.height;
      const at = ([centerX, centerY]: Slot): Rect => ({
        x1: row.px + centerX - width / 2 - 3,
        x2: row.px + centerX + width / 2 + 3,
        y1: row.py + centerY - height / 2 - 2,
        y2: row.py + centerY + height / 2 + 2
      });

      const slots = slotsFor(width);
      const spot = slots.find(slot => !hits(at(slot))) || slots[0];
      taken.push(at(spot));
      const [centerX, centerY] = spot;
      label.setAttribute('x', centerX.toFixed(1));
      label.setAttribute('y', (base + centerY - bounds.y - height / 2).toFixed(1));
    }
  }, [painted, placed, selectedId]);

  // 선 좌표를 여기서 굳혀 두면 아래 JSX에서 selected가 null인지 다시 따지지 않아도 된다.
  const links = selected
    ? placed.filter(row => row.id !== selected.id).flatMap(row => {
      const kind = rel(selected.primary_type, row.primary_type);
      if (kind === 'same') return [];
      return [{
        id: row.id,
        kind,
        d: `M${selected.px.toFixed(1)} ${selected.py.toFixed(1)} L${row.px.toFixed(1)} ${row.py.toFixed(1)}`
      }];
    })
    : [];

  return (
    <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="참가자 관계도">
      <g id="grid">
        <rect x="0" y="0" width={W} height={H} fill="none" />
        <line className="axis-line" x1={PAD / 2} y1={CY} x2={W - PAD / 2} y2={CY} />
        <line className="axis-line" x1={CX} y1={PAD / 2} x2={CX} y2={H - PAD / 2} />
        <text className="axis-label" x={CX} y="26" textAnchor="middle">먼저 나선다</text>
        <text className="axis-label" x={CX} y={H - 14} textAnchor="middle">지켜본다</text>
        <text className="axis-label" x="14" y={CY - 10} textAnchor="start">일 먼저</text>
        <text className="axis-label" x={W - 14} y={CY - 10} textAnchor="end">사람 먼저</text>
        {QUADS.map(({type, qx, qy}) => {
          const gx = qx < 0 ? 26 : W - 156;
          const gy = qy > 0 ? 18 : H - 148;
          const lx = qx < 0 ? 30 : W - 30;
          const ly = qy > 0 ? 158 : H - 158;
          return (
            <g key={type}>
              <g className="corner-dog" transform={`translate(${gx},${gy})`}><SvgDogFace type={type} size={130} /></g>
              <text className="quad-name" x={lx} y={ly} fill={TYPES[type].hex} textAnchor={qx < 0 ? 'start' : 'end'}>
                {TYPES[type].name} · {TYPES[type].breed}
              </text>
            </g>
          );
        })}
      </g>

      <g id="links">
        {links.map(link => (
          <path className={`link ${link.kind}`} d={link.d} key={link.id} />
        ))}
      </g>

      <g id="nodes" ref={nodesRef}>
        {painted.map(row => {
          const isSelected = row.id === selectedId;
          const linked = isLinked(selected, row);
          const dimmed = Boolean(selected && !isSelected && !linked);
          const classes = ['node', isSelected && 'sel', linked && 'linked', dimmed && 'dim'].filter(Boolean).join(' ');
          const base = row.stack % 2 ? -19 : 30;
          return (
            <g
              className={classes}
              data-id={row.id}
              transform={`translate(${row.px.toFixed(1)},${row.py.toFixed(1)})`}
              tabIndex={0}
              role="button"
              aria-label={`${row.nickname} ${row.code}`}
              onClick={() => onSelect(row.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row.id);
                }
              }}
              key={row.id}
            >
              <circle r="15" fill={TYPES[row.primary_type].hex} opacity=".16" />
              <g className={`node-paw ${freshIds.has(row.id) ? 'pop' : ''}`}>
                <path d={PAW_D} transform="translate(-11,-11) scale(0.22)" fill={TYPES[row.primary_type].hex} />
              </g>
              <text className="node-label" y={base} data-base={base} textAnchor="middle">{row.nickname}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function ParticipantDetail({row, rows}: {row: ResultRow | null; rows: ResultRow[]}) {
  if (!row) {
    return rows.length
      ? <p className="small muted center">발바닥이나 아래 이름표를 누르면 그 사람 기준으로 관계선이 그려집니다.</p>
      : null;
  }

  const type = TYPES[row.primary_type];
  const intensity = row.totals?.[row.primary_type] ?? (row.charm + row.bark);
  const charmItems = row.totals?._version === SCORE.version ? SCORE.charmItems : 5;
  const gap = Math.round(((row.charm / charmItems) - (row.bark / SCORE.barkItems)) * 10) / 10;
  const counts: Record<Relation, string[]> = {good: [], bad: [], same: []};
  rows.forEach(other => {
    if (other.id !== row.id) counts[rel(row.primary_type, other.primary_type)].push(other.nickname);
  });

  return (
    <div className="card fadeup">
      <div className="detail-grid">
        <div style={{background: type.hex, borderRadius: 14, padding: 8, display: 'grid', placeItems: 'center'}}>
          <DogFace type={row.primary_type} size={76} />
        </div>
        <div>
          <div style={{fontSize: 20, fontWeight: 800}}>
            {row.nickname} <span style={{color: type.hex}}>· {type.name}({type.breed}) {row.code}</span>
          </div>
          <div className="detail-nums" style={{marginTop: 8}}>
            <div><div className="k">매력</div><div className="v">{row.charm}</div></div>
            <div><div className="k">짖음</div><div className="v">{row.bark}</div></div>
            <div><div className="k">성향 강도</div><div className="v">{intensity}</div></div>
          </div>
          <p className="small" style={{marginTop: 10}}>{gapNote(gap)}</p>
          {counts.good.length > 0 && <div className="small" style={{marginTop: 4}}><b>통하는 사이 —</b> {counts.good.join(', ')}</div>}
          {counts.bad.length > 0 && <div className="small" style={{marginTop: 4}}><b>설명이 필요한 사이 —</b> {counts.bad.join(', ')}</div>}
          {counts.same.length > 0 && <div className="small" style={{marginTop: 4}}><b>같은 유형 —</b> {counts.same.join(', ')}</div>}
        </div>
      </div>
    </div>
  );
}

function MapGuide() {
  return (
    <div className="guide">
      <div className="card">
        <h2 style={{fontSize: 17}}>이 지도를 읽는 법</h2>
        <ol>
          <li><b>위아래는 속도입니다.</b> 위쪽은 먼저 나서는 사람, 아래쪽은 지켜보다 움직이는 사람.</li>
          <li><b>좌우는 우선순위입니다.</b> 왼쪽은 일이 먼저, 오른쪽은 사람이 먼저.</li>
          <li><b>초록 실선</b>은 축을 하나 공유하는 사이 — 설명 없이도 통합니다. <b>빨강 점선</b>은 마주 보는 사이 — 통역이 필요한 조합이지, 싫어하는 사이가 아닙니다.</li>
          <li><b>선이 없으면 같은 유형</b>입니다. 편한 만큼 서로의 짖음을 지적해줄 사람이 없습니다.</li>
          <li>노드를 눌러 한 사람씩 보세요. <b>빨강 점선으로 이어진 사람에게 한마디</b> 시켜보면 오늘 얘기가 살아납니다.</li>
        </ol>
        <p className="small muted" style={{marginTop: 10}}>채용·평가·배치의 근거로 쓰지 마세요. 자기 이해와 팀 커뮤니케이션 워크숍 용도입니다.</p>
      </div>
    </div>
  );
}

export function MapApp({group}: {group: GroupRow}) {
  const room = group.id;
  const {rows, status} = useRoom(room);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(row => row.id === selectedId) || null;

  return (
    <main className="map-wrap">
      <div className="map-top">
        <div style={{flex: 1, minWidth: 240}}>
          <p className="eyebrow">{group.name} · {group.id}</p>
          <div className="counter"><span className="n">{rows.length}</span> 명</div>
          <p className="small muted" style={{marginTop: 4, color: status.error ? 'var(--d)' : undefined}}>{status.message}</p>
          <div style={{display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap'}}>
            <button type="button" className="btn ghost" onClick={() => setSelectedId(null)}>선택 해제</button>
            <a className="btn ghost" href={participantUrl(group.id)}>참가 링크 열기</a>
          </div>
        </div>
      </div>

      <div style={{marginTop: 18}}>
        <RelationMap
          rows={rows}
          selectedId={selectedId}
          onSelect={id => setSelectedId(current => current === id ? null : id)}
        />
      </div>

      {rows.length === 0 && <div className="empty">아직 아무도 없습니다. QR을 찍어 시작해주세요. 🐾</div>}

      <div className="chips">
        {rows.map(row => (
          <button
            type="button"
            className={`chip ${row.id === selectedId ? 'sel' : ''}`}
            onClick={() => setSelectedId(current => current === row.id ? null : row.id)}
            key={row.id}
          >
            <span className="swatch" style={{background: TYPES[row.primary_type].hex}}>
              <svg viewBox="0 0 100 100" aria-hidden="true"><path d={PAW_D} /></svg>
            </span>
            {row.nickname} <span className="ct">{row.code}</span>
          </button>
        ))}
      </div>

      <div className="detail"><ParticipantDetail row={selected} rows={rows} /></div>
      {rows.length >= 2 && <MapGuide />}
    </main>
  );
}
