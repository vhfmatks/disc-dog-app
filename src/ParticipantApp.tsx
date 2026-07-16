import {useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {
  ORDER, PAGE_SIZE, PAGES, Q, SCALE, SCORE, TYPES,
  blendNote, pawPath, score
} from '../assets/data.ts';
// 아래 Result 컴포넌트와 이름이 겹쳐 별칭을 쓴다.
import type {Result as ScoreResult} from '../assets/data.ts';
import {Compatibility} from './components/Compatibility.tsx';
import {DogFace} from './components/DogFace.tsx';
import {ScoreChart} from './components/ScoreChart.tsx';
import {DevBar} from './dev/DevBar.tsx';
import {saveResult} from './lib/db.ts';
import type {GroupRow} from './lib/db.ts';
import {mapUrl} from './lib/room.ts';

const EMPTY_ANSWERS = (): number[] => new Array(Q.length).fill(0);

interface Progress {
  nickname: string;
  answers: number[];
  page: number;
}

interface SaveStatus {
  status: 'idle' | 'saving' | 'ok' | 'error';
  error: string;
}

function restoreProgress(key: string): Progress | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Progress>;
    if (!Array.isArray(data.answers) || data.answers.length !== Q.length) return null;
    return {
      nickname: String(data.nickname || '').slice(0, 16),
      answers: data.answers.map(value => (value >= 1 && value <= 5 ? value : 0)),
      page: Math.min(Math.max(0, (data.page ?? 0) | 0), PAGES - 1)
    };
  } catch {
    return null;
  }
}

interface IntroProps {
  group: GroupRow;
  nickname: string;
  onNicknameChange: (value: string) => void;
  onStart: () => void;
}

function Intro({group, nickname, onNicknameChange, onStart}: IntroProps) {
  const ready = nickname.trim().length > 0;
  return (
    <section>
      <p className="eyebrow">그룹 {group.name} · {group.id}</p>
      <div className="hero-dogs" aria-hidden="true">
        {ORDER.map(type => <DogFace type={type} size={62} key={type} />)}
      </div>
      <h1 style={{fontSize: 28, margin: '6px 0 8px'}}>나는 어떤 강아지일까</h1>
      <p className="muted" style={{fontSize: 15}}>
        60개 문항에 답하면 네 마리 중 나와 닮은 강아지를 찾아드립니다.
        정답은 없습니다. <b>오래 고민하지 말고 평소의 나</b>로 답하세요.
      </p>

      <div className="card" style={{marginTop: 20}}>
        <div className="field">
          <label htmlFor="nick">닉네임</label>
          <input
            id="nick"
            className="input"
            maxLength={16}
            autoComplete="off"
            enterKeyHint="go"
            placeholder="예: 커피두잔, 삼팀장, 뚱이"
            aria-describedby="nick-help"
            value={nickname}
            onChange={event => onNicknameChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && ready) onStart();
            }}
          />
          <p id="nick-help" className="small muted" style={{marginTop: 6}}>
            화면에 이 이름으로 표시됩니다. 최대 16자.
          </p>
        </div>
        <button type="button" className="btn block" disabled={!ready} onClick={onStart}>시작하기</button>
        <ul className="notes">
          <li>응답은 <b>24시간 뒤 자동 삭제</b>됩니다.</li>
          <li>회사·부서·사번은 수집하지 않습니다.</li>
        </ul>
      </div>
    </section>
  );
}

interface QuizProps {
  answers: number[];
  page: number;
  onAnswer: (index: number, value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

function Quiz({answers, page, onAnswer, onPrevious, onNext}: QuizProps) {
  const start = page * PAGE_SIZE;
  const indexes = Q.map((_, index) => index).slice(start, start + PAGE_SIZE);
  const done = indexes.filter(index => answers[index]).length;
  const paw = pawPath();

  const handleArrow = (event: KeyboardEvent<HTMLButtonElement>, questionIndex: number, value: number) => {
    const direction = ({ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1} as Record<string, number>)[event.key];
    if (!direction) return;
    event.preventDefault();
    const nextValue = ((value - 1 + direction + SCALE.length) % SCALE.length) + 1;
    const button = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-value="${nextValue}"]`);
    button?.focus();
    onAnswer(questionIndex, nextValue);
  };

  return (
    <section>
      <div className="progress">
        <div className="paws" role="img" aria-label="진행 상황">
          {Q.map((_, index) => {
            const onPage = index >= start && index < start + PAGE_SIZE;
            const className = `paw ${answers[index] ? 'done' : ''} ${!answers[index] && onPage ? 'todo' : ''}`;
            return (
              <svg className={className} viewBox="0 0 100 100" aria-hidden="true" key={index}>
                <path d={paw} />
              </svg>
            );
          })}
        </div>
        <div className="progress-meta">
          <span>{page + 1} / {PAGES} 페이지</span>
          <span><b>{done}</b> / {PAGE_SIZE} 응답</span>
        </div>
      </div>

      <div>
        {indexes.map(index => {
          const answered = answers[index];
          return (
            <div className={`q ${answered ? 'answered' : ''}`} key={index}>
              <div className="q-head">
                <span className="q-num">{index + 1}</span>
                <span className="q-text">{Q[index].x}</span>
              </div>
              <div className="opts" role="radiogroup" aria-label={Q[index].x}>
                {SCALE.map(option => (
                  <button
                    type="button"
                    className="opt"
                    role="radio"
                    aria-checked={answered === option.v}
                    data-value={option.v}
                    onClick={() => onAnswer(index, option.v)}
                    onKeyDown={event => handleArrow(event, index, option.v)}
                    key={option.v}
                  >
                    <span className="opt-dot" aria-hidden="true" />
                    <span className="opt-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pager">
        {page > 0 && <button type="button" className="btn ghost" onClick={onPrevious}>이전</button>}
        <button type="button" className="btn" disabled={done < PAGE_SIZE} onClick={onNext}>
          {page === PAGES - 1 ? '결과 보기' : '다음'}
        </button>
      </div>
      <p className="small muted center" style={{marginTop: 14}}>새로고침해도 답한 내용은 남아 있습니다.</p>
    </section>
  );
}

function SaveStateBar({state, onRetry}: {state: SaveStatus; onRetry: () => void}) {
  if (state.status === 'saving') {
    return <div className="savebar" aria-live="polite">결과를 저장하는 중…</div>;
  }
  if (state.status === 'ok') {
    return (
      <div className="savebar ok" aria-live="polite">
        <b>앞 화면에 올라갔습니다 🐾</b>지도에서 내 발바닥을 찾아보세요.
      </div>
    );
  }
  return (
    <div className="savebar err" aria-live="polite">
      <b>결과를 저장하지 못했습니다.</b>
      이 화면의 내용은 그대로 유효하지만 지도에는 아직 나타나지 않습니다.
      <span className="muted"> ({state.error})</span>
      <button type="button" className="btn ghost block save-retry" onClick={onRetry}>저장 다시 시도</button>
    </div>
  );
}

interface ResultProps {
  result: ScoreResult;
  saveState: SaveStatus;
  groupId: string;
  onRetry: () => void;
  onAgain: () => void;
}

function Result({result, saveState, groupId, onRetry, onAgain}: ResultProps) {
  const type = TYPES[result.primary];
  const blend = blendNote(result.code);

  return (
    <section aria-live="polite">
      <div className="dogcard fadeup" style={{background: type.hex}}>
        <div style={{position: 'relative', zIndex: 1}}>
          <DogFace type={result.primary} size={116} />
          <div style={{marginTop: 6}}><span className="code">{result.code}</span></div>
          <h1>{type.name}</h1>
          <div className="breed">{type.breed}</div>
          <p className="tagline">{type.tagline}</p>
          {blend && <p className="blend">{blend}</p>}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">네 가지 성향의 강도</h2>
        <ScoreChart result={result} />
        <p className="small muted center" style={{marginTop: 8}}>
          높다고 좋은 게 아니라 <b>진하다</b>는 뜻입니다.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">매력과 짖음</h2>
        <div className="minis">
          <div className="mini">
            <div className="k">매력 Charm</div>
            <div className="v">{result.charmScore}<small> / {SCORE.charmMax}</small></div>
            <div className="kw">{type.charm.join(' · ')}</div>
          </div>
          <div className="mini">
            <div className="k">짖음 Bark</div>
            <div className="v">{result.barkScore}<small> / {SCORE.barkMax}</small></div>
            <div className="kw">{type.bark.join(' · ')}</div>
          </div>
          <div className="mini wide">
            <div className="k">성향 강도</div>
            <div className="v">{result.intensity}<small> / {SCORE.totalMax}</small></div>
            <div className="kw">
              문항 평균 · 매력 {result.charmAvg.toFixed(1)} / 짖음 {result.barkAvg.toFixed(1)} · 차이 {result.gap > 0 ? '+' : ''}{result.gap}
            </div>
            <p className="note">{result.gapNote}</p>
          </div>
        </div>
        <p className="small muted" style={{marginTop: 10}}>
          짖음은 결함이 아니라 <b>매력이 과할 때 나는 소리</b>예요. 낮을수록 좋은 점수가 아닙니다.
        </p>
      </section>

      <Compatibility primary={result.primary} />
      <SaveStateBar state={saveState} onRetry={onRetry} />

      {saveState.status === 'ok' && (
        <>
          <div className="callout center" style={{marginTop: 18}}>
            이제 <b>앞 화면을 보세요.</b> 같은 방 사람들의 관계도가 실시간으로 그려집니다.
          </div>
          <a href={mapUrl(groupId)} className="btn block" style={{marginTop: 12}}>그룹 관계도 보기 🐾</a>
        </>
      )}

      <button type="button" className="btn ghost block" style={{marginTop: 16}} onClick={onAgain}>다시 하기</button>
      <p className="small muted center" style={{marginTop: 24, lineHeight: 1.7}}>
        이 도구는 자기 이해와 팀 커뮤니케이션을 위한 워크숍용입니다.<br />
        채용·평가·배치의 근거로 쓰지 마세요.
      </p>
    </section>
  );
}

export function ParticipantApp({group}: {group: GroupRow}) {
  const room = group.id;
  const storeKey = `dogtype:${room}`;
  const restored = useMemo(() => restoreProgress(storeKey), [storeKey]);
  const [nickname, setNickname] = useState(restored?.nickname || '');
  const [answers, setAnswers] = useState<number[]>(restored?.answers || EMPTY_ANSWERS);
  const [page, setPage] = useState(restored?.page || 0);
  const [screen, setScreen] = useState(restored?.nickname && restored.answers.some(Boolean) ? 'quiz' : 'intro');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [saveState, setSaveState] = useState<SaveStatus>({status: 'idle', error: ''});

  useEffect(() => {
    if (!nickname || screen === 'result') return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({nickname, answers, page}));
    } catch {
      // 저장을 못 해도 설문 진행은 계속된다.
    }
  }, [answers, nickname, page, screen, storeKey]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, screen]);

  const clearProgress = () => {
    try { sessionStorage.removeItem(storeKey); } catch { /* noop */ }
  };

  const persist = async (nextResult: ScoreResult, nextNickname = nickname) => {
    setSaveState({status: 'saving', error: ''});
    const response = await saveResult({
      room,
      nickname: nextNickname,
      code: nextResult.code,
      primary_type: nextResult.primary,
      totals: {...nextResult.totals, _version: SCORE.version},
      charm: nextResult.charmScore,
      bark: nextResult.barkScore,
      x: nextResult.x,
      y: nextResult.y
    });

    if (response.ok) {
      clearProgress();
      setSaveState({status: 'ok', error: ''});
    } else {
      setSaveState({status: 'error', error: response.error || '알 수 없는 오류'});
    }
  };

  const submitAnswers = (nextAnswers = answers, nextNickname = nickname) => {
    if (!nextNickname.trim() || nextAnswers.filter(Boolean).length < Q.length) return;
    const nextResult = score(nextAnswers);
    setNickname(nextNickname);
    setAnswers(nextAnswers);
    setResult(nextResult);
    setScreen('result');
    persist(nextResult, nextNickname);
  };

  const reset = () => {
    clearProgress();
    setAnswers(EMPTY_ANSWERS());
    setPage(0);
    setResult(null);
    setSaveState({status: 'idle', error: ''});
    setScreen('intro');
  };

  return (
    <main className="wrap">
      {screen === 'intro' && (
        <Intro
          group={group}
          nickname={nickname}
          onNicknameChange={setNickname}
          onStart={() => {
            const value = nickname.trim().slice(0, 16);
            if (!value) return;
            setNickname(value);
            setScreen('quiz');
          }}
        />
      )}

      {screen === 'quiz' && (
        <Quiz
          answers={answers}
          page={page}
          onAnswer={(index, value) => {
            setAnswers(current => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
          }}
          onPrevious={() => setPage(current => Math.max(0, current - 1))}
          onNext={() => {
            if (page === PAGES - 1) submitAnswers();
            else setPage(current => Math.min(PAGES - 1, current + 1));
          }}
        />
      )}

      {screen === 'result' && result && (
        <Result
          result={result}
          saveState={saveState}
          groupId={room}
          onRetry={() => persist(result)}
          onAgain={reset}
        />
      )}

      {import.meta.env.DEV && (
        <DevBar
          questions={Q}
          page={page}
          answers={answers}
          onFill={setAnswers}
          onSubmitBias={({nickname: nextNickname, answers: nextAnswers}) => submitAnswers(nextAnswers, nextNickname)}
          onReset={reset}
        />
      )}
    </main>
  );
}
