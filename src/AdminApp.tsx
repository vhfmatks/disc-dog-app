import {useEffect, useMemo, useState} from 'react';
import {adminGroupRequest} from './lib/db.ts';
import type {GroupRow} from './lib/db.ts';
import {groupMapUrl, groupUrl, isGroupId, normalizeGroupId} from './lib/router.ts';

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
        <h1>그룹 관리</h1>
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

interface GroupFormProps {
  onCreate: (values: {id: string; name: string}) => Promise<boolean>;
  busy: boolean;
}

function GroupForm({onCreate, busy}: GroupFormProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const valid = isGroupId(id) && name.trim().length > 0;

  return (
    <form className="card admin-create" onSubmit={async event => {
      event.preventDefault();
      if (!valid) return;
      const ok = await onCreate({id, name: name.trim()});
      if (ok) {
        setId('');
        setName('');
      }
    }}>
      <div>
        <p className="eyebrow">NEW GROUP</p>
        <h2>그룹 추가</h2>
      </div>
      <div className="admin-fields">
        <div className="field">
          <label htmlFor="group-id">Group ID</label>
          <input
            id="group-id"
            className="input"
            minLength={3}
            maxLength={24}
            pattern="[a-z0-9-]{3,24}"
            placeholder="예: design-team"
            value={id}
            onChange={event => setId(normalizeGroupId(event.target.value))}
          />
          <p className="small muted">영문 소문자·숫자·하이픈, 3–24자</p>
        </div>
        <div className="field">
          <label htmlFor="group-name">표시 이름</label>
          <input
            id="group-name"
            className="input"
            maxLength={50}
            placeholder="예: 디자인팀 7월 워크숍"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>
      </div>
      <button className="btn" type="submit" disabled={busy || !valid}>그룹 추가</button>
    </form>
  );
}

interface GroupItemProps {
  group: GroupRow;
  busy: boolean;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onDelete: (group: GroupRow) => void;
}

function GroupItem({group, busy, onUpdate, onDelete}: GroupItemProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const participantHref = useMemo(() => groupUrl(group.id), [group.id]);
  const mapHref = useMemo(() => groupMapUrl(group.id), [group.id]);

  useEffect(() => setName(group.name), [group.name]);

  return (
    <article className="card admin-group">
      <div className="admin-group-main">
        <div>
          <code>/{group.id}</code>
          {editing ? (
            <form className="admin-edit" onSubmit={async event => {
              event.preventDefault();
              if (!name.trim()) return;
              const ok = await onUpdate(group.id, name.trim());
              if (ok) setEditing(false);
            }}>
              <input
                className="input"
                maxLength={50}
                aria-label="그룹 표시 이름"
                value={name}
                onChange={event => setName(event.target.value)}
                autoFocus
              />
              <button className="btn" type="submit" disabled={busy || !name.trim()}>저장</button>
              <button className="btn ghost" type="button" onClick={() => {
                setName(group.name);
                setEditing(false);
              }}>취소</button>
            </form>
          ) : <h3>{group.name}</h3>}
          <p className="small muted">{new Date(group.created_at).toLocaleString('ko-KR')} 생성</p>
        </div>
        {!editing && (
          <div className="admin-actions">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditing(true)}>이름 수정</button>
            <button className="btn danger" type="button" disabled={busy} onClick={() => onDelete(group)}>삭제</button>
          </div>
        )}
      </div>
      <div className="admin-links">
        <a href={participantHref} target="_blank" rel="noreferrer">참가자 화면 ↗</a>
        <a href={mapHref} target="_blank" rel="noreferrer">그룹 결과 ↗</a>
        <button type="button" onClick={() => navigator.clipboard?.writeText(participantHref)}>참가 링크 복사</button>
      </div>
    </article>
  );
}

export function AdminApp() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(SESSION_KEY) || '');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(Boolean(password));
  const [error, setError] = useState('');

  const request = async (
    action: AdminAction,
    values: {id?: string; name?: string} = {},
    candidate = password
  ): Promise<boolean> => {
    setBusy(true);
    setError('');
    const response = await adminGroupRequest(action, candidate, values);
    setBusy(false);
    if (!response.ok) {
      setError(response.error);
      return false;
    }
    setGroups(response.groups);
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
          <h1>그룹 관리</h1>
          <p className="muted">그룹마다 참가 링크와 결과 화면이 완전히 분리됩니다.</p>
        </div>
        <button className="btn ghost" type="button" onClick={() => {
          sessionStorage.removeItem(SESSION_KEY);
          setPassword('');
          setAuthenticated(false);
          setGroups([]);
        }}>로그아웃</button>
      </header>

      <GroupForm busy={busy} onCreate={values => request('create', values)} />
      {error && <p className="form-error admin-error" role="alert">{error}</p>}

      <section className="admin-list" aria-busy={busy}>
        <div className="admin-list-head">
          <h2>등록된 그룹</h2>
          <span>{groups.length}개</span>
        </div>
        {groups.length === 0 && !busy && <div className="empty card">아직 등록된 그룹이 없습니다.</div>}
        {groups.map(group => (
          <GroupItem
            group={group}
            busy={busy}
            onUpdate={(id, name) => request('update', {id, name})}
            onDelete={async target => {
              const confirmed = window.confirm(`“${target.name}” 그룹과 이 그룹의 모든 결과를 삭제할까요?`);
              if (confirmed) await request('delete', {id: target.id});
            }}
            key={group.id}
          />
        ))}
      </section>
    </main>
  );
}
