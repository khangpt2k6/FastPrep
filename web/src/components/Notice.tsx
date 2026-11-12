import type { ReactNode } from 'react';
import { Logo } from './Icons';

/** A full-page message for when the app cannot run yet (no config, no tables). */
export function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="splash">
      <Logo size={40} />
      <section className="notice" aria-labelledby="notice-title">
        <h1 id="notice-title" className="splash__title">
          {title}
        </h1>
        <div className="notice__body">{children}</div>
        {action ? <div className="notice__actions">{action}</div> : null}
      </section>
    </main>
  );
}
