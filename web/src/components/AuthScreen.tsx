import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { SPRING_SOFT, swapVariants } from '../lib/motion';
import { Avatar, MatchBadge } from './common';
import { Logo } from './Icons';

type Mode = 'signin' | 'signup';

/** Illustration of the product, not real data. */
const SAMPLE_JOBS = [
  { company: 'Northwind Labs', title: 'Data Analyst', place: 'Remote', score: 4.6 },
  { company: 'Fernhill Studio', title: 'Frontend Engineer Intern', place: 'Austin, TX', score: 4.1 },
];

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.message);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) setError(err.message);
        else if (!data.session) setInfo('Account created. Check your inbox to confirm, then sign in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Supabase. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setError(null);
    setInfo(null);
  }

  const signin = mode === 'signin';

  return (
    <main className="auth">
      <div className="auth__bg" aria-hidden="true">
        <span className="auth__blob auth__blob--a" />
        <span className="auth__blob auth__blob--b" />
        <span className="auth__blob auth__blob--c" />
        <span className="auth__grain" />
      </div>
      <section className="auth__story" aria-label="About Agent Automation">
        <div className="brand">
          <Logo size={38} />
          <span className="brand__name">Agent Automation</span>
        </div>
        <h1 className="auth__headline">
          Your <span className="marker">job hunt</span>, on autopilot.
        </h1>
        <p className="auth__lede">
          An agent on your computer scores jobs against your resume, then fills the application forms for you while you
          watch it work from here.
        </p>
        <div className="auth__preview" aria-hidden="true">
          {SAMPLE_JOBS.map((job, i) => (
            <div className="card auth__job" key={job.company} style={{ animationDelay: `${200 + i * 140}ms` }}>
              <Avatar name={job.company} size={40} />
              <div className="auth__job-main">
                <span className="auth__job-title">{job.title}</span>
                <span className="auth__job-sub">
                  {job.company}, {job.place}
                </span>
              </div>
              <MatchBadge score={job.score} />
            </div>
          ))}
          <div className="card auth__log" style={{ animationDelay: '480ms' }}>
            <span className="beacon beacon--sm beacon--busy">
              <span className="beacon__ring" />
              <span className="beacon__core" />
            </span>
            <span className="mono">&rsaquo; 1/2 Northwind Labs: Data Analyst: filling page 2</span>
          </div>
        </div>
      </section>

      <motion.section
        className="card auth__panel"
        aria-labelledby="auth-title"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { ...SPRING_SOFT, delay: 0.12 } }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} variants={swapVariants} initial="hidden" animate="shown" exit="gone">
            <h2 id="auth-title" className="auth__title">
              {signin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="auth__sub">
              {signin ? 'Sign in with the account your agent uses.' : 'Your agent signs in with the same email and password.'}
            </p>
          </motion.div>
        </AnimatePresence>

        <form onSubmit={submit} className="auth__form">
          <div className="field">
            <label className="field__label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={signin ? 'current-password' : 'new-password'}
              required
              minLength={6}
              placeholder={signin ? 'Your password' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p className="form-msg form-msg--error" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p className="form-msg form-msg--ok" role="status">
              {info}
            </p>
          ) : null}

          <button className="btn btn--dark btn--block btn--lg" type="submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {busy ? (signin ? 'Signing in' : 'Creating account') : signin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth__switch">
          {signin ? 'No account yet?' : 'Already have an account?'}{' '}
          <button type="button" className="link-btn" onClick={switchMode}>
            {signin ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </motion.section>
    </main>
  );
}
