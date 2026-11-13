import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { errorText } from '../../lib/errors';
import { fileSize, timeAgo } from '../../lib/format';
import { EASE_OUT, SPRING_SOFT } from '../../lib/motion';
import { activeResume, byNewest, checkResumeFile, isPending, readResume, type ResumeProfile, type ResumeSearch } from '../../lib/resume';
import type { LoadError, ResumeRow } from '../../lib/types';
import { Shimmer, WaitingLines } from '../motion';
import { Wolf } from '../mascot/Wolf';
import { START_SHORTCUT } from '../agent/live';
import type { ToastInput } from '../Toasts';
import { IconAlert, IconArrowRight, IconResume, IconTrash } from '../Icons';
import { Customize } from './Customize';
import { DropZone } from './DropZone';
import { Illustration } from './Illustration';

export type SetupStep = 1 | 2 | 3;

/** Where the page starts; the preview uses it to show each state. */
export interface SetupStart {
  step?: SetupStep;
  upload?: { name: string; size: number };
  uploadError?: string;
  trackedId?: number;
}

interface SetupPageProps {
  resumes: { rows: ResumeRow[]; loading: boolean; error: LoadError | null };
  online: boolean;
  now: number;
  onUpload: (file: File) => Promise<number>;
  onDelete: (row: ResumeRow) => Promise<void>;
  onSaveRead: (row: ResumeRow, read: { search: ResumeSearch; profile: ResumeProfile }) => Promise<void>;
  /** Merges the resume's profile parts into the profile and opens the profile wizard at its review step. */
  onApply: (profile: ResumeProfile) => Promise<void>;
  onSeeJobs: () => void;
  onEditProfile: () => void;
  toast: (toast: ToastInput) => void;
  start?: SetupStart;
}

const STEPS: { step: SetupStep; label: string }[] = [
  { step: 1, label: 'Resume' },
  { step: 2, label: 'Customize' },
  { step: 3, label: 'Done' },
];

const READING_LINES = ['Reading your experience', 'Picking out your skills', 'Finding roles you fit', 'Picking places to search'];

function StepDashes({ step, canGo, onGo }: { step: SetupStep; canGo: (s: SetupStep) => boolean; onGo: (s: SetupStep) => void }) {
  return (
    <nav className="steps" aria-label="Setup steps">
      <span className="steps__label">
        Step {step} of 3: {STEPS[step - 1].label}
      </span>
      <ol className="steps__list">
        {STEPS.map((s) => (
          <li key={s.step}>
            <button
              type="button"
              className={`steps__dash ${s.step === step ? 'is-on' : s.step < step ? 'is-done' : ''}`}
              aria-current={s.step === step ? 'step' : undefined}
              disabled={!canGo(s.step)}
              onClick={() => onGo(s.step)}
              title={`${s.step} ${s.label}`}
            >
              <span className="sr-only">
                {s.step} {s.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The chosen file, landing with a small drop. */
function FileChip({ name, size }: { name: string; size: number }) {
  return (
    <motion.div className="filechip" initial={{ opacity: 0, y: -22, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING_SOFT }}>
      <span className="filechip__icon" aria-hidden="true">
        <IconResume size={18} />
      </span>
      <span className="filechip__name">{name}</span>
      {fileSize(size) ? <span className="filechip__size num">{fileSize(size)}</span> : null}
    </motion.div>
  );
}

function StatusCard({ tone = 'plain', children }: { tone?: 'plain' | 'ok' | 'bad'; children: ReactNode }) {
  return (
    <motion.div
      className={`card status status--${tone}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
      role="status"
      aria-live="polite"
    >
      {children}
    </motion.div>
  );
}

/** A check in a circle that draws itself. */
function DrawnCheck({ big = false }: { big?: boolean }) {
  return (
    <svg className={`okcheck ${big ? 'okcheck--big' : ''}`} viewBox="0 0 52 52" aria-hidden="true">
      <circle className="okcheck__ring" cx="26" cy="26" r="23" />
      <path className="okcheck__tick" d="M15 27l7.5 7.5L37.5 19" />
    </svg>
  );
}

export function SetupPage({ resumes, online, now, onUpload, onDelete, onSaveRead, onApply, onSeeJobs, onEditProfile, toast, start }: SetupPageProps) {
  const [step, setStep] = useState<SetupStep>(start?.step ?? 1);
  const [upload, setUpload] = useState<{ name: string; size: number; error?: string } | null>(
    start?.upload ? { ...start.upload, error: start.uploadError } : null,
  );
  const [trackedId, setTrackedId] = useState<number | null>(start?.trackedId ?? null);
  const [applying, setApplying] = useState(false);
  const autoTracked = useRef(start?.trackedId !== undefined || start?.upload !== undefined);

  const rows = useMemo(() => byNewest(resumes.rows), [resumes.rows]);
  const active = useMemo(() => activeResume(resumes.rows), [resumes.rows]);
  const tracked = trackedId !== null ? rows.find((r) => r.id === trackedId) ?? null : null;
  const missing = resumes.error?.kind === 'missing-table';

  // Coming back to the page: follow a resume the agent has not finished with, or one that just failed.
  useEffect(() => {
    if (autoTracked.current || resumes.loading) return;
    autoTracked.current = true;
    const latest = rows[0];
    if (latest && (isPending(latest) || latest.status === 'failed')) setTrackedId(latest.id);
  }, [resumes.loading, rows]);

  const source = tracked?.status === 'active' ? tracked : active;
  const earlier = rows.filter((r) => (r.status === 'old' || r.status === 'failed') && r.id !== trackedId);

  async function choose(file: File) {
    const problem = checkResumeFile(file);
    if (problem) {
      toast({ tone: 'warn', title: problem });
      return;
    }
    setUpload({ name: file.name, size: file.size });
    try {
      const id = await onUpload(file);
      setTrackedId(id);
      setUpload(null);
    } catch (error) {
      setUpload({ name: file.name, size: file.size, error: errorText(error) });
    }
  }

  async function remove(row: ResumeRow) {
    try {
      await onDelete(row);
      if (row.id === trackedId) setTrackedId(null);
      toast({ tone: 'ok', title: 'Resume removed' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not remove resume', detail: errorText(error) });
    }
  }

  async function apply(read: { search: ResumeSearch; profile: ResumeProfile }) {
    if (!source) return;
    setApplying(true);
    try {
      await onSaveRead(source, read);
      await onApply(read.profile);
      setStep(3);
    } catch (error) {
      toast({ tone: 'error', title: 'Could not use the resume', detail: errorText(error) });
    } finally {
      setApplying(false);
    }
  }

  const retry = () => {
    setUpload(null);
    setTrackedId(null);
  };

  let left: ReactNode;
  let key = 'drop';
  if (upload && !upload.error) {
    key = 'uploading';
    left = (
      <StatusCard>
        <FileChip name={upload.name} size={upload.size} />
        <p className="status__title">
          <Shimmer tone="strong">Uploading</Shimmer>
        </p>
        <div className="bar" aria-hidden="true">
          <span />
        </div>
      </StatusCard>
    );
  } else if (upload?.error) {
    key = 'upload-failed';
    left = (
      <StatusCard tone="bad">
        <span className="status__badge status__badge--bad" aria-hidden="true">
          <IconAlert size={20} />
        </span>
        <p className="status__title">Could not upload {upload.name}</p>
        <p className="status__text">{upload.error}</p>
        <div className="status__actions">
          <button type="button" className="btn btn--brand" onClick={retry}>
            Try again
          </button>
        </div>
      </StatusCard>
    );
  } else if (tracked && tracked.status === 'uploaded') {
    key = 'waiting';
    left = (
      <StatusCard>
        <FileChip name={tracked.name} size={tracked.size} />
        <div className="status__row">
          <Wolf mood="music" size={52} dim={!online} motion={online ? 'idle' : 'none'} />
          <div>
            <p className="status__title">{online ? <Shimmer tone="strong">Waiting for the agent</Shimmer> : 'Waiting for the agent'}</p>
            <p className="status__text">
              {online ? (
                'It picks this up in a moment.'
              ) : (
                <>
                  It starts when the agent is online. Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop.
                </>
              )}
            </p>
          </div>
        </div>
      </StatusCard>
    );
  } else if (tracked && tracked.status === 'reading') {
    key = 'reading';
    left = (
      <StatusCard>
        <div className="scan" aria-hidden="true">
          <div className="scan__doc">
            <span className="scan__head" />
            <span style={{ width: '62%' }} />
            <span style={{ width: '40%' }} />
            <span className="scan__gap" />
            <span style={{ width: '80%' }} />
            <span style={{ width: '72%' }} />
            <span style={{ width: '54%' }} />
            <span className="scan__gap" />
            <span style={{ width: '76%' }} />
            <span style={{ width: '48%' }} />
          </div>
          <span className="scan__line" />
          <Wolf mood="reading" size={64} motion="bob" className="scan__wolf" />
        </div>
        <p className="status__title">
          <Shimmer tone="strong">Reading your resume</Shimmer>
        </p>
        <WaitingLines className="status__wait" lines={READING_LINES} every={2600} />
      </StatusCard>
    );
  } else if (tracked && tracked.status === 'active') {
    key = 'active';
    left = (
      <StatusCard tone="ok">
        <span className="status__cheer">
          <Wolf mood="cheer" size={76} motion="hop" eager />
          <DrawnCheck />
        </span>
        <p className="status__title">Resume ready</p>
        <p className="status__text">
          <strong>{tracked.name}</strong> is the resume the agent sends now.
        </p>
        <div className="status__actions">
          <button type="button" className="btn btn--brand" onClick={() => setStep(2)}>
            Continue
            <IconArrowRight size={15} />
          </button>
        </div>
      </StatusCard>
    );
  } else if (tracked && tracked.status === 'failed') {
    key = 'failed';
    left = (
      <StatusCard tone="bad">
        <span className="status__badge status__badge--bad" aria-hidden="true">
          <IconAlert size={20} />
        </span>
        <p className="status__title">Could not read {tracked.name}</p>
        <p className="status__text">{tracked.error || 'Try another file.'}</p>
        <div className="status__actions">
          <button type="button" className="btn btn--brand" onClick={retry}>
            Try again
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void remove(tracked)}>
            Remove
          </button>
        </div>
      </StatusCard>
    );
  } else {
    left = (
      <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <DropZone onFile={(file) => void choose(file)} disabled={missing} />
        {missing ? (
          <p className="groupnote groupnote--warn">
            Needs the latest <code className="code">supabase/schema.sql</code>
          </p>
        ) : null}
        {active ? (
          <p className="setup__current">
            Current resume: <strong>{active.name}</strong>, uploaded {timeAgo(active.created_at, now)}.{' '}
            <button type="button" className="link-btn" onClick={() => setStep(2)}>
              Use this one
            </button>
          </p>
        ) : null}
      </motion.div>
    );
  }

  const canGo = (s: SetupStep) => s === 1 || (s === 2 && Boolean(source)) || (s === 3 && step === 3);

  return (
    <div className="page setup">
      <div className="setup__top">
        <span className="setup__kicker">Set up</span>
        <StepDashes step={step} canGo={canGo} onGo={setStep} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step === 1 ? (
          <motion.div key="s1" className="setup__cols" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
            <div className="setup__left">
              <div className="setup__hello">
                <Wolf mood="checklist" size={64} motion="pop" eager />
                <div>
                  <h1 className="setup__title">Start with your resume</h1>
                  <p className="setup__sub">Your profile and search are built from it.</p>
                </div>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <div key={key}>{left}</div>
              </AnimatePresence>
              {earlier.length > 0 ? (
                <div className="earlier">
                  <p className="earlier__label">Earlier resumes</p>
                  <ul className="earlier__list">
                    {earlier.map((r) => (
                      <li key={r.id} className="earlier__item">
                        <IconResume size={16} />
                        <span className="earlier__name">{r.name}</span>
                        <span className={`tag ${r.status === 'failed' ? 'tag--red' : 'tag--gray'}`}>{r.status === 'failed' ? 'Failed' : 'Old'}</span>
                        <span className="earlier__when num">{timeAgo(r.created_at, now)}</span>
                        <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" aria-label={`Remove ${r.name}`} title="Remove" onClick={() => void remove(r)}>
                          <IconTrash size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="setup__right">
              <Illustration />
            </div>
          </motion.div>
        ) : step === 2 ? (
          <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
            <div className="setup__hello">
              <Wolf mood="reading" size={64} motion="pop" eager />
              <div>
                <h1 className="setup__title">Review extracted details</h1>
                <p className="setup__sub">Edit, then apply to your profile.</p>
              </div>
            </div>
            {source ? (
              readResume(source.data).any ? (
                <Customize row={source} busy={applying} onBack={() => setStep(1)} onApply={(read) => void apply(read)} />
              ) : (
                <div className="card status">
                  <p className="status__title">Nothing read yet</p>
                  <p className="status__text">The agent has not written down what it read from {source.name}.</p>
                  <div className="status__actions">
                    <button type="button" className="btn btn--secondary" onClick={() => setStep(1)}>
                      Back
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="card status">
                <p className="status__title">Upload a resume first</p>
                <div className="status__actions">
                  <button type="button" className="btn btn--brand" onClick={() => setStep(1)}>
                    Upload resume
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="s3" className="setup__cols" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: EASE_OUT }}>
            <div className="setup__left setup__done">
              <Wolf mood="cheer" size={96} motion="hop" eager />
              <h1 className="setup__title">You are all set</h1>
              <p className="setup__sub">Searches now use this resume.</p>
              <div className="status__actions">
                <button type="button" className="btn btn--brand" onClick={onSeeJobs}>
                  See jobs
                  <IconArrowRight size={15} />
                </button>
                <button type="button" className="btn btn--secondary" onClick={onEditProfile}>
                  Edit profile
                </button>
              </div>
            </div>
            <div className="setup__right">
              <Illustration done />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SetupPage;
