import {useCallback, useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent} from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** 이 픽셀보다 많이 움직였으면 클릭이 아니라 드래그로 본다. */
const DRAG_SLOP = 4;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface Pan {
  x: number;
  y: number;
}

/**
 * 지도를 확대하고 드래그로 훑어보게 한다.
 * 확대 배율은 CSS transform으로 얹으므로 SVG 내부 좌표 계산은 그대로 둔다.
 *
 * 확대하는 길은 두 손가락 핀치(폰)와 트랙패드 핀치(ctrl+휠)다.
 */
export function useMapZoom() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({x: 0, y: 0});
  const dragRef = useRef<{x: number; y: number; pan: Pan} | null>(null);
  // 드래그로 끝난 제스처가 노드 선택으로 새지 않게 막는 표식.
  const movedRef = useRef(false);
  // 포인터 캡처는 드래그가 확정된 뒤에만 건다. pointerdown에서 미리 잡으면
  // 클릭 이벤트까지 뷰포트로 재타겟되어 확대 중에는 노드를 못 고르게 된다.
  const capturedRef = useRef(false);
  // 지금 지도에 닿아 있는 손가락들. 둘이 되는 순간 핀치로 갈아탄다.
  const pointersRef = useRef(new Map<number, Pan>());
  const pinchRef = useRef<{spread: number; zoom: number} | null>(null);
  // 휠 리스너는 렌더 밖에 붙어 있어 최신 배율을 ref로 봐야 한다.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // 확대된 그림의 가장자리가 뷰포트 안으로 들어오지 않도록 이동 범위를 묶는다.
  const clampPan = useCallback((next: Pan, atZoom: number): Pan => {
    const box = viewportRef.current?.getBoundingClientRect();
    if (!box) return next;
    const maxX = (box.width * (atZoom - 1)) / 2;
    const maxY = (box.height * (atZoom - 1)) / 2;
    return {x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY)};
  }, []);

  const zoomTo = useCallback((next: number) => {
    const atZoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(atZoom);
    setPan(current => (atZoom === MIN_ZOOM ? {x: 0, y: 0} : clampPan(current, atZoom)));
  }, [clampPan]);

  /** 두 손가락 사이 거리. 핀치는 이 값의 비율로만 판단한다. */
  const spreadOf = (pointers: Map<number, Pan>) => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // 트랙패드 핀치는 ctrl+휠로 온다. React의 onWheel은 passive로 붙어 preventDefault가
  // 먹지 않는다 — 그대로 두면 브라우저가 페이지 전체를 확대해버려서, 프로젝터에 띄운
  // 화면이 통째로 커진다. 그래서 직접 non-passive로 붙인다.
  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;   // 평범한 스크롤은 페이지에 양보한다
      event.preventDefault();
      // exp는 언제나 양수라 휠이 크게 튀어도 배율이 뒤집히지 않는다.
      zoomTo(zoomRef.current * Math.exp(-event.deltaY / 100));
    };

    box.addEventListener('wheel', onWheel, {passive: false});
    return () => box.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});

    // 두 번째 손가락이 닿는 순간 끌던 것을 놓고 핀치로 갈아탄다.
    if (pointers.size === 2) {
      dragRef.current = null;
      pinchRef.current = {spread: spreadOf(pointers), zoom: zoomRef.current};
      return;
    }

    movedRef.current = false;
    if (zoom === MIN_ZOOM || event.button !== 0) return;
    dragRef.current = {x: event.clientX, y: event.clientY, pan};
  }, [pan, zoom]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});

    const pinch = pinchRef.current;
    if (pinch) {
      if (pointers.size < 2 || pinch.spread <= 0) return;
      // 핀치는 언제나 제스처다. 손을 떼는 순간 노드가 선택되지 않게 표식을 남긴다.
      movedRef.current = true;
      zoomTo(pinch.zoom * (spreadOf(pointers) / pinch.spread));
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // 손이 조금 떨린 정도면 아직 클릭이다. 슬롭을 넘긴 순간부터 드래그로 넘긴다.
    if (!movedRef.current) {
      if (Math.hypot(dx, dy) <= DRAG_SLOP) return;
      movedRef.current = true;
      capturedRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setPan(clampPan({x: drag.pan.x + dx, y: drag.pan.y + dy}, zoom));
  }, [clampPan, zoom, zoomTo]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    // 손가락이 하나 남으면 핀치는 끝난다. 남은 손가락이 곧바로 지도를 끌지는
    // 않는다 — 다시 누를 때까지 기다린다. 핀치 끝의 손 떨림이 지도를 튀게 하는 것보다 낫다.
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (!dragRef.current) return;
    dragRef.current = null;
    if (capturedRef.current) {
      capturedRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!movedRef.current) return;
    event.stopPropagation();
    movedRef.current = false;
  }, []);

  return {
    viewportRef,
    zoom,
    pan,
    viewportProps: {onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture}
  };
}
