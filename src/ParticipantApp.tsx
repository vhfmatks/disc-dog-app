import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {
  ORDER, PAGE_SIZE, PAGES, Q, SCALE, SCORE, TYPES, pawPath, score
} from '../assets/data.ts';
// 아래 Result 컴포넌트와 이름이 겹쳐 별칭을 쓴다.
import type {Result as ScoreResult} from '../assets/data.ts';
import {CopyButton} from './components/CopyButton.tsx';
import {DogFace} from './components/DogFace.tsx';
import {PersonalResult} from './components/PersonalResult.tsx';
import {SpaceIcon} from './components/SpaceIcon.tsx';
import {DevBar} from './dev/DevBar.tsx';
import {
  DONE_MAX, clearDraft, doneSetToEvict, formatWhen, loadStore, saveDoneSet, saveDraft
} from './lib/answer-store.ts';
import type {DoneSet, Draft} from './lib/answer-store.ts';
import {checkNickname, saveResult} from './lib/db.ts';
import type {SpaceRow, SpaceSummary} from './lib/db.ts';
import {NICKNAME_MAX, validateNickname} from './lib/nickname-rules.ts';
import {profileUrl, spaceMapUrl, spaceUrl} from './lib/router.ts';
import {DEFAULT_SPACE_ICON_ID, isSpaceIconId} from './lib/space-icons.ts';
import type {SpaceIconId} from './lib/space-icons.ts';

const safeIconId = (value: string): SpaceIconId =>
  isSpaceIconId(value) ? value : DEFAULT_SPACE_ICON_ID;

const EMPTY_ANSWERS = (): number[] => new Array(Q.length).fill(0);

interface SaveStatus {
  status: 'idle' | 'saving' | 'ok' | 'error';
  code: string;
  error: string;
}

interface NicknameCheckState {
  status: 'idle' | 'checking' | 'available' | 'duplicate' | 'error';
  code?: string;
  message?: string;
}

/**
 * 진행 중인 한 벌은 브라우저에 하나뿐이라, 여기서 60문항을 새로 시작하면 저쪽에서 풀던 게
 * 밀려난다. 밀려나는 바로 그 순간에만 묻는다 — 재사용으로 넘어갈 때는 아무것도 사라지지 않는다.
 */
function ElsewhereWarning({elsewhere, onCancel, onConfirm}: {
  elsewhere: Draft;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const done = elsewhere.answers.filter(Boolean).length;
  return (
    <div className="danger" role="alert">
      <b>{elsewhere.spaceName}에서 풀던 {done}문항이 사라집니다.</b>
      <p className="small">
        진행 중인 응답은 <b>한 벌만</b> 남습니다. 여기서 새로 답하기 시작하면 저쪽에서 답한 내용은
        <b> 복구할 수 없습니다</b>.
      </p>
      <div className="danger-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>취소</button>
        <button type="button" className="btn danger" onClick={onConfirm}>새로 시작</button>
      </div>
    </div>
  );
}

/** 완료 응답 10벌이 찬 뒤 새 스페이스를 추가할 때 실제로 밀려나는 범위를 설명한다. */
function ProfileCapacityWarning({evictedSet}: {evictedSet: DoneSet}) {
  return (
    <div className="danger" role="alert">
      <b>새 결과를 저장하면 {evictedSet.spaceName} 응답이 내 프로필에서 사라집니다.</b>
      <p className="small">
        내 프로필에는 완료 응답을 최근 <b>{DONE_MAX}벌</b>까지만 보관합니다. 이 스페이스 결과가
        추가되는 순간 가장 오래된 <b>{evictedSet.spaceName}</b> 응답은 삭제되어 다시 쓸 수 없습니다.
      </p>
      <p className="small muted">
        <b>스페이스에서 탈퇴되는 것은 아닙니다.</b> 내 프로필에 보관된 응답만 사라지며,
        해당 스페이스와 이미 지도에 올라간 결과에는 영향을 주지 않습니다.
      </p>
    </div>
  );
}

interface IntroProps {
  space: SpaceRow;
  token: string;
  shareUrl: string;
  nickname: string;
  /** 이 스페이스의 결과를 함께보기로 읽을 수 있는 스페이스들. 없으면 빈 배열. */
  sharedWith: SpaceSummary[];
  /** 다른 스페이스에서 풀다 만 한 벌. */
  elsewhere: Draft | null;
  /** 저장된 세트가 없어 시작하기가 곧장 설문으로 간다 = 여기서 draft가 밀려난다. */
  startsQuiz: boolean;
  onNicknameChange: (value: string) => void;
  onStart: () => void;
}

function Intro({
  space, token, shareUrl, nickname, sharedWith, elsewhere, startsQuiz, onNicknameChange, onStart
}: IntroProps) {
  const ready = nickname.trim().length > 0;
  const [confirmStart, setConfirmStart] = useState(false);
  const [nicknameCheck, setNicknameCheck] = useState<NicknameCheckState>({status: 'idle'});
  const elsewhereDone = elsewhere?.answers.filter(Boolean).length ?? 0;
  const guard = Boolean(elsewhere) && startsQuiz;
  const checking = nicknameCheck.status === 'checking';
  const duplicate = nicknameCheck.status === 'duplicate';

  const start = async () => {
    if (!ready || checking) return;
    setNicknameCheck({status: 'checking'});
    const response = await checkNickname(space.id, token, nickname);
    if (!response.ok) {
      setNicknameCheck({status: 'error', code: response.code, message: response.error});
      return;
    }
    if (!response.available) {
      setNicknameCheck({
        status: 'duplicate',
        code: response.code || 'NICKNAME_DUPLICATE',
        message: response.error || '이 스페이스에서 이미 사용 중인 닉네임입니다.'
      });
      return;
    }
    setNicknameCheck({status: 'available'});
    if (guard) setConfirmStart(true);
    else onStart();
  };

  const nicknameStatus = (() => {
    if (nicknameCheck.status === 'checking') {
      return <p id="nick-help" className="field-status checking" aria-live="polite">닉네임 중복 확인 중…</p>;
    }
    if (nicknameCheck.status === 'available') {
      return <p id="nick-help" className="field-status ok" aria-live="polite">사용할 수 있는 닉네임입니다.</p>;
    }
    if (nicknameCheck.status === 'duplicate' || nicknameCheck.status === 'error') {
      return (
        <p
          id="nick-help"
          className={`field-status ${nicknameCheck.status === 'duplicate' ? 'error' : 'warning'}`}
          role="status"
        >
          {nicknameCheck.code && <code className="error-code">{nicknameCheck.code}</code>}
          {nicknameCheck.message}
        </p>
      );
    }
    return (
      <p id="nick-help" className="small muted" style={{marginTop: 6}}>
        화면에 이 이름으로 표시됩니다. 최대 {NICKNAME_MAX}자.
      </p>
    );
  })();

  return (
    <section>
      <p className="eyebrow">스페이스 {space.name} · {space.id}</p>
      <div className="hero-dogs" aria-hidden="true">
        {ORDER.map(type => <DogFace type={type} size={62} key={type} />)}
      </div>
      <h1 style={{fontSize: 24, margin: '6px 0 8px'}}>나는 어떤 강아지일까</h1>
      <p className="muted" style={{fontSize: 15}}>
        60개 문항에 답하면 네 마리 중 나와 닮은 강아지를 찾아드립니다.<br />
        정답은 없습니다. <b>오래 고민하지 말고 평소의 나</b>로 답하세요.
      </p>

      {/* 사람은 자기 이름이 어느 화면에 뜨는지 모른 채로 제출하면 안 된다.
          설문을 시작하기 전에, 닉네임 칸보다 먼저 말해준다.

          ⚠ 공유는 소급된다 (9_share_all_results). 지금 공유가 없는 스페이스라도 나중에
            진행자가 맺으면 오늘 낸 결과가 그쪽에 보인다. 그래서 아래 안내는 공유가
            걸려 있든 아니든 **언제나** 나온다 — 걸려 있으면 이름을 대고 크게, 아니면
            조용히. 이 문구가 소급 노출의 유일한 짝이다. */}
      {sharedWith.length > 0 ? (
        <div className="callout shared-notice" style={{marginTop: 18}}>
          <b>이 스페이스의 결과는 다른 스페이스에도 표시됩니다</b>
          <p className="small" style={{marginTop: 4}}>
            아래 스페이스 구성원의 함께보기 지도에 이 스페이스의 닉네임과 강아지 유형이
            보입니다. <b>이미 제출된 결과도 함께</b> 보입니다.
          </p>
          <ul className="shared-notice-list">
            {sharedWith.map(viewer => (
              <li key={viewer.id}>
                <SpaceIcon iconId={safeIconId(viewer.icon_id)} size={22} decorative />
                {viewer.name}
              </li>
            ))}
          </ul>
          <p className="small muted" style={{marginTop: 8}}>
            넘어가는 건 지도에 뜨는 것과 같습니다 — 닉네임과 강아지 유형, 점수뿐입니다.
            60문항에 어떻게 답했는지는 넘어가지 않습니다.
          </p>
        </div>
      ) : (
        <p className="small muted shared-later" style={{marginTop: 16}}>
          진행자가 나중에 다른 스페이스와 <b>함께보기</b>를 맺으면, 지금 내는 결과도 그쪽
          지도에 보입니다. 넘어가는 건 닉네임과 강아지 유형뿐이고, 60문항에 어떻게
          답했는지는 넘어가지 않습니다.
        </p>
      )}

      {elsewhere && (
        <div className="callout" style={{marginTop: 18}}>
          <b>다른 스페이스에서 풀던 게 남아 있습니다</b>
          <p className="small" style={{marginTop: 4}}>
            <b>{elsewhere.spaceName}</b>에서 {elsewhereDone}/{Q.length}문항까지 답했습니다.
            진행 중인 응답은 <b>한 번에 한 벌만</b> 남습니다 — 여기서 60문항을 새로 답하기
            시작하면 그건 사라집니다.
          </p>
          <a className="btn ghost block" style={{marginTop: 12}} href={spaceUrl(elsewhere.spaceId)}>
            그거 이어서 하러 가기
          </a>
        </div>
      )}

      <div className="card" style={{marginTop: 20}}>
        <div className="field">
          <label htmlFor="nick">닉네임</label>
          <input
            id="nick"
            className="input"
            maxLength={NICKNAME_MAX}
            autoComplete="off"
            enterKeyHint="go"
            placeholder="예: 커피두잔, 삼팀장, 뚱이"
            aria-describedby="nick-help"
            value={nickname}
            disabled={checking}
            aria-invalid={nicknameCheck.status === 'duplicate'}
            onChange={event => {
              setConfirmStart(false);
              setNicknameCheck({status: 'idle'});
              onNicknameChange(event.target.value);
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' && ready) {
                event.preventDefault();
                void start();
              }
            }}
          />
          {nicknameStatus}
        </div>
        <button
          type="button"
          className="btn block"
          disabled={!ready || checking || duplicate}
          onClick={() => void start()}
        >
          {checking ? '확인 중…' : duplicate ? '이미 사용 중인 닉네임' : '시작하기'}
        </button>

        {duplicate && (
          <a className="btn ghost block" style={{marginTop: 10}} href={spaceMapUrl(space.id)}>
            작성한 결과 보러가기
          </a>
        )}

        {confirmStart && elsewhere && (
          <ElsewhereWarning
            elsewhere={elsewhere}
            onCancel={() => setConfirmStart(false)}
            onConfirm={onStart}
          />
        )}

      </div>

      <div className="invite-row">
        <span className="small muted">아직 안 온 사람이 있나요?</span>
        <CopyButton value={shareUrl} label="초대 링크 복사" />
      </div>
    </section>
  );
}

interface PickProps {
  space: SpaceRow;
  nickname: string;
  doneSets: DoneSet[];
  elsewhere: Draft | null;
  evictedSet: DoneSet | null;
  onReuse: (set: DoneSet) => void;
  onFresh: () => void;
  onBack: () => void;
}

/**
 * 닉네임을 정하고 나면 나오는 갈림길. 전에 끝낸 응답이 있는 사람에게만 보인다 —
 * 60문항을 또 답게 하지 않으려고 만든 화면이라, 없는 사람에게는 존재할 이유가 없다.
 */
function Pick({space, nickname, doneSets, elsewhere, evictedSet, onReuse, onFresh, onBack}: PickProps) {
  // 고르는 순간 앞 화면 지도에 올라가고 그건 되돌릴 수 없다 — 그래서 한 번 더 묻는다.
  const [confirming, setConfirming] = useState('');
  const [confirmFresh, setConfirmFresh] = useState(false);

  return (
    <section>
      <p className="eyebrow">스페이스 {space.name} · {space.id}</p>
      <h1 style={{fontSize: 22, margin: '6px 0 8px'}}>전에 답한 걸 그대로 쓸까요?</h1>
      <p className="muted" style={{fontSize: 15}}>
        이 브라우저에 끝낸 응답 {doneSets.length}벌이 남아 있습니다. 고르면 60문항을 다시 답하지 않고
        <b> {nickname}</b>(으)로 이 스페이스에 그대로 제출됩니다.
      </p>

      {evictedSet && <ProfileCapacityWarning evictedSet={evictedSet} />}

      <ul className="reuse-list" style={{marginTop: 18}}>
        {doneSets.map(set => (
          <li key={set.spaceId}>
            <button
              type="button"
              className="reuse"
              aria-expanded={confirming === set.spaceId}
              onClick={() => setConfirming(current => current === set.spaceId ? '' : set.spaceId)}
            >
              <span className="reuse-face" style={{background: TYPES[set.primary].hex}}>
                <DogFace type={set.primary} size={34} />
              </span>
              <span className="reuse-main">
                <b>{TYPES[set.primary].name} <span className="set-code">{set.code}</span></b>
                <span className="small muted">
                  {set.spaceId === space.id ? '이 스페이스' : set.spaceName} · {set.nickname} · {formatWhen(set.completedAt)}
                </span>
              </span>
              <span className="reuse-go" aria-hidden="true">{confirming === set.spaceId ? '▾' : '→'}</span>
            </button>

            {confirming === set.spaceId && (
              <div className="reuse-confirm" role="alert">
                <b>{TYPES[set.primary].name} {set.code}를 이대로 낼까요?</b>
                <p className="small">
                  <b>{nickname}</b>(으)로 <b>{space.name}</b>에 제출되고, 앞 화면 지도에 바로 나타납니다.
                </p>
                <p className="small muted">
                  올린 결과는 <b>직접 지울 수 없고</b>, 스페이스가 지워질 때까지 지도에 남습니다.
                </p>
                {evictedSet && (
                  <p className="small">
                    제출하면 가장 오래된 <b>{evictedSet.spaceName}</b> 응답은 내 프로필에서만
                    지워집니다. 해당 스페이스에서 탈퇴되는 것은 아닙니다.
                  </p>
                )}
                <div className="reuse-confirm-actions">
                  <button type="button" className="btn ghost" onClick={() => setConfirming('')}>취소</button>
                  <button type="button" className="btn" onClick={() => onReuse(set)}>제출하기</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="small muted" style={{marginTop: 8}}>
        지우려면 <a href={profileUrl()}>프로필</a>에서 관리하세요.
      </p>

      <div className="or-rule"><span>또는</span></div>

      <button
        type="button"
        className="btn ghost block"
        onClick={() => (elsewhere ? setConfirmFresh(true) : onFresh())}
      >
        60문항 새로 답하기
      </button>

      {confirmFresh && elsewhere && (
        <ElsewhereWarning
          elsewhere={elsewhere}
          onCancel={() => setConfirmFresh(false)}
          onConfirm={onFresh}
        />
      )}

      <p className="center" style={{marginTop: 18}}>
        <button type="button" className="linkish" onClick={onBack}>← 닉네임 다시 정하기</button>
      </p>
    </section>
  );
}

interface QuizProps {
  answers: number[];
  page: number;
  evictedSet: DoneSet | null;
  onAnswer: (index: number, value: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReset: () => void;
}

function Quiz({answers, page, evictedSet, onAnswer, onPrevious, onNext, onReset}: QuizProps) {
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

      {page === PAGES - 1 && evictedSet && <ProfileCapacityWarning evictedSet={evictedSet} />}

      <div className="pager">
        {page > 0 && <button type="button" className="btn ghost" onClick={onPrevious}>이전</button>}
        <button type="button" className="btn" disabled={done < PAGE_SIZE} onClick={onNext}>
          {page === PAGES - 1 ? '결과 보기' : '다음'}
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

function SaveStateBar({state, onRetry, onRetryNickname}: {
  state: SaveStatus;
  onRetry: () => void;
  onRetryNickname: (nickname: string) => void;
}) {
  const [renameMode, setRenameMode] = useState(false);
  const [replacement, setReplacement] = useState('');
  const replacementIssue = replacement ? validateNickname(replacement) : null;

  useEffect(() => {
    if (state.code === 'NICKNAME_DUPLICATE') setRenameMode(true);
  }, [state.code]);

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
      {state.code && <code className="error-code">{state.code}</code>}
      {renameMode ? (
        <div className="field save-rename">
          <label htmlFor="result-retry-nickname">다른 닉네임으로 저장</label>
          <input
            id="result-retry-nickname"
            className="input"
            maxLength={NICKNAME_MAX}
            autoComplete="off"
            placeholder="새 닉네임"
            value={replacement}
            aria-invalid={Boolean(replacementIssue)}
            onChange={event => setReplacement(event.target.value)}
          />
          {replacementIssue && (
            <p className="field-status error" role="status">
              <code className="error-code">{replacementIssue.code}</code>{replacementIssue.message}
            </p>
          )}
          <button
            type="button"
            className="btn ghost block save-retry"
            disabled={!replacement.trim() || Boolean(replacementIssue)}
            onClick={() => onRetryNickname(replacement.trim())}
          >닉네임 바꿔 저장</button>
        </div>
      ) : (
        <button type="button" className="btn ghost block save-retry" onClick={onRetry}>저장 다시 시도</button>
      )}
    </div>
  );
}

interface ResultProps {
  result: ScoreResult;
  saveState: SaveStatus;
  spaceId: string;
  onRetry: () => void;
  onRetryNickname: (nickname: string) => void;
  onAgain: () => void;
}

function Result({result, saveState, spaceId, onRetry, onRetryNickname, onAgain}: ResultProps) {
  return (
    <section aria-live="polite">
      <PersonalResult result={result} />
      <SaveStateBar
        state={saveState}
        onRetry={onRetry}
        onRetryNickname={onRetryNickname}
      />

      {saveState.status === 'ok' && (
        <>
          <div className="callout center" style={{marginTop: 18}}>
            이제 <b>앞 화면을 보세요.</b> 같은 스페이스 사람들의 관계도가 실시간으로 그려집니다.
          </div>
          <a href={spaceMapUrl(spaceId)} className="btn block" style={{marginTop: 12}}>스페이스 관계도 보기 🐾</a>
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

export function ParticipantApp({space, token, shareUrl, sharedWith}: {
  space: SpaceRow;
  token: string;
  shareUrl: string;
  sharedWith: SpaceSummary[];
}) {
  const room = space.id;
  // 진행 중에 보관소가 바뀔 일이 없으니 한 번만 읽는다.
  const stored = useMemo(() => loadStore(), []);
  const draft = stored.draft?.spaceId === room ? stored.draft : null;
  // 저쪽 스페이스에서 풀다 만 한 벌. 여기서 새로 답하기 시작하면 밀려나므로 미리 알려준다.
  const elsewhere = stored.draft && stored.draft.spaceId !== room ? stored.draft : null;
  const doneSets = stored.done;
  const evictedSet = doneSetToEvict(doneSets, room);
  const [nickname, setNickname] = useState(draft?.nickname || doneSets[0]?.nickname || '');
  const [answers, setAnswers] = useState<number[]>(draft?.answers || EMPTY_ANSWERS);
  const [page, setPage] = useState(draft?.page || 0);
  const [screen, setScreen] = useState(draft?.answers.some(Boolean) ? 'quiz' : 'intro');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [saveState, setSaveState] = useState<SaveStatus>({status: 'idle', code: '', error: ''});
  const submissionIdRef = useRef('');
  if (!submissionIdRef.current) submissionIdRef.current = crypto.randomUUID();

  // 한 문항 고를 때마다 덮어쓴다. 새로고침·강제 종료에서 살아남아야 하는 건 이것뿐이다.
  // 설문을 열어만 두고 한 문항도 안 골랐다면 저장하지 않는다 — 빈 한 벌을 써넣으면
  // 이어할 것도 없으면서 다른 스페이스에서 풀던 진짜 한 벌만 밀어낸다.
  useEffect(() => {
    if (screen !== 'quiz' || !nickname || !answers.some(Boolean)) return;
    saveDraft({
      spaceId: room,
      spaceName: space.name,
      nickname,
      answers,
      page,
      updatedAt: Date.now()
    });
  }, [answers, nickname, page, room, screen, space.name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, screen]);

  const persist = async (
    nextResult: ScoreResult,
    nextNickname = nickname,
    submissionId = submissionIdRef.current
  ) => {
    setSaveState({status: 'saving', code: '', error: ''});
    // room은 보내지 않는다 — 서버가 출입증을 검증한 스페이스로 못박는다.
    const response = await saveResult(room, token, {
      id: submissionId,
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
      setSaveState({status: 'ok', code: '', error: ''});
    } else {
      setSaveState({status: 'error', code: response.code, error: response.error || '알 수 없는 오류'});
    }
  };

  const submitAnswers = (nextAnswers = answers, nextNickname = nickname) => {
    const trimmed = nextNickname.trim().slice(0, NICKNAME_MAX);
    if (!trimmed || nextAnswers.filter(Boolean).length < Q.length) return;

    const nextResult = score(nextAnswers);
    const submissionId = crypto.randomUUID();
    submissionIdRef.current = submissionId;
    setNickname(trimmed);
    setAnswers(nextAnswers);
    setResult(nextResult);
    setScreen('result');

    // 서버 저장과는 별개다. 저장이 실패해도 답한 60문항은 이 브라우저에 남아야
    // 다시 들어와서 그대로 낼 수 있다.
    saveDoneSet({
      spaceId: room,
      spaceName: space.name,
      nickname: trimmed,
      answers: nextAnswers,
      code: nextResult.code,
      primary: nextResult.primary,
      completedAt: Date.now()
    });
    void persist(nextResult, trimmed, submissionId);
  };

  const reset = () => {
    clearDraft();
    setAnswers(EMPTY_ANSWERS());
    setPage(0);
    setResult(null);
    setSaveState({status: 'idle', code: '', error: ''});
    setScreen('intro');
  };

  return (
    <main className="wrap">
      {screen === 'intro' && (
        <Intro
          space={space}
          token={token}
          shareUrl={shareUrl}
          nickname={nickname}
          sharedWith={sharedWith}
          elsewhere={elsewhere}
          startsQuiz={doneSets.length === 0}
          onNicknameChange={setNickname}
          onStart={() => {
            const value = nickname.trim().slice(0, NICKNAME_MAX);
            if (!value) return;
            setNickname(value);
            // 전에 끝낸 게 있으면 60문항을 또 답게 하기 전에 먼저 물어본다.
            setScreen(doneSets.length > 0 ? 'pick' : 'quiz');
          }}
        />
      )}

      {screen === 'pick' && (
        <Pick
          space={space}
          nickname={nickname}
          doneSets={doneSets}
          elsewhere={elsewhere}
          evictedSet={evictedSet}
          onReuse={set => submitAnswers(set.answers)}
          onFresh={() => setScreen('quiz')}
          onBack={() => setScreen('intro')}
        />
      )}

      {screen === 'quiz' && (
        <Quiz
          answers={answers}
          page={page}
          evictedSet={evictedSet}
          onAnswer={(index, value) => {
            setAnswers(current => current.map((answer, answerIndex) => answerIndex === index ? value : answer));
          }}
          onPrevious={() => setPage(current => Math.max(0, current - 1))}
          onNext={() => {
            if (page === PAGES - 1) submitAnswers();
            else setPage(current => Math.min(PAGES - 1, current + 1));
          }}
          onReset={reset}
        />
      )}

      {screen === 'result' && result && (
        <Result
          result={result}
          saveState={saveState}
          spaceId={room}
          onRetry={() => void persist(result)}
          onRetryNickname={nextNickname => {
            const trimmed = nextNickname.trim();
            setNickname(trimmed);
            saveDoneSet({
              spaceId: room,
              spaceName: space.name,
              nickname: trimmed,
              answers,
              code: result.code,
              primary: result.primary,
              completedAt: Date.now()
            });
            void persist(result, trimmed);
          }}
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
