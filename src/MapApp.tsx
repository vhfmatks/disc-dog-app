import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {GUIDE, ORDER, SCORE, TYPES, gapNote, pawPath, rel} from '../assets/data.ts';
import type {TypeCode} from '../assets/data.ts';
import {CopyButton} from './components/CopyButton.tsx';
import {DogFace, SvgDogFace} from './components/DogFace.tsx';
import {fetchRoom, watchRoom} from './lib/db.ts';
import type {ResultRow, SpaceRow} from './lib/db.ts';
import {farthestPair, relationGroups} from './lib/map-detail.ts';
import {spaceUrl} from './lib/router.ts';
import {useMapZoom} from './hooks/useMapZoom.ts';

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

/**
 * 선택한 사람과 관계선을 그을 상대. 같은 유형은 그릴 선이 없고,
 * 나머지는 지도상 가까운 순으로 limit명까지만 남긴다 — 사람이 많아지면
 * 선을 다 그릴수록 아무것도 안 보인다.
 */
function linkedTo(selected: PlacedRow | null, placed: PlacedRow[], limit: number): PlacedRow[] {
  if (!selected) return [];
  return placed
    .filter(row => row.id !== selected.id && rel(selected.primary_type, row.primary_type) !== 'same')
    .map(row => ({row, gap: Math.hypot(row.px - selected.px, row.py - selected.py)}))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, limit)
    .map(item => item.row);
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
  selectedPair: readonly [string, string] | null;
  linkLimit: number;
  onSelect: (id: string) => void;
}

function RelationMap({rows, selectedId, selectedPair, linkLimit, onSelect}: RelationMapProps) {
  const nodesRef = useRef<SVGGElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const placed = useMemo(() => layout(rows), [rows]);
  const pairIds = new Set(selectedPair ?? []);
  const selected = selectedPair ? null : placed.find(row => row.id === selectedId) || null;
  const freshIds = new Set(placed.filter(row => !seen.current.has(row.id)).map(row => row.id));
  const linked = useMemo(() => linkedTo(selected, placed, linkLimit), [selected, placed, linkLimit]);
  const linkedIds = useMemo(() => new Set(linked.map(row => row.id)), [linked]);

  useEffect(() => {
    freshIds.forEach(id => seen.current.add(id));
  }, [freshIds]);

  const painted = useMemo(() => [...placed].sort((a, b) => {
    const rank = (row: PlacedRow) => {
      if (selectedPair?.includes(row.id)) return 3;
      if (row.id === selectedId) return 2;
      if (linkedIds.has(row.id)) return 1;
      return 0;
    };
    return rank(a) - rank(b);
  }), [placed, linkedIds, selectedId, selectedPair]);

  useLayoutEffect(() => {
    const box = nodesRef.current;
    if (!box) return;

    const taken: Rect[] = [];
    const hits = (candidate: Rect) => taken.some(other => (
      candidate.x1 < other.x2 && candidate.x2 > other.x1 &&
      candidate.y1 < other.y2 && candidate.y2 > other.y1
    ));
    const rank = (element: Element) => element.classList.contains('pair') || element.classList.contains('sel')
      ? 0
      : element.classList.contains('linked') ? 1 : 2;
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
  }, [painted, placed, selectedId, selectedPair]);

  const pairFrom = selectedPair ? placed.find(row => row.id === selectedPair[0]) : null;
  const pairTo = selectedPair ? placed.find(row => row.id === selectedPair[1]) : null;

  // 자동 선정 쌍은 둘 사이 한 선만, 단일 선택은 기존 관계선을 그대로 그린다.
  const links = pairFrom && pairTo
    ? [{
      id: `pair:${pairFrom.id}:${pairTo.id}`,
      kind: 'farthest',
      d: `M${pairFrom.px.toFixed(1)} ${pairFrom.py.toFixed(1)} L${pairTo.px.toFixed(1)} ${pairTo.py.toFixed(1)}`
    }]
    : selected
    ? linked.map(row => ({
      id: row.id,
      kind: rel(selected.primary_type, row.primary_type),
      d: `M${selected.px.toFixed(1)} ${selected.py.toFixed(1)} L${row.px.toFixed(1)} ${row.py.toFixed(1)}`
    }))
    : [];

  return (
    <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="참가자 관계도">
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
          const isPair = pairIds.has(row.id);
          const isLinked = linkedIds.has(row.id);
          const dimmed = selectedPair ? !isPair : Boolean(selected && !isSelected && !isLinked);
          const classes = ['node', isSelected && 'sel', isPair && 'pair', isLinked && 'linked', dimmed && 'dim'].filter(Boolean).join(' ');
          const base = row.stack % 2 ? -19 : 30;
          return (
            <g
              className={classes}
              data-id={row.id}
              transform={`translate(${row.px.toFixed(1)},${row.py.toFixed(1)})`}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected || isPair}
              aria-label={`${row.nickname} ${row.code}${isPair ? ' · 가장 먼 조합으로 선택됨' : ''}`}
              onClick={() => onSelect(row.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(row.id);
                }
              }}
              key={row.id}
            >
              {isPair && <circle className="pair-ring" r="22" />}
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

type MapSelection =
  | {mode: 'idle'}
  | {mode: 'single'; id: string}
  | {mode: 'analyzing'}
  | {mode: 'pair'; ids: [string, string]};

function ParticipantDetail({row, rows}: {row: ResultRow | null; rows: ResultRow[]}) {
  if (!row) return null;

  const type = TYPES[row.primary_type];
  const guide = GUIDE[row.primary_type];
  const intensity = row.totals?.[row.primary_type] ?? (row.charm + row.bark);
  const charmItems = row.totals?._version === SCORE.version ? SCORE.charmItems : 5;
  const gap = Math.round(((row.charm / charmItems) - (row.bark / SCORE.barkItems)) * 10) / 10;
  const relationships = relationGroups(row, rows);

  return (
    <div className="card fadeup">
      <div className="detail-grid">
        <div className="detail-avatar" style={{background: type.hex}}>
          <DogFace type={row.primary_type} size={76} />
        </div>
        <div>
          <h2 className="detail-name">
            {row.nickname} <span style={{color: type.hex}}>· {type.name}({type.breed}) {row.code}</span>
          </h2>
          <div className="detail-nums">
            <div><div className="k">매력</div><div className="v">{row.charm}</div></div>
            <div><div className="k">짖음</div><div className="v">{row.bark}</div></div>
            <div><div className="k">성향 강도</div><div className="v">{intensity}</div></div>
          </div>
          <p className="small detail-gap-note">{gapNote(gap)}</p>
        </div>
      </div>

      {relationships.length > 0 && (
        <section className="detail-relations" aria-labelledby="detail-relations-title">
          <h3 id="detail-relations-title">팀 안에서의 관계</h3>
          <div className="detail-relation-list">
            {relationships.map(group => (
              <div className="detail-relation-row" key={group.kind}>
                <span
                  className={`detail-relation-badge ${group.kind}`}
                  title="DISC 위치를 바탕으로 한 대화 힌트이며 실제 관계를 단정하지 않아요."
                >
                  {group.label} <b>{group.names.length}</b>
                </span>
                <span className="detail-relation-names">{group.names.join(', ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="person-guide" aria-labelledby="person-guide-title">
        <div className="person-guide-head">
          <p className="eyebrow">주 성향을 바탕으로 한 협업 힌트</p>
          <h3 id="person-guide-title">{row.nickname}님과 함께 일하는 법</h3>
          <p>{type.tagline}</p>
        </div>

        <div className="person-guide-grid">
          <article>
            <h4>업무 강점</h4>
            <div className="person-guide-tags" aria-label={`${row.nickname}님의 업무 강점`}>
              {type.charm.map(value => <span key={value}>{value}</span>)}
            </div>
            <p><b>{type.focus}</b>에 초점을 두고, {type.priorities.join(' · ')}을 중요하게 보는 편이에요.</p>
          </article>

          <article>
            <h4>스트레스 신호</h4>
            <p>{type.pressure}</p>
            <div className="person-guide-signals" aria-label="압박이 커질 때 나타날 수 있는 신호">
              {type.bark.map(value => <span key={value}>{value}</span>)}
            </div>
          </article>

          <article>
            <h4>소통 방식</h4>
            <div className="person-guide-formula" aria-label="권장 대화 순서">
              {guide.formula.map((value, index) => (
                <span key={value}>{value}{index < guide.formula.length - 1 && <i>→</i>}</span>
              ))}
            </div>
            <p>{guide.situations[0][1]}</p>
            <p className="person-guide-script"><b>첫 문장 예시</b>{guide.opener}</p>
          </article>
        </div>

        <p className="person-guide-note">
          DISC는 업무에서 보이는 선호와 경향을 이해하기 위한 대화 도구예요. 실제 행동은 상황과 경험에 따라 달라질 수 있어요.
        </p>
      </section>
    </div>
  );
}

/** 이 인원을 넘으면 칩 목록을 접은 채로 시작한다. 지도가 주인공이고 칩은 보조다. */
const CHIP_COLLAPSE_FROM = 12;

/** 선택한 사람에게 기본으로 그어줄 관계선 수. */
const DEFAULT_LINKS = 6;

interface ChipListProps {
  rows: ResultRow[];
  selectedId: string | null;
  selectedPair: string[] | null;
  onSelect: (id: string) => void;
}

function ChipList({rows, selectedId, selectedPair, onSelect}: ChipListProps) {
  // null이면 인원수에 맡기고, 한 번이라도 직접 누르면 그 선택을 유지한다.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? rows.length < CHIP_COLLAPSE_FROM;

  const groups = ORDER
    .map(code => ({type: TYPES[code], members: rows.filter(row => row.primary_type === code)}))
    .filter(group => group.members.length > 0);

  return (
    <section className="chips-panel">
      <button
        type="button"
        className="chips-toggle"
        aria-expanded={open}
        onClick={() => setOverride(!open)}
      >
        <span className={`chips-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
        <b>참가자 {rows.length}명</b>
        <span className="chips-summary">
          {groups.map(group => `${group.type.name} ${group.members.length}`).join(' · ')}
        </span>
      </button>
      {open && (
        <div className="chips-groups">
          {groups.map(group => (
            <div className="chip-group" key={group.type.code}>
              <p className="chip-group-head">
                <span className="chip-group-dot" style={{background: group.type.hex}} aria-hidden="true" />
                {group.type.name}
                <span className="chip-group-breed">{group.type.breed}</span>
                <span className="chip-group-n">{group.members.length}</span>
              </p>
              <div className="chips">
                {group.members.map(row => (
                  <button
                    type="button"
                    className={`chip ${row.id === selectedId ? 'sel' : ''} ${selectedPair?.includes(row.id) ? 'pair' : ''}`}
                    aria-pressed={row.id === selectedId || Boolean(selectedPair?.includes(row.id))}
                    onClick={() => onSelect(row.id)}
                    key={row.id}
                  >
                    <span className="swatch" style={{background: TYPES[row.primary_type].hex}}>
                      <svg viewBox="0 0 100 100" aria-hidden="true"><path d={PAW_D} /></svg>
                    </span>
                    {row.nickname} <span className="ct">{row.code}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MapGuide() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="map-guide-btn"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="map-guide-mark" aria-hidden="true">?</span>
        이 지도를 읽는 법
      </button>

      <dialog
        ref={dialogRef}
        className="map-guide-dialog"
        aria-labelledby="map-guide-title"
        onClose={() => setOpen(false)}
        onClick={event => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <form method="dialog">
          <button className="map-guide-close" value="close" aria-label="닫기">×</button>
          <h2 id="map-guide-title">이 지도를 읽는 법</h2>
          <ol>
            <li><b>위아래는 속도입니다.</b> 위쪽은 먼저 나서는 사람, 아래쪽은 지켜보다 움직이는 사람.</li>
            <li><b>좌우는 우선순위입니다.</b> 왼쪽은 일이 먼저, 오른쪽은 사람이 먼저.</li>
            <li><b>초록 실선</b>은 축을 하나 공유하는 사이 — 설명 없이도 통합니다. <b>빨강 점선</b>은 마주 보는 사이 — 통역이 필요한 조합이지, 싫어하는 사이가 아닙니다.</li>
            <li><b>선이 없으면 같은 유형</b>입니다. 편한 만큼 서로의 짖음을 지적해줄 사람이 없습니다.</li>
            <li>노드를 눌러 한 사람씩 보세요. <b>빨강 점선으로 이어진 사람에게 한마디</b> 시켜보면 오늘 얘기가 살아납니다.</li>
          </ol>
          <p className="small muted" style={{marginTop: 10}}>채용·평가·배치의 근거로 쓰지 마세요. 자기 이해와 팀 커뮤니케이션 워크숍 용도입니다.</p>
          <button className="btn block map-guide-confirm" value="close">확인</button>
        </form>
      </dialog>
    </>
  );
}

export function MapApp({space, shareUrl}: {space: SpaceRow; shareUrl: string}) {
  const room = space.id;
  const {rows, status} = useRoom(room);
  const [selection, setSelection] = useState<MapSelection>({mode: 'idle'});
  const analysisTimerRef = useRef<number | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const selectedId = selection.mode === 'single' ? selection.id : null;
  const selectedPair = selection.mode === 'pair' ? selection.ids : null;
  const isAnalyzing = selection.mode === 'analyzing';
  const selected = rows.find(row => row.id === selectedId) || null;

  const clearAnalysisTimer = () => {
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
  };

  useEffect(() => () => clearAnalysisTimer(), []);

  // 실시간으로 사람이 추가되면 현재 데이터 기준의 최장 거리 쌍을 유지한다.
  useEffect(() => {
    setSelection(current => {
      if (current.mode !== 'pair') return current;
      const pair = farthestPair(rows);
      if (!pair) return {mode: 'idle'};

      const ids: [string, string] = [pair[0].id, pair[1].id];
      return current.ids[0] === ids[0] && current.ids[1] === ids[1]
        ? current
        : {mode: 'pair', ids};
    });
  }, [rows]);

  // 선택 해제 버튼은 없다. 고른 사람을 한 번 더 누르면 풀린다.
  const selectOne = (id: string) => {
    clearAnalysisTimer();
    setSelection(current => current.mode === 'single' && current.id === id
      ? {mode: 'idle'}
      : {mode: 'single', id}
    );
  };

  const analyzeFarthestPair = () => {
    if (rows.length < 2 || isAnalyzing) return;

    clearAnalysisTimer();
    setSelection({mode: 'analyzing'});

    const reveal = () => {
      analysisTimerRef.current = null;
      const pair = farthestPair(rowsRef.current);
      setSelection(pair
        ? {mode: 'pair', ids: [pair[0].id, pair[1].id]}
        : {mode: 'idle'}
      );
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reveal();
      return;
    }

    analysisTimerRef.current = window.setTimeout(reveal, 1100);
  };

  const {viewportRef, zoom, pan, canZoomIn, canZoomOut, zoomIn, zoomOut, viewportProps} = useMapZoom();
  const [linkLimit, setLinkLimit] = useState(DEFAULT_LINKS);
  const maxLinks = Math.max(1, rows.length - 1);
  const shownLinks = Math.min(linkLimit, maxLinks);

  return (
    <main className="map-wrap">
      <div className="map-top">
        <p className="eyebrow">{space.name}</p>
        <div className="map-count">
          <div className="counter"><span className="n">{rows.length}</span> 명</div>
          <div className="map-actions">
            <a className="btn ghost sm" href={spaceUrl(space.id)}>참가 링크 열기</a>
            <CopyButton value={shareUrl} label="초대 링크 복사" className="btn ghost sm" />
          </div>
        </div>
        <p className="small muted" style={{marginTop: 4, color: status.error ? 'var(--d)' : undefined}}>{status.message}</p>
      </div>

      <div className={`map-stage ${isAnalyzing ? 'analyzing' : ''}`}>
        <div
          className={`map-viewport ${zoom > 1 ? 'zoomed' : ''}`}
          ref={viewportRef}
          {...viewportProps}
        >
          <div className="map-pan" style={{transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}>
            <RelationMap
              rows={rows}
              selectedId={selectedId}
              selectedPair={selectedPair}
              linkLimit={shownLinks}
              onSelect={selectOne}
            />
          </div>
        </div>

        {isAnalyzing && (
          <div className="map-analysis-overlay" aria-hidden="true">
            <div className="map-analysis-card">
              <span>🐾</span>
              <b>성향 거리를 분석하고 있어요</b>
              <i><span /><span /><span /></i>
            </div>
          </div>
        )}
      </div>

      <div className="map-tools">
        {/* 손가락으로는 두 손가락 핀치가, 트랙패드로는 핀치(ctrl+휠)가 같은 일을 한다.
            이 버튼은 마우스와 키보드를 위해 남는다. */}
        <div className="map-zoom" role="group" aria-label="지도 확대">
          <span className="map-zoom-label">확대</span>
          <button type="button" onClick={zoomOut} disabled={!canZoomOut} aria-label="축소">－</button>
          <b>{Math.round(zoom * 100)}%</b>
          <button type="button" onClick={zoomIn} disabled={!canZoomIn} aria-label="확대">＋</button>
        </div>

        <div className="map-links" role="group" aria-label="관계선 수">
          <span className="map-links-label">관계선</span>
          <button
            type="button"
            onClick={() => setLinkLimit(current => Math.max(1, Math.min(current, maxLinks) - 1))}
            disabled={shownLinks <= 1}
            aria-label="관계선 줄이기"
          >－</button>
          <b>{shownLinks}명</b>
          <button
            type="button"
            onClick={() => setLinkLimit(current => Math.min(maxLinks, current + 1))}
            disabled={shownLinks >= maxLinks}
            aria-label="관계선 늘리기"
          >＋</button>
        </div>
        <MapGuide />
      </div>

      {rows.length === 0 && <div className="empty">아직 아무도 없습니다. 초대 링크를 보내거나 입장 코드를 알려주세요. 🐾</div>}

      {rows.length > 0 && (
        <ChipList
          rows={rows}
          selectedId={selectedId}
          selectedPair={selectedPair}
          onSelect={selectOne}
        />
      )}

      {!selectedPair && <div className="detail"><ParticipantDetail row={selected} rows={rows} /></div>}

      <div className="map-bottom">
        <button
          type="button"
          className={`btn ghost find-pair-btn ${isAnalyzing ? 'analyzing' : ''}`}
          aria-busy={isAnalyzing}
          disabled={rows.length < 2 || isAnalyzing}
          onClick={analyzeFarthestPair}
        >
          <span className="find-pair-icon" aria-hidden="true">✦</span>
          {isAnalyzing ? '성향 거리 분석 중…' : '가장 먼 두 사람 찾기'}
        </button>
        {/* 링크 없이 들어오는 사람을 위한 안내. 프로젝터에 계속 떠 있어야 한다. */}
        <div className="join-hint">
          <p className="small muted">입장 코드</p>
          <p className="code-pill">{space.id}</p>
          <p className="small muted">비밀번호는 진행자에게 물어보세요</p>
        </div>
      </div>
    </main>
  );
}
