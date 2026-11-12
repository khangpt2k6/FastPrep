import type { ReactNode } from 'react';
import { Orb } from './agent/Orb';

/** A full-page message for when the app cannot run yet (no config, no tables): the coral orb, a title, a way out. */
export function Notice({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="splash splash--notice">
      <Orb tone="bad" size="xl" />
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
