import {useEffect, useRef, useState} from 'react';
import {Q, TYPES, score} from '../assets/data.ts';
import {DogFace} from './components/DogFace.tsx';
import {PersonalResult} from './components/PersonalResult.tsx';
import {DONE_MAX, clearDraft, deleteDoneSet, formatWhen, loadStore} from './lib/answer-store.ts';
import type {AnswerStore, DoneSet, Draft} from './lib/answer-store.ts';
import {homeUrl, spaceMapUrl, spaceUrl} from './lib/router.ts';

/** 확인 단계에 있는 카드. 완료 세트는 spaceId로, 진행 중인 한 벌은 'draft'로 가린다. */
type Confirming = string | null;

interface DangerProps {
  lead: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 이 응답은 이 브라우저에만 있다. 서버에도 없고 다른 기기에도 없으니 지우면 그걸로 끝이다.
 * 그래서 한 번 더 묻고, 무엇이 사라지는지 말한 다음에 지운다.
 */
function DangerConfirm({lead, onCancel, onConfirm}: DangerProps) {
  return (
    <div className="danger" role="alert">
      <b>{lead}</b>
      <p className="small">
        이 응답은 <b>이 브라우저에만</b> 저장되어 있습니다. 지우면 <b>절대 복구할 수 없고</b>,
        다시 쓰려면 60문항을 처음부터 답해야 합니다.
      </p>
      <p className="small muted">
        이미 지도에 올라간 결과는 여기서 지워지지 않습니다 — 그건 스페이스가 지워질 때까지
        남습니다. 여기서 지우는 건 이 브라우저에 남은 응답 한 벌입니다.
      </p>
      <div className="danger-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>취소</button>
        <button type="button" className="btn danger" onClick={onConfirm}>영구 삭제</button>
      </div>
    </div>
  );
}

interface DraftCardProps {
  draft: Draft;
  confirming: boolean;
  onAskDelete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function DraftCard({draft, confirming, onAskDelete, onCancel, onDelete}: DraftCardProps) {
  const done = draft.answers.filter(Boolean).length;

  return (
    <li className="set-card">
      <div className="set-row">
        <div className="set-badge todo" aria-hidden="true">{done}<small>/{Q.length}</small></div>
        <div className="set-main">
          <b>{draft.spaceName}</b>
          <span className="small muted">
            {draft.nickname} · {formatWhen(draft.updatedAt)}까지 답함
          </span>
        </div>
      </div>
      <div className="set-actions">
        <a className="btn" href={spaceUrl(draft.spaceId)}>이어하기</a>
        {!confirming && (
          <button type="button" className="btn ghost" onClick={onAskDelete}>삭제</button>
        )}
      </div>
      {confirming && (
        <DangerConfirm
          lead="진행 중인 응답을 지울까요?"
          onCancel={onCancel}
          onConfirm={onDelete}
        />
      )}
    </li>
  );
}

interface DoneCardProps {
  set: DoneSet;
  confirming: boolean;
  onShowResult: () => void;
  onAskDelete: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

function DoneCard({set, confirming, onShowResult, onAskDelete, onCancel, onDelete}: DoneCardProps) {
  const type = TYPES[set.primary];

  return (
    <li className="set-card">
      <div className="set-row">
        <div className="set-badge" style={{background: type.hex}}>
          <DogFace type={set.primary} size={38} />
        </div>
        <div className="set-main">
          <b>{type.name} <span className="set-code">{set.code}</span></b>
          <span className="small muted">
            {set.spaceName} · {set.nickname} · {formatWhen(set.completedAt)}
          </span>
        </div>
      </div>
      <div className="set-actions">
        <button type="button" className="btn" onClick={onShowResult}>결과 보기</button>
        <a className="btn ghost" href={spaceMapUrl(set.spaceId)}>스페이스 열기</a>
        {!confirming && (
          <button type="button" className="btn ghost" onClick={onAskDelete}>삭제</button>
        )}
      </div>
      {confirming && (
        <DangerConfirm
          lead={`${set.spaceName}의 응답을 지울까요?`}
          onCancel={onCancel}
          onConfirm={onDelete}
        />
      )}
    </li>
  );
}

function ResultDialog({set, onClose}: {set: DoneSet; onClose: () => void}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const result = score(set.answers);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="profile-result-dialog"
      aria-labelledby="profile-result-title"
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <header className="profile-result-head">
        <div>
          <p className="eyebrow">MY RESULT</p>
          <h2 id="profile-result-title">{set.nickname}님의 개인 결과</h2>
          <p className="small muted">{set.spaceName} · {formatWhen(set.completedAt)}</p>
        </div>
        <button
          type="button"
          className="profile-result-close"
          aria-label="개인 결과 닫기"
          onClick={() => dialogRef.current?.close()}
        >×</button>
      </header>
      <div className="profile-result-body">
        <PersonalResult result={result} />
        <p className="small muted center profile-result-note">
          이 도구는 자기 이해와 팀 커뮤니케이션을 위한 워크숍용입니다.<br />
          채용·평가·배치의 근거로 쓰지 마세요.
        </p>
        <button
          type="button"
          className="btn ghost block profile-result-confirm"
          onClick={() => dialogRef.current?.close()}
        >닫기</button>
      </div>
    </dialog>
  );
}

export function ProfileApp() {
  const [store, setStore] = useState<AnswerStore>(() => loadStore());
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [selected, setSelected] = useState<DoneSet | null>(null);

  const empty = !store.draft && store.done.length === 0;

  return (
    <main className="wrap">
      <section>
        <p className="eyebrow">PROFILE</p>
        <h1 style={{fontSize: 23, margin: '6px 0 8px'}}>내 응답</h1>
        <p className="muted" style={{fontSize: 15}}>
          이 브라우저에 남아 있는 응답입니다. 다른 스페이스에 들어가서 다시 답하기 귀찮을 때
          <b> 최근 {DONE_MAX}벌</b> 중에 골라 그대로 낼 수 있습니다.
        </p>

        {empty ? (
          <div className="card" style={{marginTop: 20}}>
            <p className="muted center">
              아직 저장된 응답이 없습니다.<br />
              설문을 끝내면 이 자리에 남습니다.
            </p>
            <a className="btn ghost block" style={{marginTop: 14}} href={homeUrl()}>스페이스 찾아가기</a>
          </div>
        ) : (
          <ul className="set-list">
            {store.draft && (
              <DraftCard
                draft={store.draft}
                confirming={confirming === 'draft'}
                onAskDelete={() => setConfirming('draft')}
                onCancel={() => setConfirming(null)}
                onDelete={() => {
                  clearDraft();
                  setStore(loadStore());
                  setConfirming(null);
                }}
              />
            )}
            {store.done.map(set => (
              <DoneCard
                set={set}
                key={set.spaceId}
                confirming={confirming === set.spaceId}
                onShowResult={() => setSelected(set)}
                onAskDelete={() => setConfirming(set.spaceId)}
                onCancel={() => setConfirming(null)}
                onDelete={() => {
                  deleteDoneSet(set.spaceId);
                  setStore(loadStore());
                  setConfirming(null);
                }}
              />
            ))}
          </ul>
        )}

        {selected && <ResultDialog set={selected} onClose={() => setSelected(null)} />}

        <ul className="notes" style={{marginTop: 20}}>
          <li>응답은 <b>이 브라우저에만</b> 저장됩니다. 서버로 보내지 않습니다.</li>
          <li>끝낸 응답은 최근 <b>{DONE_MAX}벌</b>까지 남습니다. 모두 찬 뒤 새로운 스페이스 응답을
            저장하면 가장 오래된 응답이 <b>이 프로필에서만</b> 지워집니다. 해당 스페이스에서
            탈퇴되는 것은 아닙니다.</li>
          <li>진행 중인 응답은 <b>한 벌</b>만 남습니다 — 위 {DONE_MAX}벌과는 별도입니다.
            다른 스페이스에서 새로 답하기 시작하면 대체됩니다.</li>
        </ul>
      </section>
    </main>
  );
}
