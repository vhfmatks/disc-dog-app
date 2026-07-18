import {MSC_Q, MSC_SCALE} from './data.ts';
import type {MscTypeCode} from './data.ts';

type Random = () => number;

const randomScore = (random: Random) => 1 + Math.floor(random() * MSC_SCALE.length);

/** 개발 도구용: 모든 문항에 유효한 무작위 응답을 만든다. */
export function randomMscAnswers(random: Random = Math.random): number[] {
  return MSC_Q.map(() => randomScore(random));
}

/** 개발 도구용: 선택한 유형 문항은 높게, 나머지 유형 문항은 낮게 채운다. */
export function mscAnswersForType(type: MscTypeCode, random: Random = Math.random): number[] {
  return MSC_Q.map(question => {
    if (!question.t) return randomScore(random);
    return question.t === type
      ? 4 + Math.floor(random() * 2)
      : 1 + Math.floor(random() * 2);
  });
}
