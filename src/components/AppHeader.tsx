import {useEffect, useRef, useState} from 'react';
import {adminUrl, createUrl, homeUrl, profileUrl, spaceMapUrl, spaceUrl} from '../lib/router.ts';

interface MenuItem {
  href: string;
  label: string;
  note?: string;
}

/**
 * 참가자는 설문 중이고 진행자는 프로젝터를 띄워둔 상태다. 그래서 헤더는 이름표 하나와
 * 접힌 메뉴 하나로 끝낸다 — 설문 화면에 상시 노출되는 링크가 많을수록 이탈이 는다.
 * 프로젝터 화면(/{spaceId}/map)에는 아예 붙이지 않는다 (main.tsx).
 */
export function AppHeader({spaceId = ''}: {spaceId?: string}) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  // 지금 스페이스 안에 있다면 그 스페이스의 두 화면을 맨 위에 둔다. 세미나 중에 제일 자주 쓴다.
  const spaceItems: MenuItem[] = spaceId
    ? [
        {href: spaceUrl(spaceId), label: '설문 화면', note: spaceId},
        {href: spaceMapUrl(spaceId), label: '관계도 보기', note: '앞 화면과 같은 지도'}
      ]
    : [];

  const items: MenuItem[] = [
    {href: homeUrl(), label: '홈'},
    {href: createUrl(), label: '새 스페이스 만들기'},
    {href: profileUrl(), label: '프로필', note: '내 응답 · 이어하기'},
    {href: adminUrl(), label: '관리자', note: '운영용'}
  ];

  return (
    <header className="app-header" ref={headerRef}>
      <div className="app-header-inner">
        <a className="app-header-title" href={homeUrl()}>
          <span aria-hidden="true">🐶</span> 강아지 유형
        </a>

        <button
          type="button"
          className="app-header-toggle"
          aria-label="메뉴"
          aria-expanded={open}
          aria-controls="app-menu"
          onClick={() => setOpen(current => !current)}
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
