import assert from 'node:assert/strict';
import test from 'node:test';
import {ORDER, TYPES, dogFace} from '../assets/data.ts';

const BREED_MARKERS = {
  D: 'jindo',
  I: 'bichon',
  S: 'golden-retriever',
  C: 'border-collie'
};

test('네 품종 얼굴은 공통 SVG 계약과 각자의 식별 마커를 지킨다', () => {
  for (const type of ORDER) {
    const svg = dogFace(type, {size: 76, cls: 'preview'});

    assert.match(svg, /^<svg class="dog-face preview"/);
    assert.match(svg, new RegExp(`data-dog-type="${type}"`));
    assert.match(svg, /viewBox="0 0 100 100" width="76" height="76"/);
    assert.match(svg, new RegExp(`aria-label="${TYPES[type].breed}"`));
    assert.match(svg, new RegExp(`data-breed="${BREED_MARKERS[type]}"`));
    assert.doesNotMatch(svg, /\sid=/, '여러 얼굴을 한 화면에 그려도 SVG id가 충돌하지 않아야 한다');
  }
});

test('얼굴 SVG의 기본 크기는 100px이다', () => {
  assert.match(dogFace('S'), /width="100" height="100"/);
});
