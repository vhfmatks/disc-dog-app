import {useEffect, useState} from 'react';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * 클립보드는 권한·비보안 컨텍스트·구형 브라우저에서 조용히 실패한다. 그래서 실패를
 * 눈에 보이게 알리고, 이 버튼을 쓰는 화면은 링크 원문도 함께 보여준다 (share-box).
 */
export function CopyButton({value, label = '링크 복사', className = 'btn ghost'}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState('copied');
        } catch {
          setState('failed');
        }
      }}
    >
      {state === 'copied' ? '복사됨 ✓' : state === 'failed' ? '직접 복사해주세요' : label}
    </button>
  );
}
