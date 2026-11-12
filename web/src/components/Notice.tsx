import type { ReactNode } from 'react';
import { IconAlert, Logo } from './Icons';

/** A full-page explanation for when the app cannot run yet (no config, no tables). */
export function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="notice">
      <div className="brand">
        <Logo size={34} />
        <span className="brand__name">Agent Automation</span>
      </div>
      <section className="card notice__card" aria-labelledby="notice-title">
        <span className="setupcard__icon" aria-hidden="true">
          <IconAlert size={20} />
        </span>
        <h1 id="notice-title">{title}</h1>
        <div className="notice__body">{children}</div>
        {action ? <div className="notice__actions">{action}</div> : null}
      </section>
    </main>
  );
}
