import {useState} from 'react';
import type {ShareOutcome} from '../lib/share-image.ts';

/**
 * 결과 저장·공유 버튼 한 쌍. 카드 이미지를 만드는 쪽(onShare/onSave)은 검사마다 다르므로
 * 콜백으로 받고, 여기서는 진행 상태와 안내 문구만 관리한다.
 */
export function ShareActions({onShare, onSave}: {
  onShare: () => Promise<ShareOutcome>;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'' | 'share' | 'png'>('');
  const [msg, setMsg] = useState('');

  const share = async () => {
    setBusy('share');
    setMsg('');
    try {
      const outcome = await onShare();
      setMsg(
        outcome === 'copied' ? '결과 요약을 클립보드에 복사했습니다.'
        : outcome === 'downloaded' ? '공유가 안 되어 이미지로 저장했습니다.'
        : outcome === 'shared' ? '공유했습니다.'
        : ''
      );
    } catch {
      setMsg('공유하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('png');
    setMsg('');
    try {
      await onSave();
      setMsg('PNG 이미지로 저장했습니다.');
    } catch {
      setMsg('저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="share-actions">
        <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => void share()}>
          {busy === 'share' ? '준비 중…' : '결과 공유하기'}
        </button>
        <button type="button" className="btn ghost" disabled={busy !== ''} onClick={() => void save()}>
          {busy === 'png' ? '저장 중…' : 'PNG로 저장'}
        </button>
      </div>
      {msg && <p className="small muted center share-actions-msg" role="status">{msg}</p>}
    </>
  );
}
