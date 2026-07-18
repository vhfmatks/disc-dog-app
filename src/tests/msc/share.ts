// 개인 결과를 이미지 카드로 만들어 공유·저장한다. 서버에 결과가 없는 MVP라(로컬 전용)
// 링크가 아니라 이미지를 공유한다.
//
// 카드는 순수 SVG 문자열로 그린 뒤 canvas로 PNG 래스터화한다 — 외부 의존성(html2canvas
// 등) 없이, blob URL에서 그린 SVG는 canvas를 오염시키지 않아 toBlob이 그대로 된다.

import {INDICATORS, MSC_ORDER, MSC_TYPES} from './data.ts';
import type {MscResult} from './data.ts';
import {downloadPng, sharePngImage} from '../../lib/share-image.ts';
import type {ShareOutcome} from '../../lib/share-image.ts';

const W = 1080;
const H = 1600;
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

const MAX_TYPE_SCORE = 30;   // 유형당 6문항 × 5점

// 6축 그리드 좌표
const GX = 30;
const COL_GAP = 6;
const COL_W = (W - 2 * GX - 5 * COL_GAP) / 6;
const GRID_TOP = 580;
const ROW_H = 92;
const ROW_GAP = 8;
const ROWS_H = 4 * ROW_H + 3 * ROW_GAP;
const FOOT_GAP = 10;
const FOOT_H = 56;

const esc = (s: string) => s.replace(/[&<>"']/g, c =>
  ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'} as Record<string, string>)[c]);

/** 배경색 위에서 읽히는 글자색. 밝은 배경엔 먹색, 어두운 배경엔 흰색. */
const readableOn = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#16130F' : '#ffffff';
};

export function buildShareSvg(result: MscResult, nickname: string): {svg: string; w: number; h: number} {
  const type = MSC_TYPES[result.primary];
  const tc = readableOn(type.hex);
  const sc = tc === '#ffffff' ? 'rgba(255,255,255,.85)' : 'rgba(22,19,15,.68)';
  const name = esc(nickname.trim() || '나');

  const colX = (c: number) => GX + c * (COL_W + COL_GAP);
  const cx = (c: number) => colX(c) + COL_W / 2;
  const cy = (level: number) => GRID_TOP + (3 - level) * (ROW_H + ROW_GAP) + ROW_H / 2;

  // 6축 그리드 칸
  const cells = INDICATORS.map((ind, c) => ind.levels.map((lv, level) => {
    const on = result.levels[ind.key] === level;
    const x = colX(c);
    const y = GRID_TOP + (3 - level) * (ROW_H + ROW_GAP);
    const mx = cx(c);
    const my = y + ROW_H / 2;
    return `
    <rect x="${x.toFixed(1)}" y="${y}" width="${COL_W.toFixed(1)}" height="${ROW_H}" rx="12" fill="${ind.hex}" fill-opacity="${on ? 1 : 0.1}" stroke="${on ? ind.hex : '#E3DCD0'}" stroke-width="${on ? 2 : 1}"/>
    <text x="${mx.toFixed(1)}" y="${(my - 2).toFixed(1)}" font-size="22" font-weight="700" text-anchor="middle" fill="${on ? '#fff' : '#16130F'}">${esc(lv.label)}</text>
    <text x="${mx.toFixed(1)}" y="${(my + 21).toFixed(1)}" font-size="13" text-anchor="middle" fill="${on ? 'rgba(255,255,255,.85)' : '#6E6357'}">${esc(lv.en)}</text>`;
  }).join('')).join('');

  const linePts = INDICATORS.map((ind, c) => `${cx(c).toFixed(1)},${cy(result.levels[ind.key]).toFixed(1)}`).join(' ');
  const dots = INDICATORS.map((ind, c) =>
    `<circle cx="${cx(c).toFixed(1)}" cy="${cy(result.levels[ind.key]).toFixed(1)}" r="6" fill="#16130F"/>`).join('');

  // 열 제목(하단 색 바)
  const footY = GRID_TOP + ROWS_H + FOOT_GAP;
  const foot = INDICATORS.map((ind, c) => {
    const x = colX(c);
    const mx = cx(c);
    return `
    <rect x="${x.toFixed(1)}" y="${footY}" width="${COL_W.toFixed(1)}" height="${FOOT_H}" rx="12" fill="${ind.hex}"/>
    <text x="${mx.toFixed(1)}" y="${footY + 26}" font-size="19" font-weight="800" text-anchor="middle" fill="#fff">${esc(ind.title)}</text>
    <text x="${mx.toFixed(1)}" y="${footY + 45}" font-size="11" text-anchor="middle" fill="rgba(255,255,255,.85)">${esc(ind.en)}</text>`;
  }).join('');

  // 여덟 성향의 강도
  const barsTitleY = footY + FOOT_H + 70;
  const barsTop = barsTitleY + 34;
  const barStep = 46;
  const trackX = 170;
  const trackW = 810;
  const bars = MSC_ORDER.map((code, i) => {
    const info = MSC_TYPES[code];
    const y = barsTop + i * barStep;
    const w = Math.max(6, Math.round(trackW * (result.scores[code] / MAX_TYPE_SCORE)));
    const isPrimary = code === result.primary;
    return `
    <text x="40" y="${y + 17}" font-size="24" font-weight="${isPrimary ? 800 : 600}" fill="${isPrimary ? '#16130F' : '#6E6357'}">${esc(info.short)}</text>
    <rect x="${trackX}" y="${y}" width="${trackW}" height="24" rx="12" fill="#F1ECE3"/>
    <rect x="${trackX}" y="${y}" width="${w}" height="24" rx="12" fill="${info.hex}"/>
    <text x="1040" y="${y + 18}" font-size="20" text-anchor="end" fill="#6E6357">${result.scores[code]}</text>`;
  }).join('');

  const noteY = barsTop + 8 * barStep + 42;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect width="${W}" height="480" fill="${type.hex}"/>
  <text x="80" y="100" font-size="28" fill="${sc}" letter-spacing="2">MSC · 뇌인지 행동유형맵</text>
  <text x="1000" y="100" font-size="36" font-weight="800" fill="${tc}" text-anchor="end">${esc(result.code)}</text>
  <text x="80" y="182" font-size="40" fill="${sc}">${name}님의 유형</text>
  <text x="80" y="300" font-size="82" font-weight="800" fill="${tc}">${esc(type.name)}</text>
  <text x="80" y="372" font-size="31" fill="${sc}">${esc(type.tagline)}</text>
  <text x="80" y="438" font-size="30" fill="${sc}">${esc(type.strengths.join('   ·   '))}</text>
  <text x="${GX}" y="548" font-size="32" font-weight="800" fill="#16130F">뇌인지 행동유형맵</text>
  ${cells}
  <polyline points="${linePts}" fill="none" stroke="#16130F" stroke-width="4" stroke-linejoin="round"/>
  ${dots}
  ${foot}
  <text x="${GX}" y="${barsTitleY}" font-size="32" font-weight="800" fill="#16130F">여덟 성향의 강도</text>
  ${bars}
  <text x="${W / 2}" y="${noteY}" font-size="24" fill="#6E6357" text-anchor="middle">자기 이해와 팀 커뮤니케이션을 위한 워크숍용입니다</text>
</svg>`;
  return {svg, w: W, h: H};
}

const fileName = (nickname: string) => `뇌인지행동유형_${(nickname.trim() || '나').replace(/\s+/g, '')}.png`;

export async function saveResultPng(result: MscResult, nickname: string): Promise<void> {
  const {svg, w, h} = buildShareSvg(result, nickname);
  await downloadPng(svg, w, h, fileName(nickname));
}

export async function shareResult(result: MscResult, nickname: string): Promise<ShareOutcome> {
  const type = MSC_TYPES[result.primary];
  const text = `${nickname.trim() || '나'}님의 뇌인지 행동유형: ${type.name} (${result.code})`;
  const {svg, w, h} = buildShareSvg(result, nickname);
  return sharePngImage(svg, w, h, fileName(nickname), text);
}
