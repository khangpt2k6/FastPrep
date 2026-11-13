import { useRef } from 'react';
import type { ResumeRow } from '../../lib/types';
import { fileSize } from '../../lib/format';
import { isPdfName } from '../../lib/resume';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { Dialog } from '../Dialog';
import { IconDownload, IconLink, IconResume, IconX } from '../Icons';

/** The resume file in a dialog: a PDF in a frame, anything else as a download. */
export function ResumeDialog({ resume, onClose }: { resume: ResumeRow | null; onClose: () => void }) {
  const last = useRef(resume);
  if (resume) last.current = resume;
  const shown = last.current;
  const path = shown?.path ?? '';
  const { url, failed } = useSignedUrl(path, shown?.updated_at ?? '');
  const { url: downloadUrl } = useSignedUrl(path, shown?.updated_at ?? '', shown?.name || 'resume.pdf');
  const pdf = shown ? isPdfName(shown.name) : false;
  return (
    <Dialog open={resume !== null} onClose={onClose} labelledBy="resume-title" className="docview">
      {shown ? (
        <>
          <header className="docview__head">
            <span className="docview__icon" aria-hidden="true">
              <IconResume size={20} />
            </span>
            <div className="docview__who">
              <h2 id="resume-title">{shown.name}</h2>
              <span className="num">{fileSize(shown.size)}</span>
            </div>
            {url ? (
              <a className="btn btn--secondary btn--sm" href={url} target="_blank" rel="noreferrer">
                <IconLink size={14} />
                <span className="hide-sm">Open in new tab</span>
              </a>
            ) : null}
            {downloadUrl ? (
              <a className="btn btn--secondary btn--sm" href={downloadUrl} download={shown.name}>
                <IconDownload size={14} />
                <span className="hide-sm">Download</span>
              </a>
            ) : null}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" title="Close" data-autofocus>
              <IconX size={18} />
            </button>
          </header>
          <div className="docview__body">
            {failed ? (
              <p className="docview__note">The file could not be opened.</p>
            ) : !url ? (
              <div className="docview__loading">
                <span className="skeleton docview__skel" />
              </div>
            ) : pdf ? (
              <iframe className="docview__frame" src={url} title={shown.name} />
            ) : (
              <p className="docview__note">Word files open in their own app. Use Download.</p>
            )}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
