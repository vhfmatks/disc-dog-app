import {useCallback, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent} from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const STEP = 0.5;
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

  const zoomIn = useCallback(() => zoomTo(zoom + STEP), [zoom, zoomTo]);
  const zoomOut = useCallback(() => zoomTo(zoom - STEP), [zoom, zoomTo]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    movedRef.current = false;
    if (zoom === MIN_ZOOM || event.button !== 0) return;
    dragRef.current = {x: event.clientX, y: event.clientY, pan};
  }, [pan, zoom]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [clampPan, zoom]);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    zoomIn,
    zoomOut,
    viewportProps: {onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture}
  };
}
