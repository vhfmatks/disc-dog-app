// 개성(DISC) 개인 결과를 이미지 카드로 만들어 저장·공유한다.
// 카드: 결과 강아지 + 네 가지 성향의 강도 + 매력과 짖음. 순수 SVG로 그린 뒤 PNG로 굽는다.

import {ORDER, SCORE, TYPES, blendNote, dogFace} from '../../assets/data.ts';
import type {Result} from '../../assets/data.ts';
import {downloadPng, sharePngImage} from './share-image.ts';
import type {ShareOutcome} from './share-image.ts';

const W = 1080;
const H = 1620;
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

// 성향 강도 4색 / 매력·짖음 색
const CHARM = '#3E9E82';
const BARK = '#F2544B';
const TRACK = '#F1ECE3';

const esc = (s: string) => s.replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'} as Record<string, string>)[c]);

const readableOn = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#16130F' : '#ffffff';
};

/** 공백 기준으로 max자에 맞춰 줄을 나눈다. */
const wrapText = (text: string, max: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
};

const bar = (label: string, labelColor: string, value: number, max: number, fill: string, y: number, valueText: string) => {
  const trackX = 340;
  const trackW = 640;
  const w = Math.max(6, Math.round(trackW * Math.min(1, value / max)));
  return `
  <text x="70" y="${y + 22}" font-size="26" font-weight="700" fill="${labelColor}">${esc(label)}</text>
  <rect x="${trackX}" y="${y}" width="${trackW}" height="30" rx="15" fill="${TRACK}"/>
  <rect x="${trackX}" y="${y}" width="${w}" height="30" rx="15" fill="${fill}"/>
  <text x="1010" y="${y + 22}" font-size="22" text-anchor="end" fill="#6E6357">${esc(valueText)}</text>`;
};

export function buildDiscShareSvg(result: Result, nickname: string): {svg: string; w: number; h: number} {
  const type = TYPES[result.primary];
  const tc = readableOn(type.hex);
  const sc = tc === '#ffffff' ? 'rgba(255,255,255,.85)' : 'rgba(22,19,15,.68)';
  const name = esc(nickname.trim() || '나');

  // 결과 강아지 얼굴(중첩 SVG). FACES는 인라인 fill이라 외부 CSS 없이 그대로 그려진다.
  const face = dogFace(result.primary, {size: 240});

  const tagline = wrapText(type.tagline, 30)
    .map((line, i) => `<text x="${W / 2}" y="${665 + i * 40}" font-size="27" text-anchor="middle" fill="#16130F">${esc(line)}</text>`)
    .join('');
  const blend = blendNote(result.code);
  const blendLine = blend
    ? `<text x="${W / 2}" y="795" font-size="24" text-anchor="middle" fill="#6E6357">${esc(blend)}</text>`
    : '';

  // 네 가지 성향의 강도 (유형별 totals, 최대 75)
  const strengthBars = ORDER.map((code, i) => {
    const info = TYPES[code];
    const y = 880 + i * 62;
    const isPrimary = code === result.primary;
    return bar(
      `${info.name} · ${info.breed}`,
      isPrimary ? '#16130F' : '#6E6357',
      result.totals[code], SCORE.totalMax, info.hex, y, String(result.totals[code])
    );
  }).join('');

  // 매력과 짖음
  const charmBar = bar('매력', CHARM, result.charmScore, SCORE.charmMax, CHARM, 1195, `${result.charmScore} / ${SCORE.charmMax}`);
  const barkBar = bar('짖음', BARK, result.barkScore, SCORE.barkMax, BARK, 1257, `${result.barkScore} / ${SCORE.barkMax}`);

  const gap = wrapText(result.gapNote, 44)
    .map((line, i) => `<text x="70" y="${1445 + i * 36}" font-size="22" fill="#6E6357">${esc(line)}</text>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="600" fill="${type.hex}"/>
  <text x="70" y="84" font-size="27" fill="${sc}" letter-spacing="1">개성 · 나는 어떤 강아지일까</text>
  <text x="1010" y="84" font-size="32" text-anchor="end" fill="${sc}">${name}님</text>
  <g transform="translate(${(W - 240) / 2},120)">${face}</g>
  <text x="${W / 2}" y="410" font-size="32" font-weight="800" text-anchor="middle" fill="${tc}">${esc(result.code)}</text>
  <text x="${W / 2}" y="486" font-size="78" font-weight="800" text-anchor="middle" fill="${tc}">${esc(type.name)}</text>
  <text x="${W / 2}" y="540" font-size="32" text-anchor="middle" fill="${sc}">${esc(type.breed)}</text>
  ${tagline}
  ${blendLine}
  <text x="70" y="852" font-size="32" font-weight="800" fill="#16130F">네 가지 성향의 강도</text>
  ${strengthBars}
  <text x="70" y="1150" font-size="32" font-weight="800" fill="#16130F">매력과 짖음</text>
  ${charmBar}
  ${barkBar}
  <text x="70" y="1345" font-size="22" fill="#6E6357">매력 키워드 · ${esc(type.charm.join(' · '))}</text>
  <text x="70" y="1379" font-size="22" fill="#6E6357">짖음 키워드 · ${esc(type.bark.join(' · '))}</text>
  <text x="70" y="1421" font-size="22" font-weight="700" fill="#16130F">성향 강도 ${result.intensity} / ${SCORE.totalMax}</text>
  ${gap}
  <text x="${W / 2}" y="1585" font-size="24" text-anchor="middle" fill="#6E6357">자기 이해와 팀 커뮤니케이션을 위한 워크숍용입니다</text>
</svg>`;
  return {svg, w: W, h: H};
}

const fileName = (nickname: string) => `개성_강아지유형_${(nickname.trim() || '나').replace(/\s+/g, '')}.png`;

export async function saveDiscPng(result: Result, nickname: string): Promise<void> {
  const {svg, w, h} = buildDiscShareSvg(result, nickname);
  await downloadPng(svg, w, h, fileName(nickname));
}

export async function shareDiscResult(result: Result, nickname: string): Promise<ShareOutcome> {
  const type = TYPES[result.primary];
  const text = `${nickname.trim() || '나'}님의 강아지 유형: ${type.name}(${type.breed}) ${result.code}`;
  const {svg, w, h} = buildDiscShareSvg(result, nickname);
  return sharePngImage(svg, w, h, fileName(nickname), text);
}
