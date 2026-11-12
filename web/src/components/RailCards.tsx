import type { JobRow } from '../lib/types';
import type { SectionState } from '../lib/profile';
import { AnimatedNumber } from './motion';

/** Shown only while the profile is unfinished: one line and a button. */
export function ProfileCard({ sections, onContinue }: { sections: SectionState[]; onContinue: () => void }) {
  const done = sections.filter((s) => s.done).length;
  return (
    <section className="card railcard profilecard" aria-label="Profile">
      <div className="profilecard__row">
        <p className="profilecard__text">
          Profile <AnimatedNumber className="mono" id="profile-done" value={done} />
          <span className="mono">/{sections.length}</span>
        </p>
        <button type="button" className="btn btn--primary btn--sm" onClick={onContinue}>
          Finish
        </button>
      </div>
      <div className="progressbar" role="progressbar" aria-label="Profile sections filled" aria-valuemin={0} aria-valuemax={sections.length} aria-valuenow={done}>
        <span style={{ width: `${(done / Math.max(1, sections.length)) * 100}%` }} />
      </div>
    </section>
  );
}

export function ApplicationsSummaryCard({ items }: { items: JobRow[] }) {
  const sent = items.filter((j) => j.status === 'submitted' || j.status === 'unconfirmed').length;
  const live = items.filter((j) => j.status === 'applying').length;
  const notSent = items.filter((j) => j.status === 'blocked').length;
  const bad = items.filter((j) => j.status === 'refused' || j.status === 'failed').length;
  return (
    <section className="card railcard" aria-label="Applications summary">
      <dl className="tally">
        <div className="tally--sent">
          <dt>Sent</dt>
          <dd>
            <AnimatedNumber id="apps-sent" value={sent} />
          </dd>
        </div>
        <div className="tally--live">
          <dt>Applying</dt>
          <dd>
            <AnimatedNumber id="apps-live" value={live} />
          </dd>
        </div>
        <div className="tally--stopped">
          <dt>Not sent</dt>
          <dd>
            <AnimatedNumber id="apps-notsent" value={notSent} />
          </dd>
        </div>
        <div className="tally--bad">
          <dt title="Refused or failed">Failed</dt>
          <dd>
            <AnimatedNumber id="apps-bad" value={bad} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
