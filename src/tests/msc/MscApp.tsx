import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {pawPath} from '../../../assets/data.ts';
import {
  INDICATORS, MSC_ORDER, MSC_PAGES, MSC_PAGE_SIZE, MSC_Q, MSC_SCALE, MSC_TYPES,
  mscBlendNote, scoreMsc
} from './data.ts';
import type {MscResult} from './data.ts';
import {BrainWheel} from './BrainWheel.tsx';
import {MscMap6} from './MscMap6.tsx';
import {MscDevBar} from './MscDevBar.tsx';
import type {MapProfile} from './MscMap6.tsx';
import {saveResultPng, shareResult} from './share.ts';
import {clearMscDraft, loadMscStore, saveMscDraft, saveMscResult} from '../../lib/msc-store.ts';
import type {MscDone} from '../../lib/msc-store.ts';
import {NICKNAME_MAX} from '../../lib/nickname-rules.ts';

type Screen = 'intro' | 'quiz' | 'result' | 'group';

const EMPTY_ANSWERS = (): number[] => new Array(MSC_Q.length).fill(0);
const MAX_TYPE_SCORE = 5 * 6;   // 유형당 6문항 × 5점

const toNodes = (done: MscDone[]) =>
  done.map(d => ({id: d.id, nickname: d.nickname, primary: d.primary, angle: d.angle, radius: d.radius}));
const toProfiles = (done: MscDone[]): MapProfile[] =>
  done.map(d => ({id: d.id, nickname: d.nickname, levels: d.levels}));

function ShareBar({result, nickname}: {result: MscResult; nickname: string}) {
  const [busy, setBusy] = useState<'' | 'share' | 'png'>('');
  const [msg, setMsg] = useState('');

  const runShare = async () => {
    setBusy('share');
    setMsg('');
    try {
      const outcome = await shareResult(result, nickname);
      setMsg(
        outcome === 'copied' ? '결과 요약을 클립보드에 복사했습니다.'
        : outcome === 'downloaded' ? '공유가 안 되어 이미지로 저장했습니다.'
        : outcome === 'shared' ? '공유했습니다.'
        : ''
      );
    } catch {
      setMsg('공유하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy('');
    }
  };

  const runSave = async () => {
    setBusy('png');
    setMsg('');
    try {
      await saveResultPng(result, nickname);
      setMsg('PNG 이미지로 저장했습니다.');
    } catch {
      setMsg('저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="msc-share">
        <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => void runShare()}>
          {busy === 'share' ? '준비 중…' : '결과 공유하기'}
        </button>
        <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => void runSave()}>
          {busy === 'png' ? '저장 중…' : 'PNG로 저장'}
        </button>
      </div>
      {msg && <p className="small muted center msc-share-msg" role="status">{msg}</p>}
    </>
  );
}

function MscResultView({result, nickname, done, meId, onGroup, onAgain}: {
  result: MscResult;
  nickname: string;
  done: MscDone[];
  meId: string;
  onGroup: () => void;
  onAgain: () => void;
}) {
  const type = MSC_TYPES[result.primary];
  const blend = mscBlendNote(result);

  return (
    <section aria-live="polite">
      <div className="msc-card fadeup" style={{background: type.hex}}>
        <span className="code">{result.code}</span>
        <h1>{type.name}</h1>
        <p className="msc-tagline">{type.tagline}</p>
        {blend && <p className="msc-blend">{blend}</p>}
        <div className="msc-strengths">
          {type.strengths.map(s => <span key={s}>{s}</span>)}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">뇌인지 행동유형맵</h2>
        <MscMap6 profiles={toProfiles(done)} selectedId={meId} />
        <div className="msc-readout">
          {INDICATORS.map(ind => (
            <div className="msc-readout-row" key={ind.key}>
              <span className="msc-readout-dim" style={{color: ind.hex}}>{ind.title}</span>
              <b>{ind.levels[result.levels[ind.key]].label}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">여덟 성향의 강도</h2>
        <div className="msc-bars">
          {MSC_ORDER.map(code => {
            const info = MSC_TYPES[code];
            const pct = Math.round((result.scores[code] / MAX_TYPE_SCORE) * 100);
            return (
              <div className={`msc-bar ${code === result.primary ? 'primary' : ''}`} key={code}>
                <span className="msc-bar-name">{info.short}</span>
                <span className="msc-bar-track">
                  <span className="msc-bar-fill" style={{width: `${pct}%`, background: info.hex}} />
                </span>
                <span className="msc-bar-val">{result.scores[code]}</span>
              </div>
            );
          })}
        </div>
        <p className="small muted center" style={{marginTop: 8}}>
          높다고 좋은 게 아니라 <b>그 성향이 진하다</b>는 뜻입니다.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">여덟 유형 속 내 위치</h2>
        <BrainWheel nodes={toNodes(done)} selectedId={meId} />
      </section>

      <button type="button" className="btn block" onClick={onGroup}>전체 지도 보기 🧠</button>
      <button type="button" className="btn ghost block" style={{marginTop: 12}} onClick={onAgain}>다시 하기</button>
      <p className="small muted center" style={{marginTop: 24, lineHeight: 1.7}}>
        이 도구는 자기 이해와 팀 커뮤니케이션을 위한 워크숍용입니다.<br />
        채용·평가·배치의 근거로 쓰지 마세요.
      </p>

      <div className="msc-share-wrap">
        <p className="section-title" style={{marginBottom: 10}}>내 결과 저장·공유</p>
        <ShareBar result={result} nickname={nickname} />
        <p className="small muted center" style={{marginTop: 10}}>
          결과를 요약한 이미지 한 장으로 저장하거나 공유합니다.
        </p>
      </div>
    </section>
  );
}

function GroupView({done, meId, onBack}: {done: MscDone[]; meId: string; onBack: () => void}) {
  const [selected, setSelected] = useState<string | null>(meId || null);
  const groups = MSC_ORDER
    .map(code => ({info: MSC_TYPES[code], members: done.filter(d => d.primary === code)}))
    .filter(g => g.members.length > 0);

  return (
    <section>
      <div className="map-top">
        <p className="eyebrow">뇌인지 행동유형맵</p>
        <div className="map-count"><div className="counter"><span className="n">{done.length}</span> 명</div></div>
      </div>

      {done.length === 0
        ? <div className="empty">아직 아무도 없습니다. 먼저 검사를 해보세요. 🧠</div>
        : <MscMap6 profiles={toProfiles(done)} selectedId={selected} />
      }

      {groups.length > 0 && (
        <div className="msc-chips">
          {groups.map(group => (
            <div className="msc-chip-group" key={group.info.code}>
              <p className="msc-chip-head">
                <span className="msc-chip-dot" style={{background: group.info.hex}} aria-hidden="true" />
                {group.info.short} <span className="msc-chip-n">{group.members.length}</span>
              </p>
              <div className="msc-chip-row">
                {group.members.map(m => (
                  <button
                    type="button"
                    key={m.id}
                    className={`msc-chip ${m.id === selected ? 'sel' : ''}`}
                    style={{borderColor: group.info.hex}}
                    onClick={() => setSelected(cur => cur === m.id ? null : m.id)}
                  >
                    {m.nickname}{m.id === meId ? ' (나)' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn ghost block" style={{marginTop: 20}} onClick={onBack}>← 내 결과로</button>
    </section>
  );
}

interface QuizProps {
  answers: number[];
  page: number;
  onAnswer: (index: number, value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
}

function Quiz({answers, page, onAnswer, onPrevious, onNext, onReset}: QuizProps) {
  const start = page * MSC_PAGE_SIZE;
  const indexes = MSC_Q.map((_, index) => index).slice(start, start + MSC_PAGE_SIZE);
  const done = indexes.filter(index => answers[index]).length;
  const paw = pawPath();

  const handleArrow = (event: KeyboardEvent<HTMLButtonElement>, questionIndex: number, value: number) => {
    const direction = ({ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1} as Record<string, number>)[event.key];
    if (!direction) return;
    event.preventDefault();
    const nextValue = ((value - 1 + direction + MSC_SCALE.length) % MSC_SCALE.length) + 1;
    const button = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-value="${nextValue}"]`);
    button?.focus();
    onAnswer(questionIndex, nextValue);
  };

  return (
    <section>
      <div className="progress">
        <div className="paws" role="img" aria-label="진행 상황">
          {MSC_Q.map((_, index) => {
            const onPage = index >= start && index < start + MSC_PAGE_SIZE;
            const className = `paw ${answers[index] ? 'done' : ''} ${!answers[index] && onPage ? 'todo' : ''}`;
            return (
              <svg className={className} viewBox="0 0 100 100" aria-hidden="true" key={index}>
                <path d={paw} />
              </svg>
            );
          })}
        </div>
        <div className="progress-meta">
          <span>{page + 1} / {MSC_PAGES} 페이지</span>
          <span><b>{done}</b> / {indexes.length} 응답</span>
        </div>
      </div>

      <div>
        {indexes.map(index => {
          const answered = answers[index];
          return (
            <div className={`q ${answered ? 'answered' : ''}`} key={index}>
              <div className="q-head">
                <span className="q-num">{index + 1}</span>
                <span className="q-text">{MSC_Q[index].x}</span>
              </div>
              <div className="opts" role="radiogroup" aria-label={MSC_Q[index].x}>
                {MSC_SCALE.map(option => (
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
        <button type="button" className="btn" disabled={done < indexes.length} onClick={onNext}>
          {page === MSC_PAGES - 1 ? '결과 보기' : '다음'}
        </button>
      </div>
      <p className="small muted center" style={{marginTop: 14}}>
        답한 내용은 이 브라우저에 남습니다. 창을 닫아도 여기서부터 이어서 하면 됩니다.
        <br />
        <button type="button" className="linkish" onClick={onReset}>처음부터 다시 하기</button>
      </p>
    </section>
  );
}

export function MscApp() {
  const stored = useMemo(() => loadMscStore(), []);
  const draft = stored.draft;
  const [nickname, setNickname] = useState(draft?.nickname || stored.done[0]?.nickname || '');
  const [answers, setAnswers] = useState<number[]>(draft?.answers || EMPTY_ANSWERS);
  const [page, setPage] = useState(draft?.page || 0);
  const [screen, setScreen] = useState<Screen>(draft?.answers.some(Boolean) ? 'quiz' : 'intro');
  const [result, setResult] = useState<MscResult | null>(null);
  const [done, setDone] = useState<MscDone[]>(stored.done);
  const meIdRef = useRef('');

  // 한 문항 고를 때마다 draft를 덮어쓴다. 한 문항도 안 골랐으면 저장하지 않는다.
  useEffect(() => {
    if (screen !== 'quiz' || !nickname || !answers.some(Boolean)) return;
    saveMscDraft({nickname, answers, page, updatedAt: Date.now()});
  }, [answers, nickname, page, screen]);

  useEffect(() => { window.scrollTo(0, 0); }, [page, screen]);

  const submit = (nextAnswers = answers, nextNickname = nickname) => {
    const trimmed = nextNickname.trim().slice(0, NICKNAME_MAX);
    if (!trimmed || nextAnswers.filter(Boolean).length < MSC_Q.length) return;

    const nextResult = scoreMsc(nextAnswers);
    const id = crypto.randomUUID();
    meIdRef.current = id;
    saveMscResult({id, nickname: trimmed, answers: nextAnswers, result: nextResult, completedAt: Date.now()});
    setNickname(trimmed);
    setAnswers(nextAnswers);
    setResult(nextResult);
    setDone(loadMscStore().done);
    setScreen('result');
  };

  const reset = () => {
    clearMscDraft();
    setAnswers(EMPTY_ANSWERS());
    setPage(0);
    setResult(null);
    setScreen('intro');
  };

  return (
    <main className="wrap">
      {screen === 'intro' && (
        <section>
          <p className="eyebrow">뇌인지 행동유형맵</p>
          <h1 style={{fontSize: 24, margin: '6px 0 8px'}}>내 뇌는 어떻게 일할까</h1>
          <p className="muted" style={{fontSize: 15}}>
            {MSC_Q.length}개 문항에 답하면 여섯 가지 지표로 나의 뇌인지 행동유형을 그려드립니다.<br />
            정답은 없습니다. <b>오래 고민하지 말고 평소의 나</b>로 답하세요.
          </p>

          <div className="card" style={{marginTop: 20}}>
            <div className="field">
              <label htmlFor="msc-nick">닉네임</label>
              <input
                id="msc-nick"
                className="input"
                maxLength={NICKNAME_MAX}
                autoComplete="off"
                enterKeyHint="go"
                placeholder="예: 커피두잔, 삼팀장, 뚱이"
                value={nickname}
                onChange={event => setNickname(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && nickname.trim()) { event.preventDefault(); setScreen('quiz'); }
                }}
              />
              <p className="small muted" style={{marginTop: 6}}>화면에 이 이름으로 표시됩니다. 최대 {NICKNAME_MAX}자.</p>
            </div>
            <button
              type="button"
              className="btn block"
              disabled={!nickname.trim()}
              onClick={() => setScreen('quiz')}
            >시작하기</button>
          </div>

          {done.length > 0 && (
            <button type="button" className="btn ghost block" style={{marginTop: 16}} onClick={() => setScreen('group')}>
              이 기기 결과 {done.length}명 지도 보기 🧠
            </button>
          )}
          <p className="small muted center" style={{marginTop: 16}}>
            MVP 안내 — 결과는 이 브라우저에만 저장되고 서버로 보내지 않습니다.
          </p>
        </section>
      )}

      {screen === 'quiz' && (
        <Quiz
          answers={answers}
          page={page}
          onAnswer={(index, value) => setAnswers(current => current.map((a, i) => i === index ? value : a))}
          onPrevious={() => setPage(current => Math.max(0, current - 1))}
          onNext={() => {
            if (page === MSC_PAGES - 1) submit();
            else setPage(current => Math.min(MSC_PAGES - 1, current + 1));
          }}
          onReset={reset}
        />
      )}

      {screen === 'result' && result && (
        <MscResultView
          result={result}
          nickname={nickname}
          done={done}
          meId={meIdRef.current}
          onGroup={() => setScreen('group')}
          onAgain={reset}
        />
      )}

      {screen === 'group' && (
        <GroupView
          done={done}
          meId={meIdRef.current}
          onBack={() => setScreen(result ? 'result' : 'intro')}
        />
      )}

      {import.meta.env.DEV && screen === 'quiz' && (
        <MscDevBar
          answers={answers}
          page={page}
          onFill={setAnswers}
          onSubmitBias={({nickname: nextNickname, answers: nextAnswers}) => submit(nextAnswers, nextNickname)}
          onReset={reset}
        />
      )}
    </main>
  );
}
