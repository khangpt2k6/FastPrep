import type { JobRow } from '../lib/types';
import type { SectionState } from '../lib/profile';
import { IconArrowRight, IconCheck } from './Icons';
import { AnimatedNumber } from './motion';

export function ProfileCard({ complete, sections, onOpen, onContinue }: {
  complete: boolean;
  sections: SectionState[];
  onOpen: () => void;
  onContinue: () => void;
}) {
  const done = sections.filter((s) => s.done).length;
  if (complete) {
    return (
      <section className="card railcard" aria-label="Profile">
        <div className="railcard__row">
          <span className="donebadge" aria-hidden="true">
            <IconCheck size={18} />
          </span>
          <div>
            <p className="card__title">Profile complete</p>
            <p className="card__hint">The agent has what it needs to fill forms.</p>
          </div>
        </div>
        <button type="button" className="link-btn" onClick={onOpen}>
          View profile
          <IconArrowRight size={14} />
        </button>
      </section>
    );
  }
  return (
    <section className="card railcard" aria-label="Profile">
      <p className="card__title">Finish your profile</p>
      <p className="card__hint">
        <AnimatedNumber id="profile-done" value={done} /> of {sections.length} sections filled. The agent uses it to answer every form.
      </p>
      <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={sections.length} aria-valuenow={done}>
        <span style={{ width: `${(done / sections.length) * 100}%` }} />
      </div>
      <button type="button" className="btn btn--primary btn--sm btn--block" onClick={onContinue}>
        Continue setup
      </button>
    </section>
  );
}

export function ApplicationsSummaryCard({ items, onOpen }: { items: JobRow[]; onOpen: () => void }) {
  const sent = items.filter((j) => j.status === 'submitted' || j.status === 'unconfirmed').length;
  const live = items.filter((j) => j.status === 'applying').length;
  const notSent = items.filter((j) => j.status === 'blocked').length;
  const bad = items.filter((j) => j.status === 'refused' || j.status === 'failed').length;
  return (
    <section className="card railcard" aria-label="Applications summary">
      <p className="card__title">Applications</p>
      <dl className="tally">
        <div className="tally--sent">
          <dt>Sent</dt>
          <dd className="mono">
            <AnimatedNumber id="apps-sent" value={sent} />
          </dd>
        </div>
        <div className="tally--live">
          <dt>In progress</dt>
          <dd className="mono">
            <AnimatedNumber id="apps-live" value={live} />
          </dd>
        </div>
        <div className="tally--stopped">
          <dt>Not sent</dt>
          <dd className="mono">
            <AnimatedNumber id="apps-notsent" value={notSent} />
          </dd>
        </div>
        <div className="tally--bad">
          <dt>Refused or failed</dt>
          <dd className="mono">
            <AnimatedNumber id="apps-bad" value={bad} />
          </dd>
        </div>
      </dl>
      <button type="button" className="link-btn" onClick={onOpen}>
        Open applications
        <IconArrowRight size={14} />
      </button>
    </section>
  );
}
