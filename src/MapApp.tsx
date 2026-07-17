import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {GUIDE, ORDER, SCORE, TYPES, gapNote, pawPath} from '../assets/data.ts';
import type {Relation, TypeCode} from '../assets/data.ts';
import {CopyButton} from './components/CopyButton.tsx';
import {DogFace, SvgDogFace} from './components/DogFace.tsx';
import {ShareSpaces} from './components/ShareSpaces.tsx';
import {SpaceIcon} from './components/SpaceIcon.tsx';
import {fetchMapResults} from './lib/db.ts';
import type {AvailableSource, MapResultRow, SpaceRow, SpaceSummary} from './lib/db.ts';
import {RELATION_LABEL, RELATION_ORDER, farthestPair, relationGroups, relationLinks} from './lib/map-detail.ts';
import {MAX_WITH_SPACES, spaceTogetherMapUrl, spaceUrl} from './lib/router.ts';
import {DEFAULT_SPACE_ICON_ID, isSpaceIconId} from './lib/space-icons.ts';
import type {SpaceIconId} from './lib/space-icons.ts';
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

const safeIconId = (value: string | undefined): SpaceIconId =>
  value && isSpaceIconId(value) ? value : DEFAULT_SPACE_ICON_ID;

/** 지도가 갱신되는 주기. 실시간 구독은 anon 권한과 함께 걷혔다 (useMapRows). */
const REFRESH_MS = 20_000;

/**
 * 함께보기에서 스페이스를 구분하는 색.
 *
 * ⚠ DISC 유형 색(TYPES[].hex)과 절대 섞으면 안 된다. 노드의 색은 언제나 유형이고,
 *   스페이스는 테두리와 배지로만 말한다 — 지도를 읽는 축이 둘로 갈라지면 둘 다 못 읽는다.
 */
const SOURCE_COLORS = [
  '#7c3aed', '#0891b2', '#c2410c', '#4d7c0f', '#be123c',
  '#0369a1', '#a16207', '#6d28d9', '#0f766e'
];

/** 화면 좌표와 겹침 보정을 얹은 행. */
interface PlacedRow extends MapResultRow {
  px: number;
  py: number;
  stack: number;
}

function layout(rows: MapResultRow[]): PlacedRow[] {
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

interface MapData {
  rows: MapResultRow[];
  availableSources: AvailableSource[];
  /** 수락을 기다리는 제안. 지도 아래 공유 서랍이 버튼을 띄우는 근거다. */
  pendingOffers: SpaceSummary[];
  status: {message: string; error: boolean};
  /** 공유가 끝나 방금 화면에서 빠진 스페이스가 있으면 알린다. */
  notice: string;
  /** 공유를 바꾼 직후처럼, 20초를 기다리지 않고 지금 다시 읽어야 할 때. */
  reload: () => void;
  /**
   * 서버가 거절한 source. 화면과 주소에서 빼야 할 목록이다.
   *
   * ⚠ "허락된 것만 남긴다"를 availableSources로 계산하면 안 된다. 첫 조회가 돌아오기
   *   전에는 그게 비어 있어서, 주소로 열린 함께보기가 스스로를 지워버린다. 빼는 건
   *   서버가 실제로 거절했을 때만이다.
   */
  denied: string[];
}

/**
 * 지도가 그릴 모든 것.
 *
 * ⚠ 예전에는 여기서 Realtime을 구독했습니다. 그건 anon이 results를 직접 읽을 수 있어야
 *   동작하는데, 그 권한이 함께보기와 함께 사라졌습니다 (6_server_side_results). 정책이
 *   없으면 그 채널은 조용히 아무것도 주지 않으므로, "왜 안 오지"를 다음 사람이
 *   디버깅하게 두느니 지워버리고 주기적 갱신만 남깁니다. 검증된 사용자만 붙는 비공개
 *   Broadcast 채널은 후속 과제입니다.
 *
 * 행을 누적하지 않고 매번 갈아끼웁니다. 권한이 끝난 스페이스의 결과가 화면에서 빠져야
 * 하는데, 누적하면 이미 그린 노드가 영영 남기 때문입니다.
 */
function useMapRows(room: string, token: string, sources: string[]): MapData {
  const [data, setData] = useState<Pick<MapData, 'rows' | 'availableSources' | 'pendingOffers'>>({
    rows: [], availableSources: [], pendingOffers: []
  });
  const [status, setStatus] = useState({message: '연결 중…', error: false});
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState<string[]>([]);
  const [tick, setTick] = useState(0);

  // 배열을 그대로 의존성에 넣으면 매 렌더마다 새 참조라 effect가 계속 돈다.
  const key = sources.join(',');
  const idle = `${Math.round(REFRESH_MS / 1000)}초마다 자동으로 새로고침합니다`;

  const load = useCallback(async (alive: () => boolean) => {
    const requested = key ? key.split(',') : [];
    const response = await fetchMapResults(room, token, requested);
    if (!alive()) return;

    if (response.ok) {
      setData({
        rows: response.rows,
        availableSources: response.availableSources,
        pendingOffers: response.pendingOffers
      });
      setStatus({message: idle, error: false});
      setDenied([]);
      return;
    }

    // 열어둔 화면에서 공유가 끝났다. 어떤 스페이스가 빠졌는지는 서버가 알려주므로
    // (deniedSourceIds) 그것만 빼고 즉시 다시 부른다 — 화면을 통째로 죽이지 않는다.
    if (response.code === 'SOURCE_NOT_GRANTED' && response.deniedSourceIds?.length) {
      const out = new Set(response.deniedSourceIds);
      const survivors = requested.filter(id => !out.has(id));
      setNotice('공유가 종료되어 일부 스페이스가 제외되었습니다.');
      setDenied(response.deniedSourceIds);

      const retry = await fetchMapResults(room, token, survivors);
      if (!alive()) return;
      if (retry.ok) {
        setData({
          rows: retry.rows,
          availableSources: retry.availableSources,
          pendingOffers: retry.pendingOffers
        });
        setStatus({message: idle, error: false});
      } else {
        setStatus({message: `데이터를 불러오지 못했습니다 — ${retry.error}`, error: true});
      }
      return;
    }

    setStatus({message: `데이터를 불러오지 못했습니다 — ${response.error}`, error: true});
  }, [room, token, key, idle]);

  useEffect(() => {
    let active = true;
    const alive = () => active;

    void load(alive);
    const interval = window.setInterval(() => void load(alive), REFRESH_MS);
    // 탭을 다시 보면 20초를 기다리지 않는다.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(alive);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, tick]);

  const reload = useCallback(() => setTick(value => value + 1), []);
  return {...data, status, notice, denied, reload};
}

interface Rect {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface RelationMapProps {
  rows: MapResultRow[];
  selectedId: string | null;
  selectedPair: readonly [string, string] | null;
  kinds: Relation[];
  /** 스페이스별 테두리 색. 단일 지도에서는 비어 있다. */
  sourceColors: Map<string, string>;
  hostSpaceId: string;
  onSelect: (id: string) => void;
}

function RelationMap({
  rows, selectedId, selectedPair, kinds, sourceColors, hostSpaceId, onSelect
}: RelationMapProps) {
  const nodesRef = useRef<SVGGElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const placed = useMemo(() => layout(rows), [rows]);
  const pairIds = new Set(selectedPair ?? []);
  const selected = selectedPair ? null : placed.find(row => row.id === selectedId) || null;
  const freshIds = new Set(placed.filter(row => !seen.current.has(row.id)).map(row => row.id));
  const linked = useMemo(
    () => (selected ? relationLinks(selected, placed, kinds) : []),
    [selected, placed, kinds]
  );
  const linkedIds = useMemo(() => new Set(linked.map(link => link.row.id)), [linked]);

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
    ? linked.map(({row, kind}) => ({
      id: row.id,
      kind,
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
          const foreign = row.room !== hostSpaceId;
          const sourceColor = sourceColors.get(row.room);
          const spaceName = row.source_space?.name || row.room;
          // 발자국 아래에는 닉네임만 쓴다. 스페이스 이름까지 붙이면 라벨이 두세 배로
          // 길어져 서로 밀어내고, 지도가 글자밭이 된다 — 지도는 점의 위치를 읽는
          // 그림이지 명단이 아니다.
          //
          // 그럼 어느 스페이스 사람인지는? 노드 테두리 색이 말한다 (node-source-ring).
          // 색으로는 부족할 때를 위해 칩 목록·상세 카드·스페이스 필터가 이름을 들고
          // 있고, 눈으로 색을 못 읽는 사람에겐 아래 aria-label이 말해준다.
          return (
            <g
              className={classes}
              data-id={row.id}
              transform={`translate(${row.px.toFixed(1)},${row.py.toFixed(1)})`}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected || isPair}
              aria-label={
                `${foreign ? `${spaceName} 스페이스의 ` : ''}${row.nickname} ${row.code}`
                + `${isPair ? ' · 가장 먼 조합으로 선택됨' : ''}`
              }
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
              {/* 스페이스는 테두리로만 말한다. 채움색은 언제나 DISC 유형이다. */}
              {sourceColor && (
                <circle className="node-source-ring" r="15.5" fill="none" stroke={sourceColor} />
              )}
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

function ParticipantDetail({row, rows, hostSpaceId, sourceColors}: {
  row: MapResultRow | null;
  rows: MapResultRow[];
  hostSpaceId: string;
  sourceColors: Map<string, string>;
}) {
  if (!row) return null;

  const type = TYPES[row.primary_type];
  const guide = GUIDE[row.primary_type];
  const intensity = row.totals?.[row.primary_type] ?? (row.charm + row.bark);
  const charmItems = row.totals?._version === SCORE.version ? SCORE.charmItems : 5;
  const gap = Math.round(((row.charm / charmItems) - (row.bark / SCORE.barkItems)) * 10) / 10;
  const relationships = relationGroups(row, rows, hostSpaceId);
  const foreign = row.room !== hostSpaceId;

  return (
    <div className="card fadeup">
      <div className="detail-grid">
        <div className="detail-avatar" style={{background: type.hex}}>
          <DogFace type={row.primary_type} size={76} />
        </div>
        <div>
          {/* 상세는 자리가 넉넉하니 어디 사람인지 언제나 밝힌다. 같은 닉네임이
              여러 스페이스에 있을 수 있어, 여기서 헷갈리면 다른 사람을 읽게 된다. */}
          {foreign && (
            <p className="detail-space" style={{color: sourceColors.get(row.room)}}>
              <SpaceIcon iconId={safeIconId(row.source_space?.icon_id)} size={18} decorative />
              {row.source_space?.name || row.room}
            </p>
          )}
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

interface ChipListProps {
  rows: MapResultRow[];
  selectedId: string | null;
  selectedPair: string[] | null;
  hostSpaceId: string;
  sourceColors: Map<string, string>;
  onSelect: (id: string) => void;
}

function ChipList({rows, selectedId, selectedPair, hostSpaceId, sourceColors, onSelect}: ChipListProps) {
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
                {group.members.map(row => {
                  const foreign = row.room !== hostSpaceId;
                  return (
                    <button
                      type="button"
                      className={`chip ${row.id === selectedId ? 'sel' : ''} ${selectedPair?.includes(row.id) ? 'pair' : ''}`}
                      aria-pressed={row.id === selectedId || Boolean(selectedPair?.includes(row.id))}
                      style={foreign ? {borderColor: sourceColors.get(row.room)} : undefined}
                      onClick={() => onSelect(row.id)}
                      key={row.id}
                    >
                      <span className="swatch" style={{background: TYPES[row.primary_type].hex}}>
                        <svg viewBox="0 0 100 100" aria-hidden="true"><path d={PAW_D} /></svg>
                      </span>
                      {foreign && (
                        <span className="chip-space" style={{color: sourceColors.get(row.room)}}>
                          {row.source_space?.name || row.room} ·
                        </span>
                      )}
                      {row.nickname} <span className="ct">{row.code}</span>
                    </button>
                  );
                })}
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
      {/* 물음표만 남긴다. 글자가 빠지면 접근성 이름도 같이 빠지므로 aria-label로 남긴다. */}
      <button
        type="button"
        className="map-guide-btn"
        aria-haspopup="dialog"
        aria-label="이 지도를 읽는 법"
        title="이 지도를 읽는 법"
        onClick={() => setOpen(true)}
      >
        <span className="map-guide-mark" aria-hidden="true">?</span>
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
            <li><b>회색 선은 같은 유형</b>입니다. 편한 만큼 서로의 짖음을 지적해줄 사람이 없습니다.</li>
            <li>노드를 눌러 한 사람씩 보세요. <b>빨강 점선으로 이어진 사람에게 한마디</b> 시켜보면 오늘 얘기가 살아납니다.</li>
            <li>사람을 고르면 지도 아래에 <b>세 가지 사이를 끄고 켜는 버튼</b>이 나옵니다. 「설명이 필요한 사이」만 남기면 그 사람과 오늘 이야기할 조합이 한눈에 보입니다.</li>
          </ol>
          <p className="small muted" style={{marginTop: 10}}>채용·평가·배치의 근거로 쓰지 마세요. 자기 이해와 팀 커뮤니케이션 워크숍 용도입니다.</p>
          <button className="btn block map-guide-confirm" value="close">확인</button>
        </form>
      </dialog>
    </>
  );
}

interface TogetherPickerProps {
  hostSpace: SpaceRow;
  availableSources: AvailableSource[];
  selected: string[];
  /** 주소에 ?with=를 달고 들어왔으면 펼친 채로 연다. 첫 조회 전이라 selected는 아직 비어 있다. */
  defaultOpen: boolean;
  hostCount: number;
  sourceColors: Map<string, string>;
  onChange: (ids: string[]) => void;
}

/**
 * 함께 볼 스페이스 고르기.
 *
 * 기준 스페이스는 끌 수 없다 — 함께보기는 "내 지도에 남을 얹는" 것이지 남의 지도를
 * 대신 보는 게 아니다. 인원수를 미리 보여주고 총량을 넘는 조합은 못 고르게 막는다:
 * 서버에도 상한이 있지만, 사용자가 풀 방법이 없는 오류를 정상 경로로 삼지 않는다.
 */
function TogetherPicker({
  hostSpace, availableSources, selected, defaultOpen, hostCount, sourceColors, onChange
}: TogetherPickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const chosen = new Set(selected);
  const total = hostCount + availableSources
    .filter(source => chosen.has(source.id))
    .reduce((sum, source) => sum + source.result_count, 0);

  const toggle = (id: string) => {
    if (chosen.has(id)) onChange(selected.filter(value => value !== id));
    else if (selected.length < MAX_WITH_SPACES) onChange([...selected, id]);
  };

  return (
    <section className="together-panel">
      <button
        type="button"
        className="together-toggle"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <span className={`chips-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
        <b>함께보기</b>
        <span className="chips-summary">
          {selected.length
            ? `${selected.length + 1}개 스페이스 · ${total}명`
            : `공유받은 스페이스 ${availableSources.length}개`}
        </span>
      </button>

      {open && (
        <div className="together-options" role="group" aria-label="함께 볼 스페이스">
          <label className="together-choice host">
            <input type="checkbox" checked disabled readOnly />
            <span className="together-icon" aria-hidden="true">
              <SpaceIcon iconId={safeIconId(hostSpace.icon_id)} size={30} decorative />
            </span>
            <span className="together-main">
              <b>{hostSpace.name}</b>
              <span className="small muted">기준 스페이스 · {hostCount}명</span>
            </span>
          </label>

          {availableSources.map(source => {
            const on = chosen.has(source.id);
            const full = !on && selected.length >= MAX_WITH_SPACES;
            return (
              <label className={`together-choice ${on ? 'on' : ''}`} key={source.id}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={full}
                  onChange={() => toggle(source.id)}
                />
                <span
                  className="together-icon"
                  aria-hidden="true"
                  style={on ? {boxShadow: `0 0 0 2px ${sourceColors.get(source.id)}`} : undefined}
                >
                  <SpaceIcon iconId={safeIconId(source.icon_id)} size={30} decorative />
                </span>
                <span className="together-main">
                  <b>{source.name}</b>
                  <span className="small muted">공유받음 · {source.result_count}명</span>
                </span>
              </label>
            );
          })}

          {selected.length >= MAX_WITH_SPACES && (
            <p className="small muted">한 번에 {MAX_WITH_SPACES}개까지 고를 수 있습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}

export function MapApp({space, token, shareUrl, withSpaceIds}: {
  space: SpaceRow;
  token: string;
  shareUrl: string;
  withSpaceIds?: string[];
}) {
  const room = space.id;

  // 주소가 화면 상태의 주인이다 — 함께보기를 켠 채로 새로고침·북마크·공유가 되어야
  // 한다. 주소를 신뢰한다는 뜻은 아니다: 권한은 서버가 grant로 매번 다시 판정한다.
  const [sources, setSources] = useState<string[]>(withSpaceIds || []);
  useEffect(() => { setSources(withSpaceIds || []); }, [withSpaceIds]);

  const {rows, availableSources, pendingOffers, status, notice, denied, reload} =
    useMapRows(room, token, sources);

  const sourceColors = useMemo(() => new Map(
    availableSources.map((source, index) => [source.id, SOURCE_COLORS[index % SOURCE_COLORS.length]])
  ), [availableSources]);

  const selectSources = useCallback((ids: string[]) => {
    setSources(ids);
    // 주소창만 갈아끼운다 — 히스토리를 쌓으면 뒤로가기가 스페이스 하나씩 벗겨진다.
    window.history.replaceState(null, '', spaceTogetherMapUrl(room, ids));
  }, [room]);

  // 서버가 거절한 스페이스를 화면과 주소에서 뺀다. 서버가 실제로 아니라고 한 뒤에만
  // 움직인다 — 첫 조회 전에 지레 지우면 주소로 연 함께보기가 스스로를 지운다.
  const deniedKey = denied.join(',');
  useEffect(() => {
    if (!deniedKey) return;
    const out = new Set(deniedKey.split(','));
    setSources(current => {
      const next = current.filter(id => !out.has(id));
      if (next.length === current.length) return current;
      window.history.replaceState(null, '', spaceTogetherMapUrl(room, next));
      return next;
    });
  }, [deniedKey, room]);

  // 서버가 준 데이터에 실제로 들어 있는 스페이스. 화면은 언제나 이쪽을 믿는다.
  const activeSources = useMemo(() => {
    const allowed = new Set(availableSources.map(source => source.id));
    return sources.filter(id => allowed.has(id));
  }, [sources, availableSources]);

  const [selection, setSelection] = useState<MapSelection>({mode: 'idle'});
  const analysisTimerRef = useRef<number | null>(null);

  // 스페이스별로 좁혀 보기. ''는 전체다. 고른 스페이스가 화면에서 빠지면 전체로 돌아간다.
  const [spaceFilter, setSpaceFilter] = useState('');
  const filterable = spaceFilter && (spaceFilter === room || activeSources.includes(spaceFilter));
  useEffect(() => {
    if (spaceFilter && !filterable) setSpaceFilter('');
  }, [spaceFilter, filterable]);

  /** 지금 지도에 있는 것 전부. 아래 계산은 모두 이 범위 안에서만 한다. */
  const visible = useMemo(
    () => (filterable ? rows.filter(row => row.room === spaceFilter) : rows),
    [rows, spaceFilter, filterable]
  );

  const rowsRef = useRef(visible);
  rowsRef.current = visible;

  const selectedId = selection.mode === 'single' ? selection.id : null;
  const selectedPair = selection.mode === 'pair' ? selection.ids : null;
  const isAnalyzing = selection.mode === 'analyzing';
  const selected = visible.find(row => row.id === selectedId) || null;

  // 고른 사람이 사라졌다 (공유 종료, 필터 변경). 선택 상태를 놓아준다 — 안 그러면
  // 아무도 없는데 상세 카드만 남거나, 없는 사람에게 관계선을 그리려 든다.
  useEffect(() => {
    setSelection(current => {
      if (current.mode === 'single' && !visible.some(row => row.id === current.id)) {
        return {mode: 'idle'};
      }
      if (current.mode === 'pair' && !current.ids.every(id => visible.some(row => row.id === id))) {
        return {mode: 'idle'};
      }
      return current;
    });
  }, [visible]);

  const clearAnalysisTimer = () => {
    if (analysisTimerRef.current !== null) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
  };

  useEffect(() => () => clearAnalysisTimer(), []);

  // 사람이 추가되면 현재 데이터 기준의 최장 거리 쌍을 유지한다. 기준은 언제나 지금
  // 보고 있는 범위다 — 함께보기를 켰으면 그 조합에서, 한 스페이스로 좁혔으면 그 안에서.
  useEffect(() => {
    setSelection(current => {
      if (current.mode !== 'pair') return current;
      const pair = farthestPair(visible);
      if (!pair) return {mode: 'idle'};

      const ids: [string, string] = [pair[0].id, pair[1].id];
      return current.ids[0] === ids[0] && current.ids[1] === ids[1]
        ? current
        : {mode: 'pair', ids};
    });
  }, [visible]);

  // 처음에는 세 관계를 다 보여주고, 필요 없는 사이만 하나씩 끄게 한다.
  // 마지막 하나는 끄지 못한다 — 셋 다 꺼진 지도는 선이 없어 아무 말도 하지 않는다.
  const [kinds, setKinds] = useState<Relation[]>(RELATION_ORDER);
  const lastOn = (kind: Relation) => kinds.length === 1 && kinds[0] === kind;
  const toggleKind = (kind: Relation) => setKinds(current => current.includes(kind)
    ? (current.length === 1 ? current : current.filter(item => item !== kind))
    : RELATION_ORDER.filter(item => item === kind || current.includes(item))
  );

  // 선택 해제 버튼은 없다. 고른 사람을 한 번 더 누르면 풀린다.
  const selectOne = (id: string) => {
    clearAnalysisTimer();
    // 사람을 바꿀 때마다 필터도 처음으로 돌린다 — 앞사람에게 맞춰 끈 사이를 그대로
    // 끌고 오면, 다음 사람의 선이 왜 비어 있는지 알아챌 방법이 없다.
    setKinds(RELATION_ORDER);
    setSelection(current => current.mode === 'single' && current.id === id
      ? {mode: 'idle'}
      : {mode: 'single', id}
    );
  };

  const analyzeFarthestPair = () => {
    if (visible.length < 2 || isAnalyzing) return;

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

  const {viewportRef, zoom, pan, viewportProps} = useMapZoom();

  const together = activeSources.length > 0;
  const spaceTabs = together
    ? [{id: '', name: '전체'}, {id: room, name: space.name},
      ...activeSources.flatMap(id => {
        const source = availableSources.find(item => item.id === id);
        return source ? [{id, name: source.name}] : [];
      })]
    : [];

  return (
    <main className="map-wrap">
      <div className="map-top">
        <p className="eyebrow">
          {space.name}
          {together && <span className="map-together-tag">+ {activeSources.length}개 스페이스</span>}
        </p>
        <div className="map-count">
          <div className="counter"><span className="n">{visible.length}</span> 명</div>
          <div className="map-actions">
            <a className="btn ghost sm" href={spaceUrl(space.id)}>참가 링크 열기</a>
            <CopyButton value={shareUrl} label="초대 링크 복사" className="btn ghost sm" />
          </div>
        </div>
        <p className="small muted" style={{marginTop: 4, color: status.error ? 'var(--d)' : undefined}}>{status.message}</p>
        {notice && <p className="small map-notice" role="status">{notice}</p>}
      </div>

      {availableSources.length > 0 && (
        <TogetherPicker
          hostSpace={space}
          availableSources={availableSources}
          selected={activeSources}
          defaultOpen={(withSpaceIds || []).length > 0}
          hostCount={rows.filter(row => row.room === room).length}
          sourceColors={sourceColors}
          onChange={selectSources}
        />
      )}

      {together && (
        <div className="space-filters" role="group" aria-label="스페이스별 보기">
          {spaceTabs.map(tab => (
            <button
              type="button"
              key={tab.id || 'all'}
              className={`space-filter ${spaceFilter === tab.id ? 'on' : ''}`}
              aria-pressed={spaceFilter === tab.id}
              style={tab.id && tab.id !== room
                ? {'--source-color': sourceColors.get(tab.id)} as React.CSSProperties
                : undefined}
              onClick={() => setSpaceFilter(tab.id)}
            >
              {tab.id && tab.id !== room && <i className="space-filter-dot" aria-hidden="true" />}
              {tab.name}
            </button>
          ))}
        </div>
      )}

      <div className={`map-stage ${isAnalyzing ? 'analyzing' : ''}`}>
        <div
          className={`map-viewport ${zoom > 1 ? 'zoomed' : ''}`}
          ref={viewportRef}
          {...viewportProps}
        >
          <div className="map-pan" style={{transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}>
            <RelationMap
              rows={visible}
              selectedId={selectedId}
              selectedPair={selectedPair}
              kinds={kinds}
              sourceColors={together ? sourceColors : new Map()}
              hostSpaceId={room}
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
        {/* 범례이자 필터다 — 셋 다 켜면 전체가 보이고, 하나씩 끄면 그 사이가 빠진다.
            사람을 고른 동안에만 나온다: 선이 없는 지도에서는 끄고 켤 것도, 범례로
            읽을 것도 없다. */}
        {selectedId && (
          <div className="map-filters" role="group" aria-label="관계선 종류">
            {RELATION_ORDER.map(kind => (
              <button
                type="button"
                key={kind}
                className={`map-filter ${kind}`}
                aria-pressed={kinds.includes(kind)}
                disabled={lastOn(kind)}
                onClick={() => toggleKind(kind)}
              >
                <i aria-hidden="true" />
                {RELATION_LABEL[kind]}
              </button>
            ))}
          </div>
        )}
        <MapGuide />
      </div>

      {visible.length === 0 && <div className="empty">아직 아무도 없습니다. 초대 링크를 보내거나 입장 코드를 알려주세요. 🐾</div>}

      {visible.length > 0 && (
        <ChipList
          rows={visible}
          selectedId={selectedId}
          selectedPair={selectedPair}
          hostSpaceId={room}
          sourceColors={together ? sourceColors : new Map()}
          onSelect={selectOne}
        />
      )}

      {!selectedPair && (
        <div className="detail">
          <ParticipantDetail
            row={selected}
            rows={visible}
            hostSpaceId={room}
            sourceColors={sourceColors}
          />
        </div>
      )}

      <div className="map-bottom">
        <button
          type="button"
          className={`btn ghost find-pair-btn ${isAnalyzing ? 'analyzing' : ''}`}
          aria-busy={isAnalyzing}
          disabled={visible.length < 2 || isAnalyzing}
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

      {/* 맨 아래다. 지도가 주인공이고 공유는 진행자가 가끔 여는 서랍이다. */}
      <ShareSpaces
        spaceId={room}
        spaceName={space.name}
        pendingOffers={pendingOffers}
        onChanged={reload}
      />
    </main>
  );
}
