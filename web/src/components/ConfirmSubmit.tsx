import { useRef } from 'react';
import type { JobRow } from '../lib/types';
import { plural } from '../lib/format';
import { Dialog } from './Dialog';

interface ConfirmSubmitProps {
  jobs: JobRow[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Shown before a real (not dry run) apply, because it sends applications for real. */
export function ConfirmSubmit({ jobs: current, onCancel, onConfirm }: ConfirmSubmitProps) {
  // Keep the last list on screen while the dialog animates out.
  const last = useRef(current);
  if (current) last.current = current;
  const jobs = last.current;
  const n = jobs?.length ?? 0;
  return (
    <Dialog open={current !== null} onClose={onCancel} labelledBy="confirm-title" className="confirm">
      <h2 id="confirm-title" className="confirm__title">
        Submit {plural(n, 'real application')}?
      </h2>
      <p className="confirm__text">
        Dry run is off. The agent fills these forms and presses submit, using your resume and profile. Employers
        will receive them.
      </p>
      <ul className="confirm__list">
        {(jobs ?? []).slice(0, 5).map((job) => (
          <li key={job.id}>
            <span className="confirm__company">{job.company}</span>
            <span className="confirm__role">{job.title}</span>
          </li>
        ))}
        {n > 5 ? <li className="confirm__more">and {n - 5} more</li> : null}
      </ul>
      <div className="confirm__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} data-autofocus>
          Cancel
        </button>
        <button type="button" className="btn btn--live" onClick={onConfirm}>
          Submit {plural(n, 'application')}
        </button>
      </div>
    </Dialog>
  );
}
