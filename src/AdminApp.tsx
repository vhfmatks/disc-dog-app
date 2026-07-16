import {useEffect, useMemo, useRef, useState} from 'react';
import {TYPES} from '../assets/data.ts';
import {CopyButton} from './components/CopyButton.tsx';
import {SpaceNameStatus, ValidationStatus} from './components/FieldStatus.tsx';
import {useSpaceNameCheck} from './hooks/useSpaceNameCheck.ts';
import {SPACE_NAME_MAX, adminSpaceRequest, adminSpaceResults} from './lib/db.ts';
import type {AdminResultsResponse, AdminSpaceRow, ResultRow} from './lib/db.ts';
import {isSpaceId, normalizeSpaceId, spaceMapShareUrl, spaceShareUrl} from './lib/router.ts';
import {validateSpacePassword} from './lib/space-rules.ts';

const SESSION_KEY = 'dogtype:admin-password';

type AdminAction = 'list' | 'create' | 'update' | 'delete';

interface LoginProps {
  onLogin: (password: string) => void;
  busy: boolean;
  error: string;
}

function Login({onLogin, busy, error}: LoginProps) {
  const [password, setPassword] = useState('');

  return (
    <main className="wrap admin-login">
      <section className="card">
        <p className="eyebrow">ADMIN</p>
        <h1>스페이스 관리</h1>
        <p className="muted admin-lead">관리자 비밀번호를 입력하세요.</p>
        <form onSubmit={event => {
          event.preventDefault();
          if (password) onLogin(password);
        }}>
          <div className="field">
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input
              id="admin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn block" type="submit" disabled={busy || !password}>
            {busy ? '확인 중…' : '관리자 페이지 들어가기'}
          </button>
        </form>
      </section>
    </main>
  );
}

interface SpaceFormProps {
  onCreate: (values: {id: string; name: string; spacePassword: string}) => Promise<boolean>;
  busy: boolean;
}

/**
 * 스페이스는 이제 /new에서 누구나 만든다. 여기 폼은 코드를 직접 정해야 할 때
 * (세미나용 고정 링크 등) 쓰는 관리자용 우회로다.
 */
function SpaceForm({onCreate, busy}: SpaceFormProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [spacePassword, setSpacePassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const {state: nameCheck, checkNow: checkNameNow} = useSpaceNameCheck(name);
  const passwordIssue = spacePassword ? validateSpacePassword(spacePassword, true) : null;
  const nameReady = (nameCheck.status === 'available' || nameCheck.status === 'error')
    && nameCheck.candidate === name.trim();
  const valid = isSpaceId(id) && nameReady && !passwordIssue;
  const locked = busy || submitting;

  return (
    <form className="card admin-create" onSubmit={async event => {
      event.preventDefault();
      if (!valid || locked) return;
      setSubmitting(true);
      const submitted = {id, name: name.trim(), spacePassword};
      try {
        if (nameCheck.status !== 'error' && !await checkNameNow()) return;
        const ok = await onCreate(submitted);
        if (ok) {
          setId('');
          setName('');
          setSpacePassword('');
        } else void checkNameNow(true);
      } finally {
        setSubmitting(false);
      }
    }}>
      <div>
        <p className="eyebrow">NEW SPACE</p>
        <h2>코드를 직접 정해서 만들기</h2>
      </div>
      <div className="admin-fields">
        <div className="field">
          <label htmlFor="space-id">입장 코드</label>
          <input
            id="space-id"
            className="input"
            minLength={3}
            maxLength={24}
            pattern="[a-z0-9-]{3,24}"
            placeholder="예: design-team"
            value={id}
            disabled={locked}
            onChange={event => setId(normalizeSpaceId(event.target.value))}
          />
          <p className="small muted">영문 소문자·숫자·하이픈, 3–24자</p>
        </div>
        <div className="field">
          <label htmlFor="space-name">표시 이름</label>
          <input
            id="space-name"
            className="input"
            maxLength={SPACE_NAME_MAX}
            placeholder="예: 디자인팀 7월 워크숍"
            value={name}
            disabled={locked}
            aria-describedby="admin-space-name-status"
            aria-invalid={nameCheck.status === 'duplicate' || nameCheck.status === 'invalid'}
            onChange={event => setName(event.target.value)}
            onBlur={() => void checkNameNow()}
          />
          <SpaceNameStatus
            id="admin-space-name-status"
            state={nameCheck}
            hint="입력을 멈추면 같은 이름이 있는지 확인합니다."
          />
        </div>
        <div className="field">
          <label htmlFor="space-pass">비밀번호</label>
          <input
            id="space-pass"
            className="input"
            type="password"
            autoComplete="new-password"
            placeholder="비우면 공개"
            value={spacePassword}
            disabled={locked}
            aria-describedby="admin-space-password-status"
            aria-invalid={Boolean(passwordIssue)}
            onChange={event => setSpacePassword(event.target.value)}
          />
          <ValidationStatus
            id="admin-space-password-status"
            issue={passwordIssue}
            hint="비우면 코드만 알면 누구나 입장"
            success={spacePassword && !passwordIssue ? '사용할 수 있는 비밀번호입니다.' : undefined}
          />
        </div>
      </div>
      <button className="btn" type="submit" disabled={locked || !valid}>
        {locked ? '추가 중…' : '스페이스 추가'}
      </button>
    </form>
  );
}

type DataState =
  | {status: 'closed'}
  | {status: 'loading'}
  | {status: 'ready'; rows: ResultRow[]}
  | {status: 'error'; message: string};

/** 이 스페이스에 제출된 결과 전부. 지도(/map)를 열지 않고 숫자 그대로 보고 싶을 때 쓴다. */
function ParticipantData({spaceId, onLoad}: {spaceId: string; onLoad: () => Promise<AdminResultsResponse>}) {
  const [state, setState] = useState<DataState>({status: 'closed'});
  // 늦게 온 응답이 이미 접은 패널을 혼자 다시 펴지 않도록 세대를 센다.
  const generation = useRef(0);

  const load = async () => {
    const mine = ++generation.current;
    setState({status: 'loading'});
    const response = await onLoad();
    if (generation.current !== mine) return;
    setState(response.ok
      ? {status: 'ready', rows: response.rows}
      : {status: 'error', message: `[${response.code}] ${response.error}`}
    );
  };

  const close = () => {
    generation.current += 1;
    setState({status: 'closed'});
  };

  // 스페이스를 지웠다 다시 만들면 같은 코드로 다른 데이터가 온다. 접어서 초기화한다.
  useEffect(close, [spaceId]);

  const open = state.status !== 'closed';

  return (
    <section className="admin-data">
      <button
        type="button"
        className="admin-data-toggle"
        aria-expanded={open}
        onClick={() => (open ? close() : void load())}
      >
        <span className={`chips-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
        참가자 데이터
      </button>

      {state.status === 'loading' && <p className="small muted">불러오는 중…</p>}
      {state.status === 'error' && <p className="form-error" role="alert">{state.message}</p>}
      {state.status === 'ready' && state.rows.length === 0 && (
        <p className="small muted">아직 아무도 제출하지 않았습니다.</p>
      )}
      {state.status === 'ready' && state.rows.length > 0 && (
        <>
          <div className="admin-data-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">유형</th>
                  <th scope="col">코드</th>
                  <th scope="col">매력</th>
                  <th scope="col">짖음</th>
                  <th scope="col">제출 시각</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.nickname}</td>
                    <td>
                      <span className="admin-data-dot" style={{background: TYPES[row.primary_type].hex}} aria-hidden="true" />
                      {TYPES[row.primary_type].name}
                    </td>
                    <td><code>{row.code}</code></td>
                    <td className="num">{row.charm}</td>
                    <td className="num">{row.bark}</td>
                    <td className="small muted">{new Date(row.created_at).toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn ghost admin-data-refresh" onClick={() => void load()}>
            새로고침
          </button>
        </>
      )}
    </section>
  );
}

interface SpaceItemProps {
  space: AdminSpaceRow;
  busy: boolean;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onDelete: (space: AdminSpaceRow) => void;
  onLoadResults: (id: string) => Promise<AdminResultsResponse>;
}

function SpaceItem({space, busy, onUpdate, onDelete, onLoadResults}: SpaceItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(space.name);
  // 관리자는 스페이스 비밀번호를 모른다. 출입증을 실은 링크로 열어야 게이트를 지난다.
  const shareHref = useMemo(() => spaceShareUrl(space.id, space.share_token), [space.id, space.share_token]);
  const mapHref = useMemo(() => spaceMapShareUrl(space.id, space.share_token), [space.id, space.share_token]);

  useEffect(() => setName(space.name), [space.name]);

  return (
    <article className="card admin-group">
      <div className="admin-group-main">
        <div>
          <code>/{space.id}</code>
          {space.has_password
            ? <span className="tag locked">비밀번호 잠김</span>
            : <span className="tag open">공개</span>}
          {/* 함수를 아직 새로 배포하지 않았다면 이 값이 아예 없다. null(못 셈)과 똑같이 감춘다. */}
          {typeof space.result_count === 'number' && (
            <span className="tag count">참가자 {space.result_count}명</span>
          )}
          {editing ? (
            <form className="admin-edit" onSubmit={async event => {
              event.preventDefault();
              if (!name.trim()) return;
              const ok = await onUpdate(space.id, name.trim());
              if (ok) setEditing(false);
            }}>
              <input
                className="input"
                maxLength={SPACE_NAME_MAX}
                aria-label="스페이스 표시 이름"
                value={name}
                onChange={event => setName(event.target.value)}
                autoFocus
              />
              <button className="btn" type="submit" disabled={busy || !name.trim()}>저장</button>
              <button className="btn ghost" type="button" onClick={() => {
                setName(space.name);
                setEditing(false);
              }}>취소</button>
            </form>
          ) : <h3>{space.name}</h3>}
          <p className="small muted">{new Date(space.created_at).toLocaleString('ko-KR')} 생성</p>
        </div>
        {!editing && (
          <div className="admin-actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditing(true)}>이름 수정</button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => onDelete(space)}>삭제</button>
          </div>
        )}
      </div>
      <div className="admin-links">
        <a href={shareHref} target="_blank" rel="noreferrer">참가자 화면 ↗</a>
        <a href={mapHref} target="_blank" rel="noreferrer">진행자 화면 ↗</a>
        <CopyButton value={shareHref} label="초대 링크 복사" className="" />
      </div>
      <ParticipantData spaceId={space.id} onLoad={() => onLoadResults(space.id)} />
    </article>
  );
}

export function AdminApp() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || '');
  const [spaces, setSpaces] = useState<AdminSpaceRow[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(Boolean(password));
  const [error, setError] = useState('');

  const request = async (
    action: AdminAction,
    values: {id?: string; name?: string; spacePassword?: string} = {},
    candidate = password
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    const response = await adminSpaceRequest(action, candidate, values);
    setBusy(false);
    if (!response.ok) {
      setError(`[${response.code}] ${response.error}`);
      return false;
    }
    setSpaces(response.spaces);
    return true;
  };

  const login = async (candidate: string) => {
    const ok = await request('list', {}, candidate);
    if (!ok) {
      sessionStorage.removeItem(SESSION_KEY);
      setAuthenticated(false);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, candidate);
    setPassword(candidate);
    setAuthenticated(true);
  };

  useEffect(() => {
    if (password) login(password);
    else setBusy(false);
    // 저장된 비밀번호는 첫 렌더에서 한 번만 확인한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authenticated) return <Login onLogin={login} busy={busy} error={error} />;

  return (
    <main className="admin-wrap">
      <header className="admin-header">
        <div>
          <p className="eyebrow">ADMIN</p>
          <h1>스페이스 관리</h1>
          <p className="muted">
            모든 스페이스를 스페이스 비밀번호 없이 열어볼 수 있습니다 —
            화면 링크에 출입증이 실려 있습니다.
          </p>
        </div>
        <button className="btn ghost" type="button" onClick={() => {
          sessionStorage.removeItem(SESSION_KEY);
          setPassword('');
          setAuthenticated(false);
          setSpaces([]);
        }}>로그아웃</button>
      </header>

      <SpaceForm busy={busy} onCreate={values => request('create', values)} />
      {error && <p className="form-error admin-error" role="alert">{error}</p>}

      <section className="admin-list" aria-busy={busy}>
        <div className="admin-list-head">
          <h2>등록된 스페이스</h2>
          <span>{spaces.length}개</span>
        </div>
        {spaces.length === 0 && !busy && <div className="empty card">아직 등록된 스페이스가 없습니다.</div>}
        {spaces.map(space => (
          <SpaceItem
            space={space}
            busy={busy}
            onUpdate={(id, name) => request('update', {id, name})}
            onDelete={async target => {
              const confirmed = window.confirm(`“${target.name}” 스페이스와 이 스페이스의 모든 결과를 삭제할까요?`);
              if (confirmed) await request('delete', {id: target.id});
            }}
            onLoadResults={id => adminSpaceResults(password, id)}
            key={space.id}
          />
        ))}
      </section>
    </main>
  );
}
