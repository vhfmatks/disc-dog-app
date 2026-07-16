import type {SpaceNameCheckState} from '../hooks/useSpaceNameCheck.ts';
import type {ValidationIssue} from '../lib/space-rules.ts';

interface SpaceNameStatusProps {
  id: string;
  state: SpaceNameCheckState;
  hint: string;
}

export function SpaceNameStatus({id, state, hint}: SpaceNameStatusProps) {
  if (state.status === 'idle') return <p className="field-status muted" id={id}>{hint}</p>;
  if (state.status === 'waiting' || state.status === 'checking') {
    return <p className="field-status checking" id={id} aria-live="polite">이름 중복 확인 중…</p>;
  }
  if (state.status === 'available') {
    return <p className="field-status ok" id={id} aria-live="polite">사용할 수 있는 이름입니다.</p>;
  }
  const isCheckError = state.status === 'error';
  return (
    <p className={`field-status ${isCheckError ? 'warning' : 'error'}`} id={id} role="status">
      {state.code && <code className="error-code">{state.code}</code>}
      {state.message}
    </p>
  );
}

interface ValidationStatusProps {
  id: string;
  issue: ValidationIssue | null;
  hint: string;
  success?: string;
}

export function ValidationStatus({id, issue, hint, success}: ValidationStatusProps) {
  if (issue) {
    return (
      <p className="field-status error" id={id} role="status">
        <code className="error-code">{issue.code}</code>
        {issue.message}
      </p>
    );
  }
  return <p className={`field-status ${success ? 'ok' : 'muted'}`} id={id}>{success || hint}</p>;
}
