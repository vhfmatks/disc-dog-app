import {useCallback, useEffect, useRef, useState} from 'react';
import {checkSpaceName} from '../lib/db.ts';
import {validateSpaceName} from '../lib/space-rules.ts';

export type SpaceNameCheckState = {
  status: 'idle' | 'waiting' | 'checking' | 'available' | 'duplicate' | 'invalid' | 'error';
  candidate: string;
  code?: string;
  message?: string;
};

const INITIAL_STATE: SpaceNameCheckState = {status: 'idle', candidate: ''};
const DEBOUNCE_MS = 450;

export function useSpaceNameCheck(name: string) {
  const [state, setState] = useState<SpaceNameCheckState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const nameRef = useRef(name);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const inFlightRef = useRef<{candidate: string; promise: Promise<boolean>} | null>(null);
  nameRef.current = name;

  const publish = useCallback((next: SpaceNameCheckState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const run = useCallback((candidate: string): Promise<boolean> => {
    // 이전 렌더가 들고 있던 callback은 현재 입력값의 상태를 덮어쓸 수 없다.
    if (nameRef.current.trim() !== candidate) return Promise.resolve(false);
    const current = inFlightRef.current;
    if (current?.candidate === candidate) return current.promise;

    const requestId = ++requestRef.current;
    publish({status: 'checking', candidate});
    const promise = checkSpaceName(candidate).then(response => {
      if (requestRef.current !== requestId || nameRef.current.trim() !== candidate) return false;
      if (!response.ok) {
        publish({status: 'error', candidate, code: response.code, message: response.error});
        return false;
      }
      if (!response.available) {
        publish({
          status: 'duplicate',
          candidate,
          code: response.code || 'SPACE_NAME_DUPLICATE',
          message: response.error || '이미 사용 중인 스페이스 이름입니다.'
        });
        return false;
      }
      publish({status: 'available', candidate});
      return true;
    }).finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    });
    inFlightRef.current = {candidate, promise};
    return promise;
  }, [publish]);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    requestRef.current += 1;
    inFlightRef.current = null;
    const candidate = name.trim();
    const issue = validateSpaceName(name);

    if (!candidate) {
      publish(INITIAL_STATE);
      return;
    }
    if (issue) {
      publish({status: 'invalid', candidate, code: issue.code, message: issue.message});
      return;
    }

    publish({status: 'waiting', candidate});
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run(candidate);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [name, publish, run]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    requestRef.current += 1;
  }, []);

  const checkNow = useCallback((force = false) => {
    const candidate = name.trim();
    // submit 중 만들어진 오래된 closure가 새 입력의 debounce timer를 지우지 않게 한다.
    if (nameRef.current.trim() !== candidate) return Promise.resolve(false);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const issue = validateSpaceName(name);
    if (issue) {
      publish({status: candidate ? 'invalid' : 'idle', candidate, code: issue.code, message: issue.message});
      return Promise.resolve(false);
    }

    const current = stateRef.current;
    if (!force && current.candidate === candidate && current.status === 'available') return Promise.resolve(true);
    if (!force && current.candidate === candidate && current.status === 'duplicate') return Promise.resolve(false);
    if (force) inFlightRef.current = null;
    return run(candidate);
  }, [name, publish, run]);

  return {state, checkNow};
}
