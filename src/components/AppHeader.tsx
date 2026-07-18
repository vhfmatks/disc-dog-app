import {useEffect, useRef, useState} from 'react';
import {
  createUrl, homeUrl, isSpaceId, mscUrl, normalizeSpaceId, profileUrl, spaceMapUrl,
  spacePasswordUrl, spaceUrl
} from '../lib/router.ts';

interface MenuItem {
  href: string;
  label: string;
  note?: string;
}

interface TestOption {
  id: 'disc' | 'msc';
  emoji: string;
  name: string;
  href: string;
}

/**
 * 참가자는 설문 중이고 진행자는 프로젝터를 띄워둔 상태다. 그래서 헤더는 검사 스위처
 * 하나와 접힌 메뉴 하나로 끝낸다 — 설문 화면에 상시 노출되는 링크가 많을수록 이탈이 는다.
 * 프로젝터 화면(/{spaceId}/map)에는 아예 붙이지 않는다 (main.tsx).
 *
 * 좌상단 제목은 곧 검사 스위처다. 누르면 검사(개성 / 뇌인지 행동유형맵)를 갈아탈 수 있다.
 */
export function AppHeader({spaceId = '', test = 'disc'}: {spaceId?: string; test?: 'disc' | 'msc'}) {
  const [open, setOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [entryCode, setEntryCode] = useState('');
  const headerRef = useRef<HTMLElement>(null);
  const validEntryCode = isSpaceId(entryCode);

  useEffect(() => {
    if (!open && !switchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); setSwitchOpen(false); }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) { setOpen(false); setSwitchOpen(false); }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, switchOpen]);

  const tests: TestOption[] = [
    {id: 'disc', emoji: '🐶', name: '개성', href: homeUrl()},
    {id: 'msc', emoji: '🧠', name: '뇌인지 행동유형맵', href: mscUrl()}
  ];
  const current = tests.find(item => item.id === test) || tests[0];

  // 지금 스페이스 안에 있다면 그 스페이스의 두 화면을 맨 위에 둔다. 세미나 중에 제일 자주 쓴다.
  const spaceItems: MenuItem[] = spaceId
    ? [
        {href: spaceUrl(spaceId), label: '설문 화면', note: spaceId},
        {href: spaceMapUrl(spaceId), label: '관계도 보기'}
      ]
    : [];

  const items: MenuItem[] = [
    {href: homeUrl(), label: '홈'},
    {href: createUrl(), label: '새 스페이스 만들기'},
    {href: profileUrl(), label: '프로필'}
  ];

  return (
    <header className="app-header" ref={headerRef}>
      <div className="app-header-inner">
        <div className="app-header-switch">
          <button
            type="button"
            className="app-header-title"
            aria-haspopup="menu"
            aria-expanded={switchOpen}
            onClick={() => { setSwitchOpen(value => !value); setOpen(false); }}
          >
            <span aria-hidden="true">{current.emoji}</span> {current.name}
            <span className={`switch-caret ${switchOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
          </button>

          {switchOpen && (
            <div className="app-switch-menu" role="menu" aria-label="검사 선택">
              <p className="app-switch-head">검사 선택</p>
              {tests.map(item => (
                <a
                  key={item.id}
                  className={`app-switch-item ${item.id === test ? 'on' : ''}`}
                  href={item.href}
                  role="menuitem"
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  <span>{item.name}</span>
                  {item.id === test && <span className="app-switch-check" aria-hidden="true">✓</span>}
                </a>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="app-header-toggle"
          aria-label="메뉴"
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => { setOpen(current => !current); setSwitchOpen(false); }}
        >
          <span className={`bars ${open ? 'open' : ''}`} aria-hidden="true">
            <i /><i /><i />
          </span>
        </button>

        <nav id="app-menu" className="app-menu" hidden={!open} aria-label="주요 메뉴">
          {spaceItems.length > 0 && (
            <>
              <p className="app-menu-head">이 스페이스</p>
              {spaceItems.map(item => <MenuLink item={item} key={item.href} />)}
              <hr className="app-menu-rule" />
            </>
          )}
          <form className="app-menu-entry" onSubmit={event => {
            event.preventDefault();
            if (validEntryCode) window.location.assign(spacePasswordUrl(entryCode));
          }}>
            <label htmlFor="menu-space-code">입장 코드</label>
            <div>
              <input
                id="menu-space-code"
                className="input"
                placeholder="예: hazel-corgi-427"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                value={entryCode}
                onChange={event => setEntryCode(normalizeSpaceId(event.target.value))}
              />
              <button type="submit" disabled={!validEntryCode}>입장</button>
            </div>
          </form>
          <hr className="app-menu-rule" />
          {items.map(item => <MenuLink item={item} key={item.href} />)}
        </nav>
      </div>
    </header>
  );
}

function MenuLink({item}: {item: MenuItem}) {
  return (
    <a className="app-menu-link" href={item.href}>
      <span>{item.label}</span>
      {item.note && <span className="small muted">{item.note}</span>}
    </a>
  );
}
