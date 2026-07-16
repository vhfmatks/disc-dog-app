import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AdminApp} from './AdminApp.tsx';
import {MapApp} from './MapApp.tsx';
import {ParticipantApp} from './ParticipantApp.tsx';
import {fetchGroup, type GroupRow} from './lib/db.ts';
import {adminUrl, groupUrl, isGroupId, normalizeGroupId, useRoute} from './lib/router.ts';
import '../assets/style.css';

// GitHub Pages의 404.html이 전달한 원래 clean URL을 복원한다.
const redirectedPath = new URLSearchParams(window.location.search).get('__spa');
if (redirectedPath?.startsWith('/')) window.history.replaceState(null, '', redirectedPath);

function HomeApp() {
  const [groupId, setGroupId] = useState('');
  const valid = isGroupId(groupId);

  return (
    <main className="wrap home-wrap">
      <section className="card">
        <p className="eyebrow">DOG TYPE WORKSHOP</p>
        <h1>그룹 링크로 접속해주세요</h1>
        <p className="muted admin-lead">전달받은 Group ID가 있다면 아래에 입력할 수도 있습니다.</p>
        <form onSubmit={event => {
          event.preventDefault();
          if (valid) window.location.assign(groupUrl(groupId));
        }}>
          <div className="field">
            <label htmlFor="home-group-id">Group ID</label>
            <input
              id="home-group-id"
              className="input"
              placeholder="예: design-team"
              value={groupId}
              onChange={event => setGroupId(normalizeGroupId(event.target.value))}
            />
          </div>
          <button className="btn block" type="submit" disabled={!valid}>그룹으로 들어가기</button>
        </form>
        <a className="admin-entry" href={adminUrl()}>관리자 페이지</a>
      </section>
    </main>
  );
}

function GroupScreen({groupId, screen}: {groupId: string; screen: 'participant' | 'map'}) {
  const [state, setState] = useState<
    | {status: 'loading'}
    | {status: 'ready'; group: GroupRow}
    | {status: 'missing'}
    | {status: 'error'; message: string}
  >({status: 'loading'});

  useEffect(() => {
    let active = true;
    setState({status: 'loading'});
    fetchGroup(groupId).then(response => {
      if (!active) return;
      if (!response.ok) setState({status: 'error', message: response.error});
      else if (!response.group) setState({status: 'missing'});
      else setState({status: 'ready', group: response.group});
    });
    return () => { active = false; };
  }, [groupId]);

  if (state.status === 'loading') return <main className="wrap"><div className="empty">그룹을 확인하는 중…</div></main>;
  if (state.status === 'missing') {
    return (
      <main className="wrap">
        <section className="card route-error">
          <h1>없는 그룹입니다</h1>
          <p className="muted">Group ID <code>{groupId}</code>가 맞는지 관리자에게 확인해주세요.</p>
        </section>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="wrap">
        <section className="card route-error">
          <h1>그룹을 불러오지 못했습니다</h1>
          <p className="form-error">{state.message}</p>
          <p className="small muted">새 schema.sql을 Supabase에 적용했는지도 확인해주세요.</p>
        </section>
      </main>
    );
  }
  return screen === 'map' ? <MapApp group={state.group} /> : <ParticipantApp group={state.group} />;
}

function App() {
  const route = useRoute();
  if (route.kind === 'admin') return <AdminApp />;
  if (route.kind === 'participant') return <GroupScreen groupId={route.groupId} screen="participant" />;
  if (route.kind === 'map') return <GroupScreen groupId={route.groupId} screen="map" />;
  return <HomeApp />;
}

createRoot(document.getElementById('root')!).render(<App />);
