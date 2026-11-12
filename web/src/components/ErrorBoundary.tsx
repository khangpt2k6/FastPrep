import { Component, type ErrorInfo, type ReactNode } from 'react';
import { IconAlert } from './Icons';

interface State {
  error: Error | null;
}

/** Keeps one broken page from blanking the whole dashboard during a demo. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="callout callout--red" role="alert">
        <span className="callout__icon" aria-hidden="true">
          <IconAlert size={16} />
        </span>
        <div className="callout__body">
          <strong>Page error.</strong> {this.state.error.message}
        </div>
        <div className="callout__action">
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => this.setState({ error: null })}>
            Retry
          </button>
        </div>
      </div>
    );
  }
}
