import { useRef, useState } from 'react';
import type { ResumeRow } from '../../lib/types';
import { fileSize, timeAgo } from '../../lib/format';
import { isPdfName, readResume } from '../../lib/resume';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { Dialog } from '../Dialog';
import { Group } from '../settings';
import { Shimmer } from '../motion';
import { IconDownload, IconLink, IconResume, IconSpark, IconUpload, IconX } from '../Icons';

interface ResumeCardProps {
  active: ResumeRow | null;
  pending: ResumeRow | null;
  loading: boolean;
  missing: boolean;
  agentName: string;
  now: number;
  onReplace: () => void;
}

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

/** The resume the agent sends: name, when it was uploaded, its size, and what the agent read from it. */
export function ResumeCard({ active, pending, loading, missing, agentName, now, onReplace }: ResumeCardProps) {
  const [open, setOpen] = useState<ResumeRow | null>(null);
  const read = active ? readResume(active.data) : null;
  const places = read ? [...read.search.cities, ...read.search.countries] : [];

  let body;
  if (loading) {
    body = (
      <div className="resume" aria-busy="true">
        <span className="skeleton resume__iconskel" />
        <span className="resume__info">
          <span className="skeleton skeleton--line" style={{ width: '40%' }} />
          <span className="skeleton skeleton--line skeleton--thin" style={{ width: '26%' }} />
        </span>
      </div>
    );
  } else if (active) {
    body = (
      <>
        <div className="resume">
          <span className="resume__icon" aria-hidden="true">
            <IconResume size={22} />
          </span>
          <div className="resume__info">
            <p className="resume__name">{active.name}</p>
            <p className="resume__meta num">
              <span>Uploaded {timeAgo(active.created_at, now)}</span>
              {fileSize(active.size) ? <span>{fileSize(active.size)}</span> : null}
              <span className="tag tag--green">Active</span>
            </p>
          </div>
          <div className="resume__actions">
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen(active)}>
              Open
            </button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onReplace}>
              Replace
            </button>
          </div>
        </div>
        {pending ? (
          <p className="resume__pending">
            <Shimmer>Reading {pending.name}</Shimmer>
          </p>
        ) : null}
        {read?.any ? (
          <div className="readout">
            <p className="readout__title">
              <IconSpark size={14} />
              What the agent read
            </p>
            <dl className="props props--tight">
              <div className="prop">
                <dt className="prop__name">Titles</dt>
                <dd className="prop__value">
                  {read.search.titles.length ? (
                    <span className="taglist">
                      {read.search.titles.map((t) => (
                        <span className="tag tag--blue" key={t}>
                          {t}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="muted">Not set</span>
                  )}
                </dd>
              </div>
              <div className="prop">
                <dt className="prop__name">Places</dt>
                <dd className="prop__value">
                  {places.length ? (
                    <span className="taglist">
                      {places.map((p) => (
                        <span className="tag tag--gray" key={p}>
                          {p}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="muted">Anywhere</span>
                  )}
                </dd>
              </div>
              <div className="prop">
                <dt className="prop__name">Goals</dt>
                <dd className="prop__value">{read.search.goals || <span className="muted">Not set</span>}</dd>
              </div>
              <div className="prop">
                <dt className="prop__name">Found</dt>
                <dd className="prop__value num">
                  {[
                    read.profile.education.length ? `${read.profile.education.length} ${read.profile.education.length === 1 ? 'school' : 'schools'}` : '',
                    read.profile.experience.length ? `${read.profile.experience.length} ${read.profile.experience.length === 1 ? 'role' : 'roles'}` : '',
                    read.profile.skills.length ? `${read.profile.skills.length} skills` : '',
                  ]
                    .filter(Boolean)
                    .join(', ') || <span className="muted">Nothing yet</span>}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </>
    );
  } else if (pending) {
    body = (
      <div className="resume">
        <span className="resume__icon is-busy" aria-hidden="true">
          <IconResume size={22} />
        </span>
        <div className="resume__info">
          <p className="resume__name">{pending.name}</p>
          <p className="resume__meta">
            <Shimmer>{pending.status === 'reading' ? 'The agent is reading it' : 'Waiting for the agent'}</Shimmer>
          </p>
        </div>
        <div className="resume__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onReplace}>
            See progress
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="resume">
        <span className="resume__icon is-empty" aria-hidden="true">
          <IconResume size={22} />
        </span>
        <div className="resume__info">
          <p className="resume__name">{agentName || 'No resume yet'}</p>
          <p className="resume__meta">
            {missing ? (
              <span>
                Uploading needs the latest <code className="code">supabase/schema.sql</code>
              </span>
            ) : agentName ? (
              'Loaded on your computer. Upload it here to keep it with your profile.'
            ) : (
              'The agent fills in your profile from it.'
            )}
          </p>
        </div>
        {!missing ? (
          <div className="resume__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={onReplace}>
              <IconUpload size={14} />
              Upload resume
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <Group title="Resume">{body}</Group>
      <ResumeDialog resume={open} onClose={() => setOpen(null)} />
    </>
  );
}
