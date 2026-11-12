import { Orb } from './agent/Orb';
import { IconRepeat } from './Icons';

/** The splash while the page signs in as the agent's account by itself. */
export function BootSplash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Orb tone="calm" size="xl" />
      <p className="splash__title">Agent Automation</p>
      <p className="splash__status mono">
        Connecting
        <span className="splash__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
    </div>
  );
}

/** Signing in failed: the message and a way to try again. */
export function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="splash splash--error" role="alert">
      <Orb tone="bad" size="xl" />
      <p className="splash__title">Could not connect</p>
      <p className="splash__msg mono">{message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        <IconRepeat size={15} />
        Retry
      </button>
    </div>
  );
}
