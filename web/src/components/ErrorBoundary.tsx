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
      <section className="card setupcard" role="alert">
        <span className="setupcard__icon" aria-hidden="true">
          <IconAlert size={20} />
        </span>
        <h2>This page hit an error</h2>
        <p>{this.state.error.message}</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </section>
    );
  }
}
