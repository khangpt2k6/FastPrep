import { useState, type FormEvent } from 'react';
import { Logo } from '../Icons';
import './signin.css';

interface SignInProps {
  /** Signs in and answers with why it failed, or null when it worked. */
  onSignIn: (email: string, password: string) => Promise<string | null>;
  /** Shown above the form: why the last session ended, when it did not end by a sign-out. */
  note?: string | null;
}

/** The only way into the dashboard: the account's email and password. Nothing is shown before it. */
export function SignIn({ onSignIn, note }: SignInProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const failed = await onSignIn(email.trim(), password);
    // On success the page swaps to the dashboard and this form is gone.
    if (failed) {
      setError(failed);
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <main className="splash">
      <form className="signin" onSubmit={submit} aria-labelledby="signin-title">
        <Logo size={40} />
        <h1 id="signin-title" className="splash__title">
          Sign in to Agent Automation
        </h1>
        {note && !error ? <p className="signin__note">{note}</p> : null}
        <label className="field signin__field">
          <span className="field__label">Email</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="field signin__field">
          <span className="field__label">Password</span>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
        </label>
        {error ? (
          <p className="splash__msg signin__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {busy ? 'Signing in' : 'Sign in'}
        </button>
        <p className="signin__hint">Your data is private to this account.</p>
      </form>
    </main>
  );
}
