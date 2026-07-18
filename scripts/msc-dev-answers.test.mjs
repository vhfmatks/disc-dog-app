import assert from 'node:assert/strict';
import test from 'node:test';
import {MSC_Q, MSC_SCALE, MSC_TYPES, scoreMsc} from '../src/tests/msc/data.ts';
import {mscAnswersForType, randomMscAnswers} from '../src/tests/msc/dev-answers.ts';

test('개발용 랜덤 응답은 모든 MSC 문항을 유효 범위로 채운다', () => {
  const answers = randomMscAnswers(() => 0.99);
  assert.equal(answers.length, MSC_Q.length);
  assert.ok(answers.every(answer => answer >= 1 && answer <= MSC_SCALE.length));
});

test('유형 자동입력은 선택한 유형을 결과 최상위로 만든다', () => {
  for (const type of Object.keys(MSC_TYPES)) {
    const result = scoreMsc(mscAnswersForType(type, () => 0));
    assert.equal(result.primary, type);
  }
});
