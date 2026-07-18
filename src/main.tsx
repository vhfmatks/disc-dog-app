import {Suspense, lazy, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AdminApp} from './AdminApp.tsx';
import {MapApp} from './MapApp.tsx';
import {ParticipantApp} from './ParticipantApp.tsx';
import {ProfileApp} from './ProfileApp.tsx';
import {MscApp} from './tests/msc/MscApp.tsx';
import {AppHeader} from './components/AppHeader.tsx';
import {CopyButton} from './components/CopyButton.tsx';
import {SpaceNameStatus, ValidationStatus} from './components/FieldStatus.tsx';
import {SpaceIcon} from './components/SpaceIcon.tsx';
import {useSpaceNameCheck} from './hooks/useSpaceNameCheck.ts';
import {
  clearToken, loadToken, readShareTokenFromUrl, saveToken, stripShareTokenFromUrl
} from './lib/access.ts';
import {formatWhen} from './lib/answer-store.ts';
import {SPACE_NAME_MAX, SPACE_PASSWORD_MIN, createSpace, enterSpace, fetchActiveSpaces} from './lib/db.ts';
import type {ActiveSpaceRow, SpaceRow, SpaceSummary} from './lib/db.ts';
import {validatePasswordConfirmation, validateSpacePassword} from './lib/space-rules.ts';
import {
  createUrl, homeUrl, spacePasswordUrl, spaceShareUrl,
  stripPasswordGateFromUrl, useRoute
} from './lib/router.ts';
import type {Route} from './lib/router.ts';
import {
  DEFAULT_SPACE_ICON_ID, SPACE_ICONS, isSpaceIconId
} from './lib/space-icons.ts';
import type {SpaceIconId} from './lib/space-icons.ts';
import '../assets/style.css';

// GitHub Pages의 404.html이 전달한 원래 clean URL을 복원한다. 공유 링크의 #k=...도
// 여기서 함께 돌아온다 — 아래 컴포넌트들이 읽기 전에 끝나야 하므로 모듈 최상단이다.
const redirectedPath = new URLSearchParams(window.location.search).get('__spa');
if (redirectedPath?.startsWith('/')) window.history.replaceState(null, '', redirectedPath);

type ActiveSpacesState =
  | {status: 'loading'; spaces: ActiveSpaceRow[]; page: number; hasMore: boolean; message?: string}
  | {status: 'ready' | 'loading-more'; spaces: ActiveSpaceRow[]; page: number; hasMore: boolean; message?: string}
  | {status: 'error'; spaces: ActiveSpaceRow[]; page: number; hasMore: boolean; message: string};

const safeIconId = (value: string): SpaceIconId =>
  isSpaceIconId(value) ? value : DEFAULT_SPACE_ICON_ID;

function HomeApp() {
  const [reload, setReload] = useState(0);
  const [activeSpaces, setActiveSpaces] = useState<ActiveSpacesState>({
    status: 'loading', spaces: [], page: 0, hasMore: false
  });

  useEffect(() => {
    let active = true;
    setActiveSpaces({status: 'loading', spaces: [], page: 0, hasMore: false});
    fetchActiveSpaces(0).then(response => {
      if (!active) return;
      setActiveSpaces(response.ok
        ? {status: 'ready', spaces: response.spaces, page: response.page, hasMore: response.hasMore}
        : {status: 'error', spaces: [], page: 0, hasMore: false, message: response.error}
      );
    });
    return () => { active = false; };
  }, [reload]);

  const loadMore = async () => {
    if (activeSpaces.status !== 'ready' || !activeSpaces.hasMore) return;
    const nextPage = activeSpaces.page + 1;
    setActiveSpaces(current => current.status === 'ready'
      ? {...current, status: 'loading-more', message: undefined}
      : current
    );
    const response = await fetchActiveSpaces(nextPage);
    setActiveSpaces(current => {
      if (current.status !== 'loading-more') return current;
      if (!response.ok) return {...current, status: 'ready', message: response.error};
      return {
        status: 'ready',
        spaces: [...current.spaces, ...response.spaces],
        page: response.page,
        hasMore: response.hasMore
      };
    });
  };

  return (
    <main className="wrap home-wrap home-with-spaces">
      <section className="active-spaces" aria-labelledby="active-spaces-title" aria-busy={activeSpaces.status === 'loading'}>
        <header className="active-spaces-head">
          <div>
            <p className="eyebrow">ACTIVE NOW</p>
            <h2 id="active-spaces-title">지금 활발한 스페이스</h2>
          </div>
          <span className="small muted">최근 24시간</span>
        </header>
        <p className="small muted active-spaces-note">
          참여 결과가 올라온 스페이스입니다. 들어갈 때 생성자가 정한 비밀번호가 필요합니다.
        </p>

        {activeSpaces.status === 'loading' && activeSpaces.spaces.length === 0 && (
          <div className="active-spaces-status">스페이스를 불러오는 중…</div>
        )}
        {activeSpaces.status === 'error' && (
          <div className="active-spaces-status" role="status">
            <p>목록을 불러오지 못했습니다.</p>
            <p className="small muted">{activeSpaces.message}</p>
            <button type="button" className="btn ghost sm" onClick={() => setReload(value => value + 1)}>
              다시 시도
            </button>
          </div>
        )}
        {activeSpaces.status === 'ready' && activeSpaces.spaces.length === 0 && (
          <div className="active-spaces-status">아직 진행 중인 스페이스가 없습니다.</div>
        )}
        {activeSpaces.spaces.length > 0 && (
          <>
            <ul className="active-space-list">
              {activeSpaces.spaces.map(space => (
                <li key={space.id}>
                  <a className="active-space-card" href={spacePasswordUrl(space.id)}>
                    <span className="active-space-icon" aria-hidden="true">
                      <SpaceIcon iconId={safeIconId(space.icon_id)} size={54} decorative />
                    </span>
                    <span className="active-space-main">
                      <strong>{space.name}</strong>
                      <span className="active-space-code">/{space.id}</span>
                      <span className="small muted">
                        참여자 {space.participant_count}명 · {formatWhen(Date.parse(space.last_activity_at))} 활동
                      </span>
                    </span>
                    <span className="active-space-enter">비밀번호 입력 <span aria-hidden="true">→</span></span>
                  </a>
                </li>
              ))}
            </ul>
            {activeSpaces.hasMore && (
              <div className="active-spaces-more">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={activeSpaces.status === 'loading-more'}
                  onClick={() => void loadMore()}
                >
                  {activeSpaces.status === 'loading-more' ? '불러오는 중…' : '더 보기'}
                </button>
                {activeSpaces.message && <p className="form-error" role="status">{activeSpaces.message}</p>}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/**
 * QR 인코더는 gzip 14KB다. 이 화면은 스페이스를 만든 사람만 보는데, 참가자 대다수는
 * 폰으로 들어온다 — 쓰지도 않을 걸 LTE로 받게 하지 않는다. 별도 청크로 뺀다.
 */
const QrCode = lazy(() => import('./components/QrCode.tsx').then(m => ({default: m.QrCode})));

function SpaceCreated({space, token}: {space: SpaceRow; token: string}) {
  const shareUrl = spaceShareUrl(space.id, token);

  return (
    <main className="wrap home-wrap">
      <section className="card">
        <p className="eyebrow">READY</p>
        <div className="created-space-title">
          <SpaceIcon iconId={safeIconId(space.icon_id)} size={64} decorative />
          <h1>{space.name}</h1>
        </div>
        <p className="muted admin-lead">
          스페이스가 열렸습니다. 팀원이나 친구에게 초대 링크를 보내세요.
        </p>

        <div className="share-box">
          <label htmlFor="share-url">초대 링크</label>
          <div className="share-row">
            <input
              id="share-url"
              className="input"
              readOnly
              value={shareUrl}
              onFocus={event => event.target.select()}
            />
            <CopyButton value={shareUrl} label="복사" className="btn" />
          </div>
          <div className="qr-invite">
            {/* 자리를 미리 잡아둬야 QR이 도착할 때 화면이 튀지 않는다. */}
            <Suspense fallback={<div className="qr qr-loading" style={{width: 200, height: 200}} />}>
              <QrCode value={shareUrl} size={200} label={`${space.name} 스페이스 초대 링크 QR 코드`} />
            </Suspense>
          </div>
          <p className="small muted">
            링크와 QR에는 출입증이 들어 있습니다. 연 사람은 비밀번호 없이 바로 참여합니다 —
            그러니 아무나 보는 곳에 올리거나 띄워두지 마세요.
          </p>
        </div>

        <div className="share-box">
          <label htmlFor="share-code">입장 코드</label>
          <p className="code-pill" id="share-code">{space.id}</p>
          <p className="small muted">
            링크 없이 들어오는 사람에게는 이 코드와 비밀번호를 알려주세요.
            진행자 화면에도 계속 떠 있습니다.
          </p>
        </div>

        <div className="share-box manage-share-box">
          <label>방금 정한 비밀번호</label>
          <p className="small">
            이 비밀번호는 입장에만 쓰는 게 아닙니다. 지도 아래에서 <b>다른 스페이스와
            함께보기를 맺고 끊을 때</b> 이걸 물어봅니다 — 이 스페이스의 관리 비밀번호이기도
            합니다.
          </p>
          <p className="small muted">
            그래서 비밀번호를 아는 사람은 누구나 이 스페이스의 결과를 다른 스페이스에
            공유할 수 있습니다. 참가자에게는 <b>초대 링크</b>를 주면 비밀번호 없이 들어오니,
            굳이 비밀번호를 알릴 이유가 없습니다.
          </p>
        </div>

        <a className="btn block" href={shareUrl}>스페이스 들어가기</a>
        <p className="small muted center" style={{marginTop: 14}}>
          비밀번호는 다시 볼 수 없습니다. 잊어버렸더라도 초대 링크만 있으면 계속 들어갈 수 있어요.
        </p>
      </section>
    </main>
  );
}

function CreateApp() {
  const [name, setName] = useState('');
  const [iconId, setIconId] = useState<SpaceIconId>(DEFAULT_SPACE_ICON_ID);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{code: string; message: string} | null>(null);
  const [created, setCreated] = useState<{space: SpaceRow; token: string} | null>(null);
  const {state: nameCheck, checkNow: checkNameNow} = useSpaceNameCheck(name);

  if (created) return <SpaceCreated space={created.space} token={created.token} />;

  const passwordIssue = password ? validateSpacePassword(password) : null;
  const confirmIssue = validatePasswordConfirmation(password, confirm);
  // 사전 확인 장애가 생성 자체를 막지는 않는다. DB unique와 create API가 최종 판정한다.
  const nameReady = (nameCheck.status === 'available' || nameCheck.status === 'error')
    && nameCheck.candidate === name.trim();
  const valid = nameReady && password.length >= SPACE_PASSWORD_MIN && !passwordIssue && password === confirm;

  return (
    <main className="wrap home-wrap create-wrap">
      <section className="card">
        <p className="eyebrow">NEW SPACE</p>
        <h1>새 스페이스 만들기</h1>

        <form onSubmit={async event => {
          event.preventDefault();
          if (!valid || busy) return;
          setBusy(true);
          setError(null);
          const submittedName = name.trim();
          const submittedPassword = password;
          try {
            if (nameCheck.status !== 'error' && !await checkNameNow()) return;
            const response = await createSpace({name: submittedName, password: submittedPassword, iconId});
            if (response.ok) {
              setCreated({space: response.space, token: response.token});
            } else {
              setError({code: response.code, message: response.error});
              if (response.code === 'SPACE_NAME_DUPLICATE') void checkNameNow(true);
            }
          } finally {
            setBusy(false);
          }
        }}>
          <div className="field">
            <label htmlFor="space-name">스페이스 이름</label>
            <input
              id="space-name"
              className="input"
              maxLength={SPACE_NAME_MAX}
              autoFocus
              placeholder="예: 우리 가족"
              value={name}
              disabled={busy}
              aria-describedby="space-name-status"
              aria-invalid={nameCheck.status === 'duplicate' || nameCheck.status === 'invalid'}
              onChange={event => {
                setName(event.target.value);
                setError(null);
              }}
              onBlur={() => void checkNameNow()}
            />
            <SpaceNameStatus
              id="space-name-status"
              state={nameCheck}
              hint="참가자 화면과 진행자 화면에 이 이름이 표시됩니다."
            />
          </div>

          <fieldset className="space-icon-picker" disabled={busy}>
            <legend>대표 강아지</legend>
            <p className="small muted">좌우로 밀어 둘러본 뒤, 스페이스를 대표할 한 마리를 골라주세요.</p>
            <div className="space-icon-options" tabIndex={0} aria-label="대표 강아지 아이콘 목록">
              {SPACE_ICONS.map(icon => (
                <label className="space-icon-choice" key={icon.id}>
                  <input
                    type="radio"
                    name="space-icon"
                    value={icon.id}
                    checked={iconId === icon.id}
                    onChange={() => setIconId(icon.id)}
                  />
                  <span>
                    <SpaceIcon iconId={icon.id} size={46} decorative />
                    <b>{icon.label}</b>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="space-password">비밀번호</label>
            <input
              id="space-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={busy}
              aria-describedby="space-password-status"
              aria-invalid={Boolean(passwordIssue)}
              onChange={event => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            <ValidationStatus
              id="space-password-status"
              issue={passwordIssue}
              hint={`${SPACE_PASSWORD_MIN}자 이상. 초대 링크 없이 들어오는 사람이 입력할 값입니다.`}
              success={password && !passwordIssue ? '사용할 수 있는 비밀번호입니다.' : undefined}
            />
          </div>

          <div className="field">
            <label htmlFor="space-password-confirm">비밀번호 확인</label>
            <input
              id="space-password-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={busy}
              aria-describedby="space-password-confirm-status"
              aria-invalid={Boolean(confirmIssue)}
              onChange={event => {
                setConfirm(event.target.value);
                setError(null);
              }}
            />
            <ValidationStatus
              id="space-password-confirm-status"
              issue={confirmIssue}
              hint="같은 비밀번호를 한 번 더 입력해주세요."
              success={confirm && !confirmIssue ? '비밀번호가 일치합니다.' : undefined}
            />
          </div>

          {error && (
            <p className="form-error" role="alert">
              <code className="error-code">{error.code}</code>{error.message}
            </p>
          )}

          <button className="btn block" type="submit" disabled={busy || !valid}>
            {busy ? '만드는 중…' : '스페이스 만들기'}
          </button>
        </form>

        <a className="admin-entry" href={homeUrl()}>← 처음으로</a>
      </section>
    </main>
  );
}

interface SpaceGateProps {
  spaceId: string;
  onEnter: (space: SpaceRow, token: string, sharedWith: SpaceSummary[]) => void;
}

function SpaceGate({spaceId, onEnter}: SpaceGateProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <main className="wrap admin-login">
      <section className="card">
        <p className="eyebrow">LOCKED</p>
        <h1>비밀번호를 입력하세요</h1>
        <p className="muted admin-lead">
          <code>{spaceId}</code> 스페이스는 잠겨 있습니다.
          초대 링크를 받았다면 그 링크를 열면 비밀번호 없이 들어갑니다.
        </p>
        <form onSubmit={async event => {
          event.preventDefault();
          if (!password || busy) return;
          setBusy(true);
          setError('');
          const response = await enterSpace(spaceId, {password});
          setBusy(false);
          if (response.ok) {
            saveToken(spaceId, response.token);
            onEnter(response.space, response.token, response.sharedWith);
          } else {
            setError(response.error);
          }
        }}>
          <div className="field">
            <label htmlFor="gate-password">스페이스 비밀번호</label>
            <input
              id="gate-password"
              className="input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn block" type="submit" disabled={busy || !password}>들어가기</button>
        </form>
      </section>
    </main>
  );
}

type GateState =
  | {status: 'checking'}
  | {status: 'locked'}
  | {status: 'ready'; space: SpaceRow; token: string; sharedWith: SpaceSummary[]}
  | {status: 'missing'}
  | {status: 'error'; message: string};

function SpaceScreen({spaceId, screen, passwordRequired = false, withSpaceIds}: {
  spaceId: string;
  screen: 'participant' | 'map';
  passwordRequired?: boolean;
  withSpaceIds?: string[];
}) {
  const [state, setState] = useState<GateState>({status: 'checking'});

  useEffect(() => {
    let active = true;
    setState({status: 'checking'});

    // 공유 링크로 막 도착했다면 토큰을 챙기고 주소창에서는 즉시 지운다.
    const fromUrl = readShareTokenFromUrl();
    if (fromUrl) {
      saveToken(spaceId, fromUrl);
      stripShareTokenFromUrl();
    }

    // 홈 목록/코드 입력은 공개 진입점이다. 예전에 받은 출입증이 이 브라우저에 남아
    // 있어도 이번에는 생성자가 정한 비밀번호를 다시 확인한다.
    if (passwordRequired && !fromUrl) clearToken(spaceId);

    enterSpace(spaceId, {token: fromUrl || (passwordRequired ? '' : loadToken(spaceId))}).then(response => {
      if (!active) return;
      if (response.ok) {
        saveToken(spaceId, response.token);
        setState({
          status: 'ready',
          space: response.space,
          token: response.token,
          sharedWith: response.sharedWith
        });
      } else if (response.reason === 'password-required') {
        clearToken(spaceId);   // 스페이스가 새로 만들어졌다면 옛 토큰은 이제 쓸모없다
        setState({status: 'locked'});
      } else if (response.reason === 'not-found') {
        setState({status: 'missing'});
      } else {
        setState({status: 'error', message: response.error});
      }
    });

    return () => { active = false; };
  }, [passwordRequired, spaceId]);

  if (state.status === 'checking') {
    return <main className="wrap"><div className="empty">스페이스를 확인하는 중…</div></main>;
  }

  if (state.status === 'locked') {
    return (
      <SpaceGate
        spaceId={spaceId}
        onEnter={(space, token, sharedWith) => {
          stripPasswordGateFromUrl();
          setState({status: 'ready', space, token, sharedWith});
        }}
      />
    );
  }

  if (state.status === 'missing') {
    return (
      <main className="wrap">
        <section className="card route-error">
          <h1>없는 스페이스입니다</h1>
          <p className="muted">입장 코드 <code>{spaceId}</code>가 맞는지 확인해주세요. 이미 지워졌을 수도 있습니다.</p>
          <a className="admin-entry" href={createUrl()}>새 스페이스 만들기</a>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="wrap">
        <section className="card route-error">
          <h1>스페이스를 불러오지 못했습니다</h1>
          <p className="form-error">{state.message}</p>
          <p className="small muted">새 schema.sql을 Supabase에 적용하고 spaces 함수를 배포했는지도 확인해주세요.</p>
        </section>
      </main>
    );
  }

  const shareUrl = spaceShareUrl(state.space.id, state.token);
  return screen === 'map'
    ? (
      <MapApp
        space={state.space}
        token={state.token}
        shareUrl={shareUrl}
        withSpaceIds={withSpaceIds}
      />
    )
    : (
      <ParticipantApp
        space={state.space}
        token={state.token}
        shareUrl={shareUrl}
        sharedWith={state.sharedWith}
      />
    );
}

function Screen({route}: {route: Route}) {
  if (route.kind === 'admin') return <AdminApp />;
  if (route.kind === 'create') return <CreateApp />;
  if (route.kind === 'profile') return <ProfileApp />;
  if (route.kind === 'msc') return <MscApp />;
  if (route.kind === 'participant') {
    return (
      <SpaceScreen
        spaceId={route.spaceId}
        screen="participant"
        passwordRequired={route.passwordRequired}
      />
    );
  }
  return <HomeApp />;
}

function App() {
  const route = useRoute();

  // 프로젝터에 띄우는 화면이다. 뒷자리에서 읽히는 게 전부라 헤더도 메뉴도 얹지 않는다.
  if (route.kind === 'map') {
    return <SpaceScreen spaceId={route.spaceId} screen="map" withSpaceIds={route.withSpaceIds} />;
  }

  return (
    <>
      <AppHeader
        spaceId={route.kind === 'participant' ? route.spaceId : ''}
        test={route.kind === 'msc' ? 'msc' : 'disc'}
      />
      <Screen route={route} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
