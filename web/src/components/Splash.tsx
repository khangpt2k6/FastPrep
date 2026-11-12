import { IconRepeat, Logo } from './Icons';

/** Shown while the page signs in as the agent's account by itself: the mark and a small spinner. */
export function BootSplash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Logo size={40} />
      <p className="splash__status">
        <span className="spinner" aria-hidden="true" />
        Connecting
      </p>
    </div>
  );
}

/** Signing in failed: the reason and a way to try again. */
export function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="splash" role="alert">
      <Logo size={40} />
      <p className="splash__title">Could not connect</p>
      <p className="splash__msg">{message}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        <IconRepeat size={14} />
        Retry
      </button>
    </div>
  );
}
