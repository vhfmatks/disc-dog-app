import {useEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';
import {GUIDE, HOW, ORDER, TYPES, rel, why} from '../../assets/data.ts';
import type {Relation, TypeCode} from '../../assets/data.ts';
import {DogFace} from './DogFace.tsx';

const RELATION_LABEL: Record<Relation, string> = {
  same: '닮은 결',
  good: '빠른 연결',
  bad: '번역 필요'
};

// CSS 변수는 React.CSSProperties에 없어서 캐스팅해 넘긴다.
const typeColor = (hex: string) => ({'--type-color': hex}) as CSSProperties;

export function Compatibility({primary}: {primary: TypeCode}) {
  const [selected, setSelected] = useState<TypeCode | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
  }, [selected]);

  const selectedType = selected ? TYPES[selected] : null;
  const guide = selected ? GUIDE[selected] : null;

  return (
    <section className="section">
      <h2 className="section-title">궁합</h2>
      <p className="compat-intro">
        궁합은 좋고 나쁨이 아니라 <b>서로에게 필요한 번역량</b>입니다.
        강아지를 누르면 내 성향에서 상대에게 말이 닿는 법을 알려드려요.
      </p>
      <div className="compat-legend" aria-label="궁합 표시 설명">
        <span><i className="same" /><b>닮은 결</b> 말은 빠르게 통하지만 맹점도 닮아요</span>
        <span><i className="good" /><b>빠른 연결</b> 속도나 관심 초점 하나를 공유해요</span>
        <span><i className="bad" /><b>번역 필요</b> 다른 관점이 강점이 되도록 설명이 더 필요해요</span>
      </div>

      <div className="compat-grid">
        {ORDER.map(typeCode => {
          const type = TYPES[typeCode];
          const relation = rel(primary, typeCode);
          const isSelected = selected === typeCode;
          return (
            <article
              className={`compat-card ${isSelected ? 'selected' : ''}`}
              style={typeColor(type.hex)}
              key={typeCode}
            >
              <div className="compat-top">
                <span className={`compat-tag ${relation}`}>{RELATION_LABEL[relation]}</span>
                <span className="compat-code">{type.code}</span>
              </div>
              <button
                type="button"
                className="compat-dog"
                aria-controls="compat-advice"
                aria-expanded={isSelected}
                aria-haspopup="dialog"
                aria-label={`${type.name} ${type.breed}에게 이렇게 대하는 법 보기`}
                onClick={() => setSelected(typeCode)}
              >
                <DogFace type={typeCode} size={94} />
                <span className="compat-tap">상세 관계 가이드 보기</span>
              </button>
              <h3>{type.name}</h3>
              <div className="compat-breed">{type.breed}</div>
              <p className="compat-tagline">{type.tagline}</p>
              <dl className="compat-profile">
                <div><dt>속도</dt><dd>{type.pace}</dd></div>
                <div><dt>초점</dt><dd>{type.focus}</dd></div>
                <div><dt>편한 환경</dt><dd>{type.needs}</dd></div>
              </dl>
              <div className="compat-priorities" aria-label={`${type.name} 우선순위`}>
                <b>우선순위</b>
                {type.priorities.map(value => <span key={value}>{value}</span>)}
              </div>
              <dl className="compat-traits">
                <div className="pros">
                  <dt>매력</dt>
                  <dd>{type.charm.map(value => <span key={value}>{value}</span>)}</dd>
                </div>
                <div className="cons">
                  <dt>짖음</dt>
                  <dd>{type.bark.map(value => <span key={value}>{value}</span>)}</dd>
                </div>
              </dl>
              <p className="compat-pressure"><b>압박 신호</b>{type.pressure}</p>
              <p className="compat-why">{why(primary, typeCode)}</p>
            </article>
          );
        })}
      </div>

      <dialog
        id="compat-advice"
        ref={dialogRef}
        className="compat-advice"
        aria-labelledby="compat-advice-title"
        style={selectedType ? typeColor(selectedType.hex) : undefined}
        onClose={() => setSelected(null)}
        onClick={event => {
          if (event.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        {selected && selectedType && guide && (
          <form method="dialog">
            <button className="compat-dialog-close" value="close" aria-label="닫기">×</button>
            <div className="compat-advice-head">
              <DogFace type={selected} size={66} />
              <div>
                <span>{primary} → {selected} 관계 가이드</span>
                <h3 id="compat-advice-title">{selectedType.name}에게 말이 닿는 법</h3>
              </div>
            </div>
            <p className="compat-advice-lead">
              {selectedType.name} 성향은 보통 <b>{selectedType.needs}</b>이 있을 때 편하게 참여합니다.
              {' '}{selectedType.pressure}
            </p>
            <section className="compat-pair-guide" aria-labelledby="compat-pair-title">
              <h4 id="compat-pair-title">우리 조합의 조율 포인트</h4>
              <p>{HOW[primary][selected]}</p>
            </section>
            <div className="compat-formula">
              <span>대화 공식</span>
              <div>
                {guide.formula.map((value, index) => (
                  <span className="compat-formula-step" key={value}>
                    <b>{value}</b>{index < guide.formula.length - 1 && <i>→</i>}
                  </span>
                ))}
              </div>
            </div>
            <blockquote className="compat-script">
              <span>첫 문장 예시</span>
              <p>{guide.opener}</p>
            </blockquote>
            <section className="compat-situations" aria-labelledby="compat-situations-title">
              <h4 id="compat-situations-title">상황별로 이렇게</h4>
              <div>
                {guide.situations.map(([title, body]) => (
                  <article key={title}>
                    <h5>{title}</h5>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </section>
            <div className="compat-avoid"><b>이건 피하세요</b><p>{guide.avoid}</p></div>
            <button className="btn block compat-dialog-confirm" value="close">확인</button>
          </form>
        )}
      </dialog>

      <div className="callout" style={{marginTop: 10}}>
        <b>유형은 면허증도 변명도 아닙니다.</b>{' '}
        누구나 네 성향을 모두 쓰며, 상황에 따라 평소와 다른 방식으로 행동할 수 있어요.
        결과는 상대를 단정하는 딱지가 아니라 <b>대화를 시작하는 가설</b>로만 써주세요.
      </div>
    </section>
  );
}
