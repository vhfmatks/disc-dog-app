// MSC 뇌인지 행동유형맵 — 6지표 × 4단계 평행좌표 모델.
//
// 이론 프레임: 브레인OS연구소 BOSI(뇌인지적성검사)의 뇌인지 유형 + 행동/환경 지표.
// 공식 "뇌인지행동유형맵"은 6개 열(지표) × 4행(단계)의 그리드에 한 칸씩 골라 선으로
// 잇는 그래프다 (MscMap6.tsx). 문항·색·문구는 전부 자체 작성이며 상용 검사를 복제하지 않는다.
//
// 6지표: 뇌인지성향(cog, 8유형에서 좌↔우뇌로 파생) · 뇌인지환경(env) · 신체활동성향(phys)
//        · 주도적행동성향(init) · 대인행동성향(inter) · 과제행동성향(task).
// 8유형은 결과 카드와 유형 위치(BrainWheel)에 그대로 쓴다.
//
// MVP 범위: 결과는 서버가 아니라 localStorage에만 남는다 (msc-store.ts).
//
// ⚠ 문항 텍스트에 정답 힌트(유형명·지표 라벨·좌뇌/우뇌/뇌 등)를 넣지 말 것.
//   (scripts/verify-msc.mjs가 검증)

export type Hemisphere = 'R' | 'L';

/** 우뇌 4(R1~R4) + 좌뇌 4(L1~L4). */
export type MscTypeCode = 'R1' | 'R2' | 'R3' | 'R4' | 'L1' | 'L2' | 'L3' | 'L4';

/** 문항이 재는 척도. type=8유형, 나머지는 각 행동/환경 지표. */
export type Scale = 'type' | 'env' | 'phys' | 'lead' | 'soc' | 'task';

/** 맵의 6개 열(지표). cog는 8유형에서 파생된다. */
export type DimKey = 'cog' | 'env' | 'phys' | 'init' | 'inter' | 'task';

export interface MscTypeInfo {
  code: MscTypeCode;
  hemisphere: Hemisphere;
  name: string;
  short: string;
  hex: string;
  tagline: string;
  strengths: string[];
  fields: string[];
  /** 8유형 위치 휠의 각도(도). 오른쪽 절반=우뇌, 왼쪽 절반=좌뇌. */
  angle: number;
}

export interface MscQuestion {
  k: Scale;
  t?: MscTypeCode;
  x: string;
}

export interface DimLevel {
  label: string;
  en: string;
}

export interface Indicator {
  key: DimKey;
  title: string;
  en: string;
  hex: string;
  /** index 0 = 아래(약)·3 = 위(강). 맵의 행 순서(아래→위)와 맞춘다. */
  levels: [DimLevel, DimLevel, DimLevel, DimLevel];
}

export interface MscResult {
  /** 8유형 원점수. */
  scores: Record<MscTypeCode, number>;
  rank: MscTypeCode[];
  primary: MscTypeCode;
  secondary: MscTypeCode | null;
  code: string;
  intensity: number;
  angle: number;
  radius: number;
  /** 6개 지표 레벨 0~3. 맵의 세로 위치. */
  levels: Record<DimKey, number>;
}

export const MSC_ORDER: MscTypeCode[] = ['R1', 'R2', 'R3', 'R4', 'L1', 'L2', 'L3', 'L4'];

// 우뇌=따뜻한 색(오른쪽 절반), 좌뇌=차가운 색(왼쪽 절반). 45°씩 8분할.
export const MSC_TYPES: Record<MscTypeCode, MscTypeInfo> = {
  R1: {
    code: 'R1', hemisphere: 'R', name: '우뇌직관형', short: '직관', hex: '#EF5D4E',
    tagline: '설명보다 감이 먼저 온다. 순발력으로 그 자리의 흐름을 바꾼다.',
    strengths: ['직관', '순발력', '감각'], fields: ['기획', '디자인', '크리에이티브'], angle: 67.5
  },
  R2: {
    code: 'R2', hemisphere: 'R', name: '우뇌소통형', short: '소통', hex: '#F0883C',
    tagline: '사람의 기분 변화를 먼저 읽고 이어붙인다.',
    strengths: ['공감', '소통', '관계'], fields: ['상담', '마케팅', '인사'], angle: 22.5
  },
  R3: {
    code: 'R3', hemisphere: 'R', name: '우뇌전략형', short: '전략', hex: '#E8B23A',
    tagline: '눈앞보다 몇 수 앞을 그리고, 사람을 모아 방향을 잡는다.',
    strengths: ['통찰', '현실감각', '리더십'], fields: ['경영', '전략', '조직관리'], angle: 337.5
  },
  R4: {
    code: 'R4', hemisphere: 'R', name: '우뇌컨셉디자인형', short: '균형', hex: '#D96BA6',
    tagline: '감으로 끌리다가도 숫자로 한 번 더 저울질하는 균형가.',
    strengths: ['균형', '수리직관', '합리'], fields: ['재무', '기획', '저널리즘'], angle: 292.5
  },
  L1: {
    code: 'L1', hemisphere: 'L', name: '좌뇌컨셉논리형', short: '개념', hex: '#4FA3C7',
    tagline: '전체 틀부터 세우고, 흩어진 생각을 구조로 정리한다.',
    strengths: ['개념설계', '기획력', '논리'], fields: ['정책기획', 'IT', '컨셉설계'], angle: 112.5
  },
  L2: {
    code: 'L2', hemisphere: 'L', name: '좌뇌실험탐구형', short: '탐구', hex: '#3E9E82',
    tagline: '궁금하면 직접 파본다. 한 주제를 오래 파고든다.',
    strengths: ['탐구', '관찰', '끈기'], fields: ['연구', '자연과학', '의학'], angle: 157.5
  },
  L3: {
    code: 'L3', hemisphere: 'L', name: '좌뇌탐구통합형', short: '통합', hex: '#5B76C9',
    tagline: '서로 다른 걸 엮어 새 방법을 만들고, 이론을 현실에 붙인다.',
    strengths: ['통합', '응용', '연결'], fields: ['엔지니어링', '개발', '설계'], angle: 202.5
  },
  L4: {
    code: 'L4', hemisphere: 'L', name: '좌뇌분석해결형', short: '분석', hex: '#7A5BB0',
    tagline: '잘게 쪼개 따지고, 빈틈과 모순을 먼저 찾아낸다.',
    strengths: ['분석', '정밀', '문제해결'], fields: ['엔지니어링', '데이터', '품질'], angle: 247.5
  }
};

// 공식 맵의 6개 열. 색은 맵 이미지에 맞춘 근사값. levels[0]=맨 아래 칸, [3]=맨 위 칸.
export const INDICATORS: Indicator[] = [
  {
    key: 'cog', title: '뇌인지성향', en: 'Cognitive Orientation', hex: '#3E76B5',
    levels: [
      {label: '우뇌직관소통형', en: 'Intuitive Communication'},
      {label: '우뇌전략판단형', en: 'Strategic Foresight'},
      {label: '좌뇌실험탐구형', en: 'Experimental Research'},
      {label: '좌뇌분석해결형', en: 'Analytical Left-brain'}
    ]
  },
  {
    key: 'env', title: '뇌인지환경', en: 'Cognition & Environment', hex: '#4CA37A',
    levels: [
      {label: '현실검증형', en: 'Reality Evaluative'},
      {label: '실용선택형', en: 'Practically Adaptive'},
      {label: '창의기획형', en: 'Creative Planning'},
      {label: '창의예술형', en: 'Artistically Creative'}
    ]
  },
  {
    key: 'phys', title: '신체활동성향', en: 'Physical Aptness', hex: '#E8836B',
    levels: [
      {label: '정적활동형', en: 'Sedentary'},
      {label: '양면적활동형', en: 'Dual-sided Active'},
      {label: '동적활동형', en: 'Physically Proactive'},
      {label: '역동적활동형', en: 'Dynamically Active'}
    ]
  },
  {
    key: 'init', title: '주도적행동성향', en: 'Self-Initiative Faculty', hex: '#E85C8A',
    levels: [
      {label: '안정지향형', en: 'Stability Oriented'},
      {label: '조화지향형', en: 'Harmony Oriented'},
      {label: '목표지향형', en: 'Goal Oriented'},
      {label: '도전지향형', en: 'Change Oriented'}
    ]
  },
  {
    key: 'inter', title: '대인행동성향', en: 'Interpersonal Faculty', hex: '#E8A24C',
    levels: [
      {label: '관계독립형', en: 'Relationally Independent'},
      {label: '관계선택형', en: 'Relationally Selective'},
      {label: '관계중심형', en: 'Relation Oriented'},
      {label: '관계포용형', en: 'Relationship Embracing'}
    ]
  },
  {
    key: 'task', title: '과제행동성향', en: 'Task Execution Faculty', hex: '#3A3A4D',
    levels: [
      {label: '선호과제형', en: 'Task Selective'},
      {label: '주요과제형', en: 'Task Priority'},
      {label: '과제책임형', en: 'Task Completion'},
      {label: '완벽주의형', en: 'Perfection Oriented'}
    ]
  }
];

export const MSC_SCALE: Array<{v: number; label: string}> = [
  {v: 1, label: '전혀 아니다'},
  {v: 2, label: '아니다'},
  {v: 3, label: '보통이다'},
  {v: 4, label: '그렇다'},
  {v: 5, label: '매우 그렇다'}
];

// ── 문항 ────────────────────────────────────────────────────────────
// 자체 작성. 8유형 각 6(=48) + env/phys/task 각 6 + lead/soc 각 8 = 82문항.
// 유형·지표 힌트 없는 행동 묘사만. scripts/verify-msc.mjs가 개수·중복·힌트를 검증한다.
const TYPE_ITEMS: Record<MscTypeCode, string[]> = {
  R1: [
    '근거를 정리하기도 전에 답이 먼저 떠오른다',
    '복잡하게 따지지 않아도 결정은 순식간에 내린다',
    '예상 못 한 일이 생겨도 그 자리에서 바로 대응한다',
    '물건을 고를 때 첫눈에 끌리는 쪽으로 정한다',
    '말로 설명하긴 어려워도 어느 쪽이 맞는지 느낌으로 안다',
    '미리 계획하기보다 그 순간 떠오르는 대로 움직인다'
  ],
  R2: [
    '상대의 표정이나 목소리만으로 기분을 금방 알아챈다',
    '곁에 있는 사람이 우울하면 나도 덩달아 가라앉는다',
    '말하지 않아도 상대가 지금 무엇을 바라는지 느껴진다',
    '누가 조금만 서운한 기색을 보여도 바로 알아챈다',
    '상대의 말 속에 숨은 진짜 속마음을 알아챈다',
    '여러 사람의 미묘한 기류를 한꺼번에 읽어낸다'
  ],
  R3: [
    '지금 상황을 보면 앞으로 어떻게 흘러갈지 그림이 그려진다',
    '눈앞의 일보다 전체가 어디로 가야 할지를 먼저 생각한다',
    '이상만 좇지 않고 지금 현실에서 가능한 선을 정확히 안다',
    '사람들의 서로 다른 생각을 하나의 목표로 모아낸다',
    '당장의 이득보다 멀리 내다보고 방향을 정한다',
    '내가 방향을 잡으면 사람들이 자연스럽게 따라온다'
  ],
  R4: [
    '결정을 내릴 때 느낌과 숫자를 함께 따져 본다',
    '정확히 세어 보지 않아도 대략의 양이 감으로 잡힌다',
    '어느 한쪽으로 쏠리지 않고 양쪽을 고르게 살핀다',
    '감정이 앞서려 할 때 스스로 냉정하게 균형을 잡는다',
    '즉흥적인 판단과 꼼꼼한 검토를 상황에 맞게 오간다',
    '극단적인 선택보다 양쪽의 장점을 절충한 답을 찾는다'
  ],
  L1: [
    '일을 시작하기 전에 전체 틀부터 짜 놓는다',
    '흩어진 생각을 큰 항목으로 묶어 체계를 세운다',
    '복잡한 내용을 몇 가지 원칙으로 간추린다',
    '무슨 일이든 그 바탕에 깔린 이치를 먼저 이해해야 한다',
    '막연한 생각도 단계별 계획으로 바꿔 정리한다',
    '규칙과 범주로 나눠 정리해 두어야 마음이 놓인다'
  ],
  L2: [
    '궁금한 것이 생기면 직접 해 봐야 직성이 풀린다',
    '한 가지 주제에 빠지면 끝을 볼 때까지 파고든다',
    '설명을 듣기보다 직접 뜯어 보며 원리를 확인한다',
    '남들이 지나치는 작은 차이도 유심히 들여다본다',
    '조건을 조금씩 바꿔 가며 결과가 어떻게 달라지는지 본다',
    '한번 붙잡은 궁금증은 답이 나올 때까지 놓지 않는다'
  ],
  L3: [
    '서로 관계없어 보이는 것들을 엮어 새로운 방법을 만든다',
    '한 분야에서 배운 것을 전혀 다른 일에 가져다 쓴다',
    '책으로 익힌 내용을 실제 상황에 곧바로 적용한다',
    '여러 곳에서 얻은 조각을 모아 하나의 해법으로 합친다',
    '따로 떨어진 아이디어 사이에서 연결 고리를 찾아낸다',
    '새로 알게 된 방법을 당장 써먹을 데를 찾는다'
  ],
  L4: [
    '큰 문제를 잘게 나눠 하나씩 따져 본다',
    '남들이 못 보는 허점이나 모순을 잘 찾아낸다',
    '숫자나 사실이 조금만 어긋나도 금방 눈에 띈다',
    '결론을 내기 전에 근거가 맞는지 하나하나 짚어 본다',
    '앞뒤가 안 맞는 말은 그냥 넘어가지 못한다',
    '문제가 생기면 원인을 정확히 가려낸다'
  ]
};

const ENV_ITEMS: string[] = [
  '평소에 머릿속으로 새로운 장면이나 이야기를 자주 떠올린다',
  '남들이 미처 생각하지 못한 엉뚱한 발상을 곧잘 한다',
  '익숙한 물건도 다르게 써볼 방법이 없을까 궁리하곤 한다',
  '하나의 주제에서 여러 갈래의 아이디어가 꼬리를 물고 떠오른다',
  '음악이나 그림, 풍경을 보며 마음이 크게 움직일 때가 많다',
  '정해진 방식보다 나만의 새로운 방식으로 풀어 보는 쪽에 마음이 끌린다'
];

const PHYS_ITEMS: string[] = [
  '몸을 움직이는 활동을 할 때 기분이 한결 좋아진다',
  '한자리에 오래 가만히 앉아 있으면 몸이 근질거린다',
  '쉬는 날에도 밖으로 나가 활발하게 움직이는 편이다',
  '계단이나 오르막을 만나면 힘들기보다 오히려 신이 난다',
  '넘치는 기운을 어딘가에 쏟아내야 속이 개운하다',
  '생각만 하기보다 일단 몸으로 부딪쳐 해 보려 한다'
];

const LEAD_ITEMS: string[] = [
  '새로운 일이 생기면 누구보다 먼저 나선다',
  '시키지 않아도 내가 먼저 일을 벌인다',
  '여럿이 머뭇거릴 때 내가 앞장서서 이끈다',
  '하고 싶은 일이 있으면 사람들을 설득해 끌어들인다',
  '해 보지 않은 일일수록 오히려 도전하고 싶다',
  '모임에서 내 생각을 먼저 꺼내 놓는다',
  '어려움이 있어도 일단 밀어붙여 끝을 낸다',
  '주어진 상황을 기다리기보다 내가 판을 만든다'
];

const SOC_ITEMS: string[] = [
  '내가 가진 것을 나누는 데 인색하지 않다',
  '힘들어하는 사람이 있으면 먼저 다가가 챙긴다',
  '혼자 있기보다 여럿이 함께 있을 때 힘이 난다',
  '누가 부탁하면 웬만하면 들어준다',
  '다른 사람의 실수는 너그럽게 넘어간다',
  '주말이면 사람들을 불러 모아 함께 시간을 보낸다',
  '내 일이 바빠도 남을 돕는 일을 마다하지 않는다',
  '상대가 편하도록 내가 먼저 맞춰 준다'
];

const TASK_ITEMS: string[] = [
  '한번 맡은 일은 끝을 볼 때까지 손에서 놓지 않는다',
  '해야 할 일은 미루지 않고 제때 마무리한다',
  '맡은 일에서 빠뜨린 부분이 없는지 하나하나 꼼꼼히 살핀다',
  '마음이 내키지 않는 일이라도 책임을 다해 끝까지 해낸다',
  '한번 약속한 기한은 어떻게든 맞추려고 애쓴다',
  '일을 시작하기 전에 할 순서를 정해 차근차근 처리한다'
];

// 같은 유형·지표 문항이 몰리지 않게: 8유형을 라운드로빈으로 펼치고(48), 지표 문항(34)은
// 지표끼리 라운드로빈으로 섞은 뒤 유형 문항 사이에 고르게 끼워 넣는다.
function buildQuestions(): MscQuestion[] {
  const types: MscQuestion[] = [];
  for (let round = 0; round < 6; round += 1) {
    for (const code of MSC_ORDER) types.push({k: 'type', t: code, x: TYPE_ITEMS[code][round]});
  }

  const lists: Array<{k: Scale; items: string[]}> = [
    {k: 'env', items: ENV_ITEMS},
    {k: 'phys', items: PHYS_ITEMS},
    {k: 'lead', items: LEAD_ITEMS},
    {k: 'soc', items: SOC_ITEMS},
    {k: 'task', items: TASK_ITEMS}
  ];
  const pool: MscQuestion[] = [];
  for (let row = 0; ; row += 1) {
    let added = false;
    for (const {k, items} of lists) {
      if (items[row] !== undefined) { pool.push({k, x: items[row]}); added = true; }
    }
    if (!added) break;
  }

  const out: MscQuestion[] = [];
  let idx = 0;
  const step = types.length / pool.length;
  let next = step;
  types.forEach((q, i) => {
    out.push(q);
    while (idx < pool.length && i + 1 >= next) {
      out.push(pool[idx]);
      idx += 1;
      next += step;
    }
  });
  while (idx < pool.length) {
    out.push(pool[idx]);
    idx += 1;
  }
  return out;
}

export const MSC_Q: MscQuestion[] = buildQuestions();

export const MSC_PAGE_SIZE = 10;
export const MSC_PAGES = Math.max(1, Math.ceil(MSC_Q.length / MSC_PAGE_SIZE));

const TYPE_ITEM_COUNT: Record<MscTypeCode, number> = MSC_ORDER.reduce((acc, code) => {
  acc[code] = MSC_Q.filter(q => q.k === 'type' && q.t === code).length;
  return acc;
}, {} as Record<MscTypeCode, number>);

/** 1·2위 점수 차가 이 값 이하면 혼합형으로 본다. */
const BLEND_GAP = 3;

const zeroScores = (): Record<MscTypeCode, number> =>
  MSC_ORDER.reduce((acc, code) => { acc[code] = 0; return acc; }, {} as Record<MscTypeCode, number>);

/** 척도 합/개수를 4단계(0~3)로. 평균 1→0, 5→3. */
const level4 = (sum: number, count: number): number => {
  if (!count) return 0;
  const avg = sum / count;
  return Math.max(0, Math.min(3, Math.round(((avg - 1) / 4) * 3)));
};

/** 좌/우뇌 점수 비율을 뇌인지성향 4단계로. 위(3)=좌뇌 강, 아래(0)=우뇌 강. */
const cogLevel = (left: number, right: number): number => {
  const total = left + right;
  if (!total) return 1;
  const share = left / total;
  if (share >= 0.575) return 3;
  if (share >= 0.525) return 2;
  if (share >= 0.475) return 1;
  return 0;
};

/** 두 각도 사이 최단 회전량(도, -180~180). */
const shortestDelta = (from: number, to: number): number => (((to - from + 540) % 360) - 180);

/**
 * 채점. answers = MSC_Q 길이의 배열(1~5, 0=미응답).
 * 8유형 합산 → 주유형/혼합·유형 위치, 그리고 6개 지표 레벨(맵의 세로 위치)을 낸다.
 */
export function scoreMsc(answers: number[]): MscResult {
  const scores = zeroScores();
  const idx: Record<'env' | 'phys' | 'lead' | 'soc' | 'task', {s: number; n: number}> = {
    env: {s: 0, n: 0}, phys: {s: 0, n: 0}, lead: {s: 0, n: 0}, soc: {s: 0, n: 0}, task: {s: 0, n: 0}
  };

  MSC_Q.forEach((q, i) => {
    const v = answers[i];
    if (!v) return;
    if (q.k === 'type') scores[q.t as MscTypeCode] += v;
    else { idx[q.k].s += v; idx[q.k].n += 1; }
  });

  const rank = [...MSC_ORDER].sort((a, b) => scores[b] - scores[a]);
  const primary = rank[0];
  const gap = scores[rank[0]] - scores[rank[1]];
  const secondary = gap <= BLEND_GAP ? rank[1] : null;
  const code = secondary ? `${primary}${secondary}` : primary;

  const base = MSC_TYPES[primary].angle;
  const angle = secondary
    ? (base + shortestDelta(base, MSC_TYPES[secondary].angle) * 0.22 + 360) % 360
    : base;
  const maxPrimary = 5 * (TYPE_ITEM_COUNT[primary] || 1);
  const radius = Math.max(0, Math.min(1, scores[primary] / maxPrimary));

  const left = scores.L1 + scores.L2 + scores.L3 + scores.L4;
  const right = scores.R1 + scores.R2 + scores.R3 + scores.R4;
  const levels: Record<DimKey, number> = {
    cog: cogLevel(left, right),
    env: level4(idx.env.s, idx.env.n),
    phys: level4(idx.phys.s, idx.phys.n),
    init: level4(idx.lead.s, idx.lead.n),
    inter: level4(idx.soc.s, idx.soc.n),
    task: level4(idx.task.s, idx.task.n)
  };

  return {scores, rank, primary, secondary, code, intensity: scores[primary], angle, radius, levels};
}

/** 혼합형 문구. 단일형이면 빈 문자열. */
export function mscBlendNote(result: MscResult): string {
  if (!result.secondary) return '';
  return `${MSC_TYPES[result.secondary].name}(${MSC_TYPES[result.secondary].short}) 성향이 함께 나타납니다.`;
}
