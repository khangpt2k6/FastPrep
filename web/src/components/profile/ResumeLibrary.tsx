// The person's resumes: the default one every application sends, and the others kept with what the agent read from
// each. Upload another without touching the default, make one the default, label, open or delete them.
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { errorText } from '../../lib/errors';
import { fileSize, timeAgo } from '../../lib/format';
import { RESUME_ACCEPT, byNewest, checkResumeFile, readResume } from '../../lib/resume';
import type { ResumeRow } from '../../lib/types';
import { Dialog } from '../Dialog';
import { CheckBox, Tag } from '../common';
import { IconCheck, IconChevronDown, IconResume, IconSpark, IconTrash, IconUpload, IconX } from '../Icons';
import { Shimmer } from '../motion';
import { Group } from '../settings';
import type { ToastInput } from '../Toasts';
import { ResumeDialog } from './ResumeCard';
import './resumes.css';

export interface ResumeActions {
  /** Uploads a resume; with activate false the agent only reads it and keeps it here. */
  upload: (file: File, options: { label: string; activate: boolean }) => Promise<unknown>;
  /** Asks the agent to make it the default (it searches again with it). */
  makeDefault: (row: ResumeRow) => Promise<void>;
  remove: (row: ResumeRow) => Promise<void>;
  setLabel: (row: ResumeRow, label: string) => Promise<void>;
}

export interface ResumeLibraryProps {
  rows: ResumeRow[];
  loading: boolean;
  /** The resumes table is not in this database yet. */
  missing: boolean;
  /** The resume the agent has loaded on the computer, when the table has none. */
  agentName: string;
  /** Postings the agent found with the default resume's search. */
  jobsFound: number;
  now: number;
  online: boolean;
  actions: ResumeActions;
  toast: (toast: ToastInput) => void;
  /** Set up, for the first resume. */
  onSetup: () => void;
}

/** Ready means read and kept; the default is the one applications send. */
const isReady = (row: ResumeRow) => row.status === 'old';
const isBusy = (row: ResumeRow) => row.status === 'uploaded' || row.status === 'reading';

/** The label, saved when the field loses focus or on Enter; Escape puts the old one back. */
function LabelField({ row, onSave }: { row: ResumeRow; onSave: (label: string) => Promise<void> }) {
  const supported = row.label !== undefined;
  const [value, setValue] = useState(row.label ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const focused = useRef(false);

  // Follow the row while the field is not being edited.
  useEffect(() => {
    if (!focused.current) setValue(row.label ?? '');
  }, [row.label]);

  async function save() {
    focused.current = false;
    const next = value.trim();
    if (next === (row.label ?? '').trim()) return;
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
      window.setTimeout(() => setState('idle'), 1600);
    } catch {
      setValue(row.label ?? '');
      setState('idle');
    }
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setValue(row.label ?? '');
      focused.current = false;
      event.currentTarget.blur();
    }
  };

  return (
    <span className="rlib__labelwrap">
      <input
        className="rlib__label"
        value={value}
        placeholder="Add a label, e.g. ML"
        maxLength={40}
        disabled={!supported}
        title={supported ? 'A name for this resume' : 'Labels need the latest supabase/schema.sql'}
        aria-label={`Label for ${row.name}`}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKey}
        size={value ? Math.max(4, value.length + 1) : 21}
      />
      {state === 'saving' ? <span className="spinner rlib__saving" aria-hidden="true" /> : null}
      {state === 'saved' ? (
        <span className="rlib__saved" role="status">
          <IconCheck size={13} />
          Saved
        </span>
      ) : null}
    </span>
  );
}

/** What the agent read from one resume: titles, places, goals and skills; for the default, the jobs it found. */
function Readout({ row, isDefault, jobsFound }: { row: ResumeRow; isDefault: boolean; jobsFound: number }) {
  const read = readResume(row.data);
  const places = [...read.search.cities, ...read.search.countries];
  const skills = read.profile.skills;
  const tags = (items: string[], color: 'blue' | 'gray', empty: string, max = 14) =>
    items.length ? (
      <span className="taglist">
        {items.slice(0, max).map((t) => (
          <span className={`tag tag--${color}`} key={t}>
            {t}
          </span>
        ))}
        {items.length > max ? <span className="tag tag--gray num">+{items.length - max}</span> : null}
      </span>
    ) : (
      <span className="muted">{empty}</span>
    );
  return (
    <div className="readout rlib__readout">
      <p className="readout__title">
        <IconSpark size={14} />
        Extracted details
      </p>
      {read.any ? (
        <dl className="props props--tight">
          <div className="prop">
            <dt className="prop__name">Titles</dt>
            <dd className="prop__value">{tags(read.search.titles, 'blue', 'Not set')}</dd>
          </div>
          <div className="prop">
            <dt className="prop__name">Places</dt>
            <dd className="prop__value">{tags(places, 'gray', 'Anywhere')}</dd>
          </div>
          <div className="prop">
            <dt className="prop__name">Goals</dt>
            <dd className="prop__value">{read.search.goals || <span className="muted">Not set</span>}</dd>
          </div>
          <div className="prop">
            <dt className="prop__name">Skills</dt>
            <dd className="prop__value">{tags(skills, 'gray', 'None read', 16)}</dd>
          </div>
          {isDefault ? (
            <div className="prop">
              <dt className="prop__name">Jobs found</dt>
              <dd className="prop__value num">{jobsFound > 0 ? `${jobsFound.toLocaleString()} with this resume's search` : <span className="muted">None yet</span>}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="rlib__nothing">Nothing read from this one yet.</p>
      )}
    </div>
  );
}

function ResumeItem({ row, isDefault, switching, now, online, jobsFound, onOpen, onMakeDefault, onDelete, onLabel }: {
  row: ResumeRow;
  isDefault: boolean;
  /** Asked to become the default; the agent has not done it yet. */
  switching: boolean;
  now: number;
  online: boolean;
  jobsFound: number;
  onOpen: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
  onLabel: (label: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(isDefault);
  const id = useId();
  const busy = isBusy(row);
  const failed = row.status === 'failed';
  const readable = isDefault || isReady(row);
  return (
    <li className={`rlib__item ${isDefault ? 'is-default' : ''} ${failed ? 'is-failed' : ''}`}>
      <div className="rlib__row">
        <span className={`rlib__icon ${busy ? 'is-busy' : ''}`} aria-hidden="true">
          <IconResume size={20} />
        </span>
        <div className="rlib__info">
          <div className="rlib__top">
            <LabelField row={row} onSave={onLabel} />
            {isDefault ? <Tag color="orange">Default</Tag> : null}
            {failed ? <Tag color="red">Failed</Tag> : null}
          </div>
          <p className="rlib__name" title={row.name}>
            {row.name}
          </p>
          <p className="rlib__meta num">
            <span>Uploaded {timeAgo(row.created_at, now)}</span>
            {fileSize(row.size) ? <span>{fileSize(row.size)}</span> : null}
            {busy ? (
              <span className="rlib__state">
                {row.status === 'reading' ? <Shimmer>Reading it</Shimmer> : online ? <Shimmer>Waiting for the agent</Shimmer> : 'Read when the agent is online'}
              </span>
            ) : null}
            {switching ? (
              <span className="rlib__state">{online ? <Shimmer>Becoming the default</Shimmer> : 'Becomes the default when the agent is online'}</span>
            ) : null}
          </p>
        </div>
        <div className="rlib__actions">
          {row.path ? (
            <button type="button" className="btn btn--ghost btn--xs" onClick={onOpen}>
              Open
            </button>
          ) : null}
          {isReady(row) && !switching ? (
            <button type="button" className="btn btn--secondary btn--xs" onClick={onMakeDefault}>
              Make default
            </button>
          ) : null}
          {!isDefault && !busy && !switching ? (
            <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} aria-label={`Delete ${row.name}`} title="Delete">
              <IconTrash size={15} />
            </button>
          ) : null}
          {readable ? (
            <button
              type="button"
              className="icon-btn rlib__more"
              aria-expanded={open}
              aria-controls={`${id}-read`}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Hide what the agent read' : 'Show what the agent read'}
              title="Extracted details"
            >
              <IconChevronDown size={16} className={open ? 'is-flipped' : ''} />
            </button>
          ) : (
            <span className="rlib__more" aria-hidden="true" />
          )}
        </div>
      </div>
      {failed && row.error ? <p className="rlib__error">{row.error}</p> : null}
      {readable && open ? (
        <div id={`${id}-read`}>
          <Readout row={row} isDefault={isDefault} jobsFound={jobsFound} />
        </div>
      ) : null}
    </li>
  );
}

/** A compact file picker for the upload dialog: drop a file on it or choose one. */
function FilePick({ file, onFile }: { file: File | null; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const f = event.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div
      className={`rpick ${over ? 'is-over' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <span className="rpick__icon" aria-hidden="true">
        <IconResume size={20} />
      </span>
      <span className="rpick__text">
        {file ? (
          <>
            <span className="rpick__name">{file.name}</span>
            <span className="rpick__hint num">{fileSize(file.size)}</span>
          </>
        ) : (
          <>
            <span className="rpick__name">{over ? 'Let go to add it' : 'Drop a resume here'}</span>
            <span className="rpick__hint">PDF or Word, up to 10 MB</span>
          </>
        )}
      </span>
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => input.current?.click()} data-autofocus>
        <IconUpload size={14} />
        {file ? 'Change' : 'Choose a file'}
      </button>
      <input
        ref={input}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const f = event.target.files?.[0];
          event.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

function UploadDialog({ open, onClose, onUpload, first }: {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, options: { label: string; activate: boolean }) => Promise<void>;
  /** No default yet: the upload becomes it whatever the box says. */
  first: boolean;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [activate, setActivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setLabel('');
    setActivate(false);
    setError(null);
    setBusy(false);
  }, [open]);

  async function submit() {
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    const bad = checkResumeFile(file);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUpload(file, { label: label.trim(), activate: activate || first });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`} className="smalldialog rupload">
      <header className="smalldialog__head">
        <h2 id={`${id}-title`}>Upload a resume</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </header>
      <FilePick
        file={file}
        onFile={(f) => {
          setFile(f);
          setError(checkResumeFile(f));
        }}
      />
      <div className="field">
        <label className="field__label" htmlFor={`${id}-label`}>
          Label
        </label>
        <input id={`${id}-label`} className="input" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder="ML, Backend, Data" />
      </div>
      {first ? (
        <p className="rupload__note">Becomes the default for applications and search.</p>
      ) : (
        <label className="check check--text rupload__default">
          <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
          <CheckBox />
          <span>
            Make it the default
            <span className="rupload__hint">
              {activate ? 'Applications send it, and the agent searches again with it, so your jobs get scored again.' : 'Off: the agent only reads it and keeps it here. Your search and scores stay as they are.'}
            </span>
          </span>
        </label>
      )}
      {error ? (
        <p className="form-msg form-msg--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="smalldialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={busy || !file}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconUpload size={15} />}
          {busy ? 'Uploading' : 'Upload'}
        </button>
      </div>
    </Dialog>
  );
}

/** A yes or no before something that cannot be taken back or that re-scores the jobs. */
function Confirm({ ask, onClose }: {
  ask: { title: string; text: string; action: string; danger?: boolean; run: () => Promise<void> } | null;
  onClose: () => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(ask);
  if (ask) last.current = ask;
  const shown = last.current;
  useEffect(() => {
    if (ask) {
      setBusy(false);
      setError(null);
    }
  }, [ask]);
  return (
    <Dialog open={ask !== null} onClose={onClose} labelledBy={`${id}-title`} className="smalldialog">
      {shown ? (
        <>
          <header className="smalldialog__head">
            <h2 id={`${id}-title`}>{shown.title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <IconX size={18} />
            </button>
          </header>
          <p className="smalldialog__text">{shown.text}</p>
          {error ? (
            <p className="form-msg form-msg--error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="smalldialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose} data-autofocus>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${shown.danger ? 'btn--danger' : 'btn--primary'}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await shown.run();
                  onClose();
                } catch (err) {
                  setError(errorText(err));
                  setBusy(false);
                }
              }}
            >
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {shown.action}
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

/** The Resumes card on the Profile page. */
export function ResumeLibrary({ rows, loading, missing, agentName, jobsFound, now, online, actions, toast, onSetup }: ResumeLibraryProps) {
  const [open, setOpen] = useState<ResumeRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [ask, setAsk] = useState<Parameters<typeof Confirm>[0]['ask']>(null);
  const [switching, setSwitching] = useState<number | null>(null);

  const ordered = byNewest(rows);
  const current = ordered.find((r) => r.status === 'active') ?? null;
  const list = current ? [current, ...ordered.filter((r) => r.id !== current.id)] : ordered;

  // The asked-for default became the default: say so, and stop showing it as on its way.
  useEffect(() => {
    if (switching === null) return;
    const row = rows.find((r) => r.id === switching);
    if (!row) setSwitching(null);
    else if (row.status === 'active') {
      setSwitching(null);
      toast({ tone: 'ok', title: 'Default resume changed', detail: row.label || row.name });
    }
  }, [rows, switching, toast]);

  const name = (row: ResumeRow) => (row.label ? `${row.label} (${row.name})` : row.name);

  const askDefault = (row: ResumeRow) =>
    setAsk({
      title: 'Make it the default?',
      text: `${name(row)} goes with every application from now on. The agent searches again with what it read from it, so your jobs get scored again.`,
      action: 'Make default',
      run: async () => {
        await actions.makeDefault(row);
        setSwitching(row.id);
        toast({ tone: 'ok', title: online ? 'Switching the default resume' : 'Queued for the agent', detail: 'The agent searches again with it.' });
      },
    });

  const askDelete = (row: ResumeRow) =>
    setAsk({
      title: 'Delete this resume?',
      text: `${name(row)} and what the agent read from it go away. The default resume stays.`,
      action: 'Delete',
      danger: true,
      run: async () => {
        await actions.remove(row);
        toast({ tone: 'ok', title: 'Resume deleted', detail: row.name });
      },
    });

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
  } else if (list.length === 0) {
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
            <button type="button" className="btn btn--primary btn--sm" onClick={onSetup}>
              <IconUpload size={14} />
              Upload resume
            </button>
          </div>
        ) : null}
      </div>
    );
  } else {
    body = (
      <ul className="rlib">
        {list.map((row) => (
          <ResumeItem
            key={row.id}
            row={row}
            isDefault={row.id === current?.id}
            switching={switching === row.id}
            now={now}
            online={online}
            jobsFound={jobsFound}
            onOpen={() => setOpen(row)}
            onMakeDefault={() => askDefault(row)}
            onDelete={() => askDelete(row)}
            onLabel={async (label) => {
              try {
                await actions.setLabel(row, label);
              } catch (err) {
                toast({ tone: 'error', title: 'Label not saved', detail: errorText(err) });
                throw err;
              }
            }}
          />
        ))}
      </ul>
    );
  }

  return (
    <>
      <Group
        title={
          <span className="group__titlewrap">
            Resumes
            <span className="group__sub">The default goes with every application. Keep others for different kinds of roles.</span>
          </span>
        }
        aside={
          !missing && !loading && list.length > 0 ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setUploading(true)}>
              <IconUpload size={14} />
              Upload another
            </button>
          ) : null
        }
      >
        {body}
      </Group>
      <ResumeDialog resume={open} onClose={() => setOpen(null)} />
      <UploadDialog
        open={uploading}
        onClose={() => setUploading(false)}
        first={!current}
        onUpload={async (file, options) => {
          await actions.upload(file, options);
          toast({ tone: 'ok', title: `Uploaded ${file.name}`, detail: options.activate || !current ? 'The agent reads it, then makes it the default.' : 'The agent reads it next. The default stays.' });
        }}
      />
      <Confirm ask={ask} onClose={() => setAsk(null)} />
    </>
  );
}
