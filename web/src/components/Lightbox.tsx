import type { JobRow } from '../lib/types';
import { Dialog } from './Dialog';
import { IconLink, IconX } from './Icons';
import { StatusChip } from './StatusChip';

export function Lightbox({ shot, onClose }: { shot: { job: JobRow; url: string } | null; onClose: () => void }) {
  return (
    <Dialog open={shot !== null} onClose={onClose} labelledBy="lightbox-title" className="lightbox">
      {shot ? (
        <>
          <header className="lightbox__head">
            <div className="lightbox__title">
              <h2 id="lightbox-title">
                {shot.job.company}: {shot.job.title}
              </h2>
              <StatusChip job={shot.job} />
            </div>
            <div className="lightbox__actions">
              <a className="btn btn--ghost btn--sm" href={shot.url} target="_blank" rel="noreferrer">
                <IconLink size={14} />
                Full size
              </a>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Close screenshot" data-autofocus>
                <IconX size={18} />
              </button>
            </div>
          </header>
          <div className="lightbox__body">
            <img src={shot.url} alt={`Screenshot of the ${shot.job.company} application form`} />
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
