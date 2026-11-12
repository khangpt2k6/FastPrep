import { useRef } from 'react';
import type { JobRow } from '../lib/types';
import { displayName } from '../lib/format';
import { CompanyLogo } from './CompanyLogo';
import { Dialog } from './Dialog';
import { IconExpand, IconX } from './Icons';
import { StatusChip } from './StatusChip';

export function Lightbox({ shot: current, onClose }: { shot: { job: JobRow; url: string } | null; onClose: () => void }) {
  // Keep showing the last shot while the dialog animates out.
  const last = useRef(current);
  if (current) last.current = current;
  const shot = last.current;
  const name = shot ? displayName(shot.job) : '';
  return (
    <Dialog open={current !== null} onClose={onClose} labelledBy="lightbox-title" className="lightbox">
      {shot ? (
        <>
          <header className="lightbox__head">
            <div className="lightbox__title">
              <CompanyLogo name={name} domain={shot.job.company_domain} size={32} />
              <h2 id="lightbox-title">
                {name}
                <span>{shot.job.title}</span>
              </h2>
              <StatusChip job={shot.job} />
            </div>
            <div className="lightbox__actions">
              <a className="icon-btn" href={shot.url} target="_blank" rel="noreferrer" aria-label="Open full size" title="Full size">
                <IconExpand size={17} />
              </a>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close screenshot" title="Close" data-autofocus>
                <IconX size={18} />
              </button>
            </div>
          </header>
          <div className="lightbox__body">
            <img src={shot.url} alt={`Screenshot of the ${name} application form`} />
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
