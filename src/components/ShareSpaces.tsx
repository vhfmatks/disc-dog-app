// 지도 맨 아래의 공유 서랍.
//
// 공유는 **양방향**입니다. 한쪽이 제안하고 다른 쪽이 수락하면 서로를 봅니다 —
// 그래서 수락 버튼을 누르는 사람은 자기 결과도 상대에게 넘긴다는 걸 알아야 합니다.
// 이 화면에서 가장 중요한 문장이 그겁니다.
//
// 넘어가는 건 지도뿐입니다. 공유했다고 상대가 우리 설문에 참가하거나 발자국을 찍을
// 수는 없습니다 — 그러려면 우리 초대 링크나 비밀번호가 있어야 하고, 공유는 그걸
// 주지 않습니다.
//
// 열쇠는 스페이스 비밀번호입니다. 초대 링크로 들어온 참가자는 비밀번호를 모르니 이
// 서랍을 열지 못합니다. 반대로 비밀번호를 아는 사람은 생성자가 아니어도 열 수
// 있습니다 — 의도된 선택입니다 (8_mutual_shares).

import {useEffect, useMemo, useRef, useState} from 'react';
import {SpaceIcon} from './SpaceIcon.tsx';
import {acceptShare, listShareableSpaces, shareSpace, unshareSpace} from '../lib/db.ts';
import type {ShareCandidate, SpaceSummary} from '../lib/db.ts';
import {DEFAULT_SPACE_ICON_ID, isSpaceIconId} from '../lib/space-icons.ts';
import type {SpaceIconId} from '../lib/space-icons.ts';

const safeIconId = (value: string | undefined): SpaceIconId =>
  value && isSpaceIconId(value) ? value : DEFAULT_SPACE_ICON_ID;

/**
 * 확인한 비밀번호는 이 탭에서만, 이 스페이스에 대해서만 기억한다. 공유를 몇 번
 * 누를 때마다 다시 묻지 않기 위해서다. localStorage가 아니라 sessionStorage인 건
 * 프로젝터에 띄워둔 브라우저에 비밀번호를 영구히 남기지 않기 위해서다.
 */
const passwordKey = (spaceId: string) => `dogtype:space-password:${spaceId}`;

const rememberPassword = (spaceId: string, password: string) => {
  try { sessionStorage.setItem(passwordKey(spaceId), password); } catch { /* 시크릿 모드 */ }
};
const recallPassword = (spaceId: string) => {
  try { return sessionStorage.getItem(passwordKey(spaceId)) || ''; } catch { return ''; }
};
const forgetPassword = (spaceId: string) => {
  try { sessionStorage.removeItem(passwordKey(spaceId)); } catch { /* noop */ }
};

interface ShareSpacesProps {
  spaceId: string;
  spaceName: string;
  /** 수락을 기다리는 제안. 지도가 서버에서 받아 내려준다. */
  pendingOffers: SpaceSummary[];
  /** 공유가 바뀌었으니 지도를 다시 읽어야 한다. */
  onChanged: () => void;
}

type Panel = 'closed' | 'password' | 'list';

export function ShareSpaces({spaceId, spaceName, pendingOffers, onChanged}: ShareSpacesProps) {
  const [panel, setPanel] = useState<Panel>('closed');
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [spaces, setSpaces] = useState<ShareCandidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const load = async (secret: string) => {
    setError('');
    const response = await listShareableSpaces(spaceId, secret);
    if (response.ok) {
      setSpaces(response.spaces);
      setPassword(secret);
      rememberPassword(spaceId, secret);
      setPanel('list');
      return true;
    }
    // 세션에 남아 있던 비밀번호가 이제 안 맞는다 (스페이스가 다시 만들어졌거나).
    forgetPassword(spaceId);
    setError(response.error);
    setPanel('password');
    return false;
  };

  const open = () => {
    const remembered = recallPassword(spaceId);
    if (remembered) {
      setPanel('list');
      void load(remembered);
    } else {
      setPanel('password');
    }
  };

  useEffect(() => {
    if (panel === 'list') searchRef.current?.focus();
  }, [panel, spaces]);

  const act = async (
    action: typeof shareSpace | typeof acceptShare | typeof unshareSpace,
    partnerId: string
  ) => {
    setBusy(partnerId);
    setError('');
    const response = await action(spaceId, partnerId, password);
    setBusy('');
    if (!response.ok) {
      setError(response.error);
      return;
    }
    await load(password);   // 목록 상태를 서버 기준으로 다시 맞춘다
    onChanged();            // 지도도 다시 읽는다
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = spaces || [];
    if (!needle) return all;
    return all.filter(space =>
      space.name.toLowerCase().includes(needle) || space.id.includes(needle)
    );
  }, [spaces, query]);

  // 붙어 있는 것부터 보여준다 — 지금 무엇과 이어져 있는지가 먼저 읽혀야 한다.
  const rank = (space: ShareCandidate) =>
    space.state === 'pending' && space.incoming ? 0
      : space.state === 'active' ? 1
        : space.state === 'pending' ? 2 : 3;
  const ordered = useMemo(
    () => [...filtered].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko')),
    [filtered]
  );

  const activeCount = (spaces || []).filter(space => space.state === 'active').length;

  return (
    <section className="share-panel">
      {/* 받은 제안은 서랍을 열지 않아도 보인다 — 안 그러면 아무도 모른 채 지나간다. */}
      {pendingOffers.length > 0 && (
        <div className="share-offers" role="status">
          <b>다른 스페이스가 함께보기를 제안했습니다</b>
          <ul className="share-offer-list">
            {pendingOffers.map(offer => (
              <li key={offer.id}>
                <SpaceIcon iconId={safeIconId(offer.icon_id)} size={26} decorative />
                <span className="share-offer-name">{offer.name}</span>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    const remembered = recallPassword(spaceId);
                    if (remembered) {
                      setPassword(remembered);
                      void act(acceptShare, offer.id);
                    } else {
                      setPanel('password');
                    }
                  }}
                >
                  수락
                </button>
              </li>
            ))}
          </ul>
          <p className="small muted">
            수락하면 <b>서로</b> 보게 됩니다 — 저쪽 지도에도 우리 스페이스가 함께 뜹니다.
            수락 이후에 제출되는 결과부터입니다.
          </p>
        </div>
      )}

      <button
        type="button"
        className="btn ghost block share-open-btn"
        aria-expanded={panel !== 'closed'}
        onClick={() => (panel === 'closed' ? open() : setPanel('closed'))}
      >
        <span aria-hidden="true">🔗</span>
        {panel === 'closed'
          ? activeCount > 0 ? `공유하기 · ${activeCount}곳과 함께보는 중` : '공유하기'
          : '닫기'}
      </button>

      {panel === 'password' && (
        <form
          className="card share-gate"
          onSubmit={async event => {
            event.preventDefault();
            if (!typed || busy) return;
            setBusy('gate');
            await load(typed);
            setBusy('');
            setTyped('');
          }}
        >
          <p className="eyebrow">SHARE</p>
          <h3>스페이스 비밀번호를 입력하세요</h3>
          <p className="small muted">
            <b>{spaceName}</b>을(를) 만들 때 정한 비밀번호입니다. 공유를 맺고 끊는 건 이
            비밀번호를 아는 사람만 할 수 있습니다.
          </p>
          <div className="field">
            <label htmlFor="share-password">비밀번호</label>
            <input
              id="share-password"
              className="input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={typed}
              onChange={event => {
                setTyped(event.target.value);
                setError('');
              }}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn block" type="submit" disabled={!typed || Boolean(busy)}>
            {busy === 'gate' ? '확인 중…' : '확인'}
          </button>
        </form>
      )}

      {panel === 'list' && (
        <div className="card share-list-card">
          <p className="eyebrow">SHARE</p>
          <h3>다른 스페이스와 함께보기</h3>
          <p className="small muted">
            공유하면 상대가 수락한 시점부터 <b>서로의 지도</b>에 함께 뜹니다. 넘어가는 건
            닉네임과 강아지 유형뿐이고, 상대가 우리 설문에 참가하거나 발자국을 찍을 수는
            없습니다 — 그러려면 우리 초대 링크나 비밀번호가 있어야 합니다.
          </p>

          <div className="field share-search">
            <label htmlFor="share-search">스페이스 찾기</label>
            <input
              id="share-search"
              ref={searchRef}
              className="input"
              placeholder="이름이나 입장 코드"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          {spaces === null && <p className="small muted">불러오는 중…</p>}

          {spaces !== null && ordered.length === 0 && (
            <p className="small muted">
              {query.trim() ? '찾는 스페이스가 없습니다.' : '공유할 수 있는 스페이스가 없습니다.'}
            </p>
          )}

          <ul className="share-candidates">
            {ordered.map(space => (
              <li className={`share-candidate ${space.state}`} key={space.id}>
                <SpaceIcon iconId={safeIconId(space.icon_id)} size={32} decorative />
                <span className="share-candidate-main">
                  <b>{space.name}</b>
                  <span className="small muted">/{space.id}</span>
                </span>

                {space.state === 'active' && <span className="share-tag active">함께보는 중</span>}
                {space.state === 'pending' && !space.incoming && (
                  <span className="share-tag pending">수락 대기</span>
                )}
                {space.state === 'pending' && space.incoming && (
                  <span className="share-tag incoming">제안 받음</span>
                )}

                <span className="share-candidate-actions">
                  {space.state === 'none' || space.state === 'ended' ? (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy === space.id}
                      onClick={() => void act(shareSpace, space.id)}
                    >
                      {busy === space.id ? '보내는 중…' : '공유하기'}
                    </button>
                  ) : space.state === 'pending' && space.incoming ? (
                    <>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busy === space.id}
                        onClick={() => void act(acceptShare, space.id)}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy === space.id}
                        onClick={() => void act(unshareSpace, space.id)}
                      >
                        거절
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy === space.id}
                      onClick={() => void act(unshareSpace, space.id)}
                    >
                      {space.state === 'active' ? '해제' : '제안 취소'}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="small muted share-foot">
            비밀번호가 있는 스페이스만 나옵니다. 코드만 알면 누구나 들어오는 열린 방은
            공유 대상이 될 수 없습니다 — 사실상 전체 공개가 되니까요.
          </p>
        </div>
      )}
    </section>
  );
}
