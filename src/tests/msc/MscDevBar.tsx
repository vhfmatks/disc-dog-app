import {useState} from 'react';
import {MSC_PAGE_SIZE, MSC_Q, MSC_TYPES} from './data.ts';
import type {MscTypeCode} from './data.ts';
import {mscAnswersForType, randomMscAnswers} from './dev-answers.ts';

interface MscDevBarProps {
  answers: number[];
  page: number;
  onFill: (answers: number[]) => void;
  onSubmitBias: (payload: {nickname: string; answers: number[]}) => void;
  onReset: () => void;
}

/** Vite 개발 서버에서만 렌더링하는 뇌인지 행동유형맵 문답 자동입력 도구. */
export function MscDevBar({answers, page, onFill, onSubmitBias, onReset}: MscDevBarProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const fillPage = () => {
    const next = [...answers];
    const start = page * MSC_PAGE_SIZE;
    for (let index = start; index < Math.min(start + MSC_PAGE_SIZE, MSC_Q.length); index += 1) {
      if (!next[index]) next[index] = randomMscAnswers()[index];
    }
    onFill(next);
  };

  return (
    <div className="devbar">
      <span className="devbar-tag">DEV · MSC</span>
      <button type="button" title="무작위로 모든 문항 채우기" onClick={() => onFill(randomMscAnswers())}>🎲 랜덤</button>
      {(Object.keys(MSC_TYPES) as MscTypeCode[]).map(type => (
        <button
          type="button"
          title={`${MSC_TYPES[type].name} 결과로 바로 이동`}
          onClick={() => onSubmitBias({
            nickname: `${MSC_TYPES[type].short}${Math.floor(Math.random() * 100)}`,
            answers: mscAnswersForType(type)
          })}
          key={type}
        >
          {type}
        </button>
      ))}
      <button type="button" title="현재 페이지의 미응답 문항만 채우기" onClick={fillPage}>📄</button>
      <button type="button" title="응답을 지우고 처음부터 다시 시작" onClick={onReset}>↺</button>
      <button type="button" title="숨기기 (새로고침하면 다시 나타납니다)" onClick={() => setVisible(false)}>✕</button>
    </div>
  );
}
