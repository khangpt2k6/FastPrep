import { IconRepeat, Logo } from './Icons';
import { Wolf } from './mascot/Wolf';
import { Contours } from './motif';

/** Shown while the page signs in by itself: the wolf getting ready over the contour map, and one word. */
export function BootSplash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <Contours className="splash__map" />
      <div className="splash__card">
        <span className="splash__wolf">
          <Wolf mood="laptop" size={96} motion="bob" eager />
        </span>
        <span className="splash__brand">
          <Logo size={22} />
          Agent Automation
        </span>
        <p className="splash__status">
          <span className="spinner" aria-hidden="true" />
          Connecting
        </p>
      </div>
    </div>
  );
}

/** Signing in failed: the wolf thinking with a rose badge, the reason, and a way to try again. */
export function BootError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="splash" role="alert">
      <Contours className="splash__map" />
      <div className="splash__card">
        <span className="splash__wolf">
          <Wolf mood="thinking" size={96} alert motion="none" eager />
        </span>
        <p className="splash__title">Could not connect</p>
        <p className="splash__msg">{message}</p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          <IconRepeat size={14} />
          Retry
        </button>
      </div>
    </div>
  );
}
