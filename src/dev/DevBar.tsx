import {useState} from 'react';
import type {Question, TypeCode} from '../../assets/data.ts';

const TYPE_LABEL: Record<TypeCode, string> = {D: '진돗개', I: '비숑', S: '골든', C: '콜리'};
const randomScore = () => 1 + Math.floor(Math.random() * 5);

function answersFor(questions: Question[], type?: TypeCode): number[] {
  return questions.map(question => {
    if (!type) return randomScore();
    return question.t === type
      ? 4 + Math.floor(Math.random() * 2)
      : 1 + Math.floor(Math.random() * 2);
  });
}

interface DevBarProps {
  questions: Question[];
  page: number;
  answers: number[];
  onFill: (answers: number[]) => void;
  onSubmitBias: (payload: {nickname: string; answers: number[]}) => void;
  onReset: () => void;
}

export function DevBar({questions, page, answers, onFill, onSubmitBias, onReset}: DevBarProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const fillPage = () => {
    const next = [...answers];
    const start = page * 10;
    for (let index = start; index < Math.min(start + 10, questions.length); index += 1) {
      if (!next[index]) next[index] = randomScore();
    }
    onFill(next);
  };

  return (
    <div className="devbar">
      <span className="devbar-tag">DEV</span>
      <button type="button" title="완전 랜덤으로 60문항만 채우기 (결과는 열지 않음)" onClick={() => onFill(answersFor(questions))}>🎲 랜덤</button>
      {(Object.keys(TYPE_LABEL) as TypeCode[]).map(type => (
        <button
          type="button"
          title={`${TYPE_LABEL[type]}(${type})가 나오게 채우고 결과로 이동`}
          onClick={() => onSubmitBias({
            nickname: `${TYPE_LABEL[type]}${Math.floor(Math.random() * 100)}`,
            answers: answersFor(questions, type)
          })}
          key={type}
        >
          {type}
        </button>
      ))}
      <button type="button" title="지금 페이지의 미응답 10문항만 채우기" onClick={fillPage}>📄</button>
      <button type="button" title="응답을 지우고 인트로부터 다시" onClick={onReset}>↺</button>
      <button type="button" title="숨기기 (새로고침하면 다시 나옵니다)" onClick={() => setVisible(false)}>✕</button>
    </div>
  );
}
