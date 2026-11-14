import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { JobRow } from '../../lib/types';
import type { Profile } from '../../lib/profile';
import { errorText } from '../../lib/errors';
import { displayName, timeAgo } from '../../lib/format';
import {
  DEFAULT_TEMPLATE,
  FIELDS,
  GEN_END,
  GEN_START,
  SAMPLE_JOB,
  STARTER_BODY,
  checkTemplate,
  contactsOf,
  fillSample,
  isSubjectLine,
  letterParagraphs,
  newTemplateId,
  pieces,
  sampleFields,
  senderFrom,
  slotNames,
  type ContactKind,
  type CoverLetterRow,
  type CoverSettings,
  type CoverTemplate,
  type Sender,
} from '../../lib/coverLetter';
import {
  deleteCoverTemplate,
  saveCoverLetter,
  saveCoverSettings,
  saveCoverTemplate,
  sendCoverLetters,
  useCoverLetters,
  useCoverSettings,
  useCoverTemplates,
} from '../../hooks/useCoverLetters';
import type { LiveTable } from '../../hooks/useLiveTable';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, SkeletonCards } from '../common';
import { Dialog } from '../Dialog';
import { Shimmer } from '../motion';
import { Switch } from '../settings';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFile,
  IconGithub,
  IconLetter,
  IconLink,
  IconLinkedin,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSpark,
  IconTrash,
  IconX,
} from '../Icons';
import { SetupCard } from '../SetupCard';
import type { ToastTone } from '../Toasts';

type Toast = (toast: { tone: ToastTone; title: string; detail?: string }) => void;
type Draft = { id: string; name: string; description: string; body: string; isNew: boolean };

/** What the page reads. The container below fills it from Supabase; the preview fills it with mock rows. */
export interface LettersData {
  templates: LiveTable<CoverTemplate>;
  settings: LiveTable<CoverSettings> & { settings: CoverSettings | null };
  letters: LiveTable<CoverLetterRow>;
}

/** What the page writes. */
export interface LettersActions {
  saveSettings: (enabled: boolean, templateId: string) => Promise<void>;
  saveTemplate: (template: Pick<CoverTemplate, 'id' | 'name' | 'description' | 'body'>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  saveLetter: (jobId: string, body: string) => Promise<void>;
  /** Asks the agent for letters; `fresh` drops the kept ones first. Without it the agent only renders the PDF again. */
  sendLetters: (jobIds: string[], fresh: boolean) => Promise<void>;
}

export const LIVE_ACTIONS: LettersActions = {
  saveSettings: saveCoverSettings,
  saveTemplate: saveCoverTemplate,
  deleteTemplate: deleteCoverTemplate,
  saveLetter: saveCoverLetter,
  sendLetters: sendCoverLetters,
};

interface LettersViewProps {
  data: LettersData;
  actions: LettersActions;
  jobs: JobRow[];
  online: boolean;
  now: number;
  toast: Toast;
  /** Fills the letterhead and fields of the sample letter; without it the sample uses a made-up person. */
  profile?: Profile | null;
}

/** The template as the page it becomes: fixed text in a serif, fields as chips, slots as the notes the agent writes from. */
function Paper({ body }: { body: string }) {
  const all = pieces(body);
  return (
    <div className="cl-paper" aria-label="Template preview">
      {all.map((piece, index) => {
        if (piece.kind === 'text') {
          // A slot is drawn as its own block: the line breaks around it in the template would add a blank line each.
          let text = piece.text;
          if (all[index + 1]?.kind === 'slot') text = text.replace(/\n$/, '');
          if (all[index - 1]?.kind === 'slot') text = text.replace(/^\n/, '');
          return <span key={index}>{text}</span>;
        }
        if (piece.kind === 'field')
          return (
            <span key={index} className="cl-field" title={`{{${piece.name}}}, filled from your profile or the job`}>
              {piece.label}
            </span>
          );
        return (
          <span key={index} className="cl-slot" title="Written for each job">
            <span className="cl-slot__name">
              <IconSpark size={12} /> {piece.name.replace(/_/g, ' ')}
            </span>
            {piece.instruction || 'Two to four sentences.'}
          </span>
        );
      })}
    </div>
  );
}

const CONTACT_ICONS: Record<ContactKind, (props: { size?: number }) => ReactNode> = {
  location: IconMapPin,
  phone: IconPhone,
  email: IconMail,
  linkedin: IconLinkedin,
  github: IconGithub,
};

/** A letter's text as lines, with the generated parts (between GEN_START and GEN_END) marked. */
function letterBody(paragraphs: string[]): ReactNode[] {
  let generated = false;
  return paragraphs.map((paragraph, pi) => (
    <p key={pi}>
      {paragraph.split('\n').map((line, li) => {
        const parts: ReactNode[] = [];
        line.split(/([\u0002\u0003])/).forEach((part, k) => {
          if (part === GEN_START) generated = true;
          else if (part === GEN_END) generated = false;
          else if (part) parts.push(generated ? <mark key={k} className="cl-gen">{part}</mark> : <Fragment key={k}>{part}</Fragment>);
        });
        const subject = isSubjectLine(line.split(GEN_START).join('').split(GEN_END).join(''));
        return (
          <Fragment key={li}>
            {li ? <br /> : null}
            {subject ? <strong>{parts}</strong> : parts}
          </Fragment>
        );
      })}
    </p>
  ));
}

/** A letter on its page as the PDF draws it: the letterhead from the profile, then the letter in Times New Roman. */
function Sheet({ text, sender, marked }: { text: string; sender: Sender; marked: boolean }) {
  const contacts = contactsOf(sender);
  return (
    <article className={`cl-sheet ${marked ? '' : 'is-plain'}`} aria-label="Letter preview">
      <header className="cl-sheet__head">
        {sender.full_name ? <p className="cl-sheet__name">{sender.full_name}</p> : null}
        {sender.tagline ? <p className="cl-sheet__tag">{sender.tagline}</p> : null}
        {contacts.length ? (
          <ul className="cl-sheet__contacts">
            {contacts.map((c) => {
              const Icon = CONTACT_ICONS[c.kind];
              return (
                <li key={c.kind}>
                  <Icon size={12} /> {c.text}
                </li>
              );
            })}
          </ul>
        ) : null}
      </header>
      <div className="cl-sheet__body">{letterBody(letterParagraphs(text, sender.full_name))}</div>
    </article>
  );
}

type PreviewTab = 'template' | 'sample' | 'latest';
type PreviewOpen = { id: string; tab: PreviewTab };

interface PreviewProps {
  template: CoverTemplate;
  tab: PreviewTab;
  sender: Sender;
  /** The newest real letter from this template, when there is one. */
  latest: { letter: CoverLetterRow; job: JobRow | undefined } | null;
  now: number;
  inUse: boolean;
  onTab: (tab: PreviewTab) => void;
  onUse: () => void;
  onOpenLetter: (jobId: string) => void;
  onClose: () => void;
}

function PreviewView({ template, tab, sender, latest, now, inUse, onTab, onUse, onOpenLetter, onClose }: PreviewProps) {
  const [marked, setMarked] = useState(true);
  const sample = useMemo(() => fillSample(template.id, template.body, sampleFields(sender)), [template.id, template.body, sender]);
  const shown: PreviewTab = tab === 'latest' && !latest ? 'sample' : tab;
  const latestName = latest ? (latest.job ? displayName(latest.job) : latest.letter.job_id) : '';
  return (
    <>
      <header className="letterview__head">
        <span className="cl-preview__icon" aria-hidden="true">
          <IconLetter size={18} />
        </span>
        <div className="letterview__who">
          <h2 id="template-preview-title">{template.name}</h2>
          <span>{template.description || 'Custom template'}</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview" title="Close" data-autofocus>
          <IconX size={18} />
        </button>
      </header>
      <div className="letterview__tabs">
        <PillGroup<PreviewTab>
          label="Preview"
          value={shown}
          onChange={onTab}
          options={[
            { value: 'template', label: 'Template' },
            { value: 'sample', label: 'Sample letter' },
            ...(latest ? [{ value: 'latest' as const, label: 'Latest letter', title: latestName }] : []),
          ]}
        />
        {shown === 'sample' ? (
          <label className="cl-preview__mark">
            <input type="checkbox" checked={marked} onChange={(e) => setMarked(e.target.checked)} /> Mark generated parts
          </label>
        ) : null}
      </div>
      <div className="letterview__body">
        {shown === 'template' ? (
          <>
            <p className="cl-legend">
              <span className="cl-field">Field</span> Profile or job
              <span className="cl-slot cl-slot--inline">
                <IconSpark size={12} /> Generated
              </span>
              Written per job
            </p>
            <Paper body={template.body} />
          </>
        ) : shown === 'sample' ? (
          <>
            <p className="cl-preview__note">
              <IconSpark size={13} /> Sample for {SAMPLE_JOB.job_title} at {SAMPLE_JOB.company}. The agent writes the marked parts from your CV and each posting.
            </p>
            <Sheet text={sample} sender={sender} marked={marked} />
          </>
        ) : latest ? (
          <>
            <p className="cl-preview__note">
              {latestName}
              {latest.job ? ` · ${latest.job.title}` : ''} · {timeAgo(latest.letter.updated_at, now)}
            </p>
            <Sheet text={latest.letter.body} sender={sender} marked={false} />
          </>
        ) : null}
      </div>
      <footer className="letterview__foot">
        <span className="savestate" title="Generated parts">
          <IconSpark size={13} /> {slotNames(template.body).length} generated
        </span>
        {shown === 'latest' && latest ? (
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpenLetter(latest.letter.job_id)}>
            <IconPencil size={14} /> Open letter
          </button>
        ) : null}
        <button type="button" className="btn btn--primary btn--sm" disabled={inUse} onClick={onUse}>
          <IconCheck size={14} /> {inUse ? 'In use' : 'Use template'}
        </button>
      </footer>
    </>
  );
}

/** The template, a sample letter made from it, and its newest real letter, over the page. */
function PreviewDialog({ view, onClose }: { view: Omit<PreviewProps, 'onClose'> | null; onClose: () => void }) {
  const last = useRef(view);
  if (view) last.current = view;
  const shown = last.current;
  return (
    <Dialog open={view !== null} onClose={onClose} labelledBy="template-preview-title" className="letterview cl-preview">
      {shown ? <PreviewView key={shown.template.id} {...shown} onClose={onClose} /> : null}
    </Dialog>
  );
}

function Editor({ draft, onChange, onSave, onCancel, saving }: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const nameId = useId();
  const descId = useId();
  const bodyId = useId();
  const problems = checkTemplate(draft.name, draft.body);

  function insert(text: string) {
    const el = area.current;
    const at = el ? el.selectionStart : draft.body.length;
    const end = el ? el.selectionEnd : draft.body.length;
    onChange({ ...draft, body: draft.body.slice(0, at) + text + draft.body.slice(end) });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  }

  return (
    <div className="cl-editor">
      <div className="grid-fields">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Name
          </label>
          <input id={nameId} className="input" value={draft.name} maxLength={60} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={descId}>
            Use for
          </label>
          <input id={descId} className="input" value={draft.description} maxLength={140} placeholder="Startups, internships" onChange={(e) => onChange({ ...draft, description: e.target.value })} />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Insert</span>
        <div className="choice">
          {Object.entries(FIELDS).map(([name, label]) => (
            <button key={name} type="button" className="choice__btn cl-chip press" title={`{{${name}}}`} onClick={() => insert(`{{${name}}}`)}>
              {label}
            </button>
          ))}
          <button type="button" className="choice__btn cl-chip cl-chip--slot press" onClick={() => insert('{{new_part: what to write here}}')}>
            <IconSpark size={13} /> Generated part
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={bodyId}>
          Template
        </label>
        <textarea id={bodyId} ref={area} className="input textarea cl-body" rows={16} spellCheck={false} value={draft.body} onChange={(e) => onChange({ ...draft, body: e.target.value })} />
        <span className="field__hint">{'{{part: note}}'} is generated for each job.</span>
      </div>

      {problems.length ? (
        <ul className="cl-problems" role="alert">
          {problems.map((p) => (
            <li key={p}>
              <IconAlert size={14} /> {p}
            </li>
          ))}
        </ul>
      ) : (
        <Paper body={draft.body} />
      )}

      <footer className="cl-foot">
        <span className="savestate" title="Generated parts">
          <IconSpark size={13} /> {slotNames(draft.body).length}
        </span>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={onSave} disabled={problems.length > 0 || saving}>
          {saving ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />}
          Save
        </button>
      </footer>
    </div>
  );
}

/** One row in the rail. The letter itself opens at reading width in a dialog. */
function LetterItem({ letter, job, templateName, now, open, onOpen, index }: {
  letter: CoverLetterRow;
  job: JobRow | undefined;
  templateName: string;
  now: number;
  open: boolean;
  onOpen: () => void;
  index: number;
}) {
  const name = job ? displayName(job) : letter.job_id;
  return (
    <li className={`cl-letter ${open ? 'is-open' : ''} ${index % 2 === 0 ? 'is-striped' : ''}`}>
      <button type="button" className="cl-letter__head press" onClick={onOpen} aria-haspopup="dialog" title="Read and edit">
        <CompanyLogo name={name} domain={job?.company_domain} size={32} />
        <span className="cl-letter__what">
          <span className="cl-letter__top">
            <strong>{name}</strong>
            <time className="num">{timeAgo(letter.updated_at, now)}</time>
          </span>
          <span className="cl-letter__role">{job ? job.title : ''}</span>
          <span className="cl-letter__tags">
            {letter.pdf_path ? (
              <span className="pdfmark" title="PDF ready">
                PDF
              </span>
            ) : null}
            {letter.updated_by === 'web' ? <span className="tag tag--gray">Edited</span> : null}
            {letter.problems ? (
              <span className="tag tag--yellow" title={letter.problems}>
                Review
              </span>
            ) : null}
            <span className="cl-letter__tpl" title="Template">
              {templateName}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

interface LetterViewProps {
  letter: CoverLetterRow;
  job: JobRow | undefined;
  templateName: string;
  online: boolean;
  toast: Toast;
  actions: LettersActions;
  onChanged: () => void;
}

/** Waiting for the agent to render the PDF: first for our own save to land, then for the agent's newer row. */
type PdfWait = { phase: 'save' | 'render'; at: string } | null;

function PdfPane({ letter, name, online, wait, onMake, busy }: { letter: CoverLetterRow; name: string; online: boolean; wait: PdfWait; onMake: () => void; busy: boolean }) {
  const { url, failed } = useSignedUrl(letter.pdf_path, letter.updated_at);
  const file = `${name} cover letter.pdf`;
  const { url: downloadUrl } = useSignedUrl(letter.pdf_path, letter.updated_at, file);
  if (!letter.pdf_path) {
    return (
      <div className="pdfpane pdfpane--empty">
        <span className="pdfpane__icon" aria-hidden="true">
          <IconLetter size={26} />
        </span>
        <p className="pdfpane__title">No PDF yet</p>
        <p className="pdfpane__text">The agent makes the PDF with the letter.</p>
        {wait ? (
          <p className="pdfpane__text">{online ? <Shimmer>Making the PDF</Shimmer> : 'The PDF is made when the agent is online.'}</p>
        ) : (
          <button type="button" className="btn btn--brand btn--sm" onClick={onMake} disabled={busy}>
            Make PDF
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="pdfpane">
      <div className="pdfpane__bar">
        {wait ? (
          <span className="pdfpane__note">{online ? <Shimmer>Updating the PDF</Shimmer> : 'PDF updates when the agent is online'}</span>
        ) : (
          <span className="pdfpane__note">The PDF the agent attaches</span>
        )}
        {url ? (
          <a className="btn btn--secondary btn--sm" href={url} target="_blank" rel="noreferrer">
            <IconLink size={14} />
            <span className="hide-sm">Open in new tab</span>
          </a>
        ) : null}
        {downloadUrl ? (
          <a className="btn btn--secondary btn--sm" href={downloadUrl} download={file}>
            <IconDownload size={14} />
            <span className="hide-sm">Download</span>
          </a>
        ) : null}
      </div>
      {failed ? (
        <p className="pdfpane__text">The PDF could not be opened.</p>
      ) : url ? (
        <iframe className="pdfpane__frame" src={url} title={`Cover letter PDF for ${name}`} />
      ) : (
        <span className="skeleton pdfpane__skel" aria-hidden="true" />
      )}
    </div>
  );
}

/** The letter on paper, editable, or its PDF. Keyed by job, so another letter starts clean. */
function LetterView({ letter, job, templateName, online, toast, actions, onChanged, onClose }: LetterViewProps & { onClose: () => void }) {
  const [text, setText] = useState(letter.body);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'text' | 'pdf'>('text');
  const [wait, setWait] = useState<PdfWait>(null);
  const dirty = text !== letter.body;

  useEffect(() => {
    // A new letter from the agent replaces the text, never an edit not saved yet.
    if (!dirty) setText(letter.body);
  }, [letter.body]);

  useEffect(() => {
    if (!wait || letter.updated_at === wait.at) return;
    if (wait.phase === 'save') setWait({ phase: 'render', at: letter.updated_at });
    else setWait(null);
  }, [letter.updated_at]);

  async function save() {
    setBusy(true);
    const before = letter.updated_at;
    try {
      await actions.saveLetter(letter.job_id, text);
      // The agent renders the PDF again from the edited text; no AI call.
      await actions.sendLetters([letter.job_id], false);
      setWait({ phase: 'save', at: before });
      toast({ tone: 'ok', title: 'Letter saved', detail: online ? 'Updating the PDF' : 'PDF updates when the agent is online' });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save letter', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function makePdf() {
    setBusy(true);
    try {
      await actions.sendLetters([letter.job_id], false);
      setWait({ phase: 'render', at: letter.updated_at });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not ask for the PDF', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    setBusy(true);
    try {
      await actions.sendLetters([letter.job_id], true);
      toast({ tone: 'ok', title: online ? 'Rewriting letter' : 'Rewrite queued' });
      onChanged();
      onClose();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not rewrite letter', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  const name = job ? displayName(job) : letter.job_id;
  return (
    <>
      <header className="letterview__head">
        <CompanyLogo name={name} domain={job?.company_domain} size={38} />
        <div className="letterview__who">
          <h2 id="letter-title">{name}</h2>
          <span>{job ? job.title : ''}</span>
        </div>
        <span className="tag tag--gray hide-sm" title="Template">
          {templateName}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close letter" title="Close" data-autofocus>
          <IconX size={18} />
        </button>
      </header>
      <div className="letterview__tabs">
        <PillGroup<'text' | 'pdf'>
          label="Show the letter as"
          value={view}
          onChange={setView}
          options={[
            { value: 'text', label: 'Text' },
            { value: 'pdf', label: 'PDF' },
          ]}
        />
        {wait && view === 'text' ? <span className="pdfpane__note">{online ? <Shimmer>Updating the PDF</Shimmer> : 'PDF updates when the agent is online'}</span> : null}
      </div>
      <div className="letterview__body">
        {view === 'text' ? (
          <>
            <textarea className="input textarea cl-letter__text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Letter text" spellCheck />
            {letter.problems ? <p className="cl-letter__warn">Review: {letter.problems}</p> : null}
          </>
        ) : (
          <PdfPane letter={letter} name={name} online={online} wait={wait} onMake={() => void makePdf()} busy={busy} />
        )}
      </div>
      <footer className="letterview__foot">
        <span className="savestate">{dirty ? 'Unsaved changes' : letter.updated_by === 'web' ? 'Edited' : ''}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={again} disabled={busy} title="Replace with a new letter">
          Rewrite
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={!dirty || busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={14} />} Save
        </button>
      </footer>
    </>
  );
}

/** A letter at reading width over the page; the rail stays the list. */
function LetterDialog({ view, onClose }: { view: LetterViewProps | null; onClose: () => void }) {
  // Keep showing the last letter while the dialog animates out.
  const last = useRef(view);
  if (view) last.current = view;
  const shown = last.current;
  return (
    <Dialog open={view !== null} onClose={onClose} labelledBy="letter-title" className="letterview">
      {shown ? <LetterView key={shown.letter.job_id} {...shown} onClose={onClose} /> : null}
    </Dialog>
  );
}

/** The page's content: the templates on the left, the letters in the rail. */
export function LettersView({ data, actions, jobs, online, now, toast, profile }: LettersViewProps) {
  const { templates: templatesT, settings: settingsT, letters: lettersT } = data;
  const templates = useMemo(() => [...templatesT.rows].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)), [templatesT.rows]);
  const letters = useMemo(() => [...lettersT.rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), [lettersT.rows]);
  const enabled = settingsT.settings?.enabled ?? true;
  const inUse = settingsT.settings?.template_id ?? DEFAULT_TEMPLATE;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [openLetter, setOpenLetter] = useState<string | null>(null);

  const focused = templates.find((t) => t.id === (focusId ?? inUse)) ?? templates[0];
  // The open letter, read fresh from the live rows; it closes on its own if the letter goes away.
  const opened = openLetter ? letters.find((l) => l.job_id === openLetter) ?? null : null;
  const names = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const [preview, setPreview] = useState<PreviewOpen | null>(null);
  const sender = useMemo(() => senderFrom(profile?.personal, profile?.education), [profile]);
  const previewed = preview ? templates.find((t) => t.id === preview.id) ?? null : null;
  // letters is newest first, so the first one from the template is its latest.
  const previewLatest = previewed ? letters.find((l) => l.template_id === previewed.id && l.body.trim()) ?? null : null;

  const reloadAll = () => {
    templatesT.reload();
    settingsT.reload();
    lettersT.reload();
  };

  async function choose(templateId: string, on: boolean) {
    try {
      await actions.saveSettings(on, templateId);
      settingsT.reload();
      toast({ tone: 'ok', title: on ? `Using "${names.get(templateId) ?? templateId}"` : 'Cover letters off' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save setting', detail: errorText(error) });
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      await actions.saveTemplate({ id: draft.id, name: draft.name.trim(), description: draft.description.trim(), body: draft.body });
      setFocusId(draft.id);
      setDraft(null);
      templatesT.reload();
      toast({ tone: 'ok', title: 'Template saved' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save template', detail: errorText(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: CoverTemplate) {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    try {
      await actions.deleteTemplate(template.id);
      if (template.id === inUse) await actions.saveSettings(enabled, DEFAULT_TEMPLATE);
      setFocusId(null);
      reloadAll();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not delete template', detail: errorText(error) });
    }
  }

  const missing = [templatesT, settingsT, lettersT].find((t) => t.error?.kind === 'missing-table');
  if (missing) return <SetupCard table="automation_cover_templates" />;

  return (
    <div className="page page--letters">
      <div className="cl-main">
        <section className="cl-card" aria-label="Cover letter templates">
          <label className="card srow srow--toggle cl-attach">
            <span className="srow__text">
              <span className="srow__title">Attach letters</span>
              <span className="srow__desc">{enabled ? `Every application gets a letter from "${names.get(inUse) ?? inUse}".` : 'Off. Applications go without a letter.'}</span>
            </span>
            <span className="srow__control">
              <Switch checked={enabled} onChange={(on) => void choose(inUse, on)} label="Attach letters" />
            </span>
          </label>

          {templatesT.loading && templates.length === 0 ? <SkeletonCards count={2} check={false} /> : null}
          {!templatesT.loading && templates.length === 0 ? <p className="cl-empty">No templates yet.</p> : null}

          <div className="cl-gallery stagger" role="list">
            {templates.map((t) => {
              const on = t.id === focused?.id && !draft;
              return (
                <div key={t.id} role="listitem" className={`card cl-tile ${on ? 'is-focus' : ''} ${t.id === inUse ? 'is-used' : ''}`}>
                  <button
                    type="button"
                    className="cl-tile__pick"
                    aria-pressed={on}
                    onClick={() => {
                      setDraft(null);
                      setFocusId(t.id);
                    }}
                  >
                    <span className="cl-tile__top">
                      <span className="cl-tile__name">{t.name}</span>
                      {t.id === inUse ? <span className="tag tag--ember">{enabled ? 'In use' : 'Selected'}</span> : null}
                    </span>
                    <span className="cl-tile__desc">{t.description || 'Custom template'}</span>
                  </button>
                  <span className="cl-tile__foot">
                    <span className="cl-tile__meta" title="Generated parts">
                      {t.builtin ? 'Built in' : 'Custom'} · <IconSpark size={11} /> {slotNames(t.body).length}
                    </span>
                    <span className="cl-tile__previews">
                      <button type="button" className="cl-tile__btn press" onClick={() => setPreview({ id: t.id, tab: 'template' })} aria-label={`Preview template ${t.name}`}>
                        <IconFile size={13} /> <span className="cl-long">Preview template</span><span className="cl-short">Template</span>
                      </button>
                      <button type="button" className="cl-tile__btn press" onClick={() => setPreview({ id: t.id, tab: 'sample' })} aria-label={`Preview a cover letter from ${t.name}`}>
                        <IconLetter size={13} /> <span className="cl-long">Preview letter</span><span className="cl-short">Letter</span>
                      </button>
                    </span>
                  </span>
                </div>
              );
            })}
            <button
              type="button"
              className="cl-tile cl-tile--new press"
              onClick={() => setDraft({ id: newTemplateId('mine'), name: '', description: '', body: STARTER_BODY, isNew: true })}
            >
              <IconPlus size={18} />
              <span className="cl-tile__name">New template</span>
            </button>
          </div>
        </section>

        <section className="card cl-card cl-card--paper" aria-label={draft ? 'Edit template' : 'Template preview'}>
          {draft ? (
            <Editor draft={draft} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} saving={saving} />
          ) : focused ? (
            <>
              <div className="card__head">
                <div>
                  <h2 className="card__title">{focused.name}</h2>
                  <p className="cl-sub">{focused.description}</p>
                </div>
                <div className="cl-actions">
                  {focused.builtin ? null : (
                    <>
                      <button type="button" className="icon-btn" onClick={() => void remove(focused)} aria-label={`Delete ${focused.name}`} title="Delete">
                        <IconTrash size={15} />
                      </button>
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDraft({ ...focused, isNew: false })}>
                        <IconPencil size={14} /> Edit
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setDraft({ id: newTemplateId(focused.name), name: `${focused.name} (mine)`, description: focused.description, body: focused.body, isNew: true })}
                  >
                    <IconCopy size={14} /> Duplicate
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" disabled={focused.id === inUse && enabled} onClick={() => void choose(focused.id, true)}>
                    <IconCheck size={14} /> {focused.id === inUse && enabled ? 'In use' : 'Use template'}
                  </button>
                </div>
              </div>
              <p className="cl-legend">
                <span className="cl-field">Field</span> Profile or job
                <span className="cl-slot cl-slot--inline">
                  <IconSpark size={12} /> Generated
                </span>
                Written per job
              </p>
              <Paper body={focused.body} />
            </>
          ) : null}
        </section>
      </div>

      <aside className="cl-rail">
        <section className="card cl-letters" aria-labelledby="letters-title">
          <div className="card__head">
            <h2 className="card__title" id="letters-title">
              <span className="ibadge ibadge--sand" aria-hidden="true">
                <IconLetter size={15} />
              </span>
              Letters
            </h2>
            <span className="chip chip--count num">{letters.length}</span>
          </div>
          {lettersT.loading && letters.length === 0 ? <SkeletonCards count={3} check={false} /> : null}
          {!lettersT.loading && letters.length === 0 ? (
            <EmptyState compact friend="fox-laptop" title="No letters yet" text="Select jobs, then Write letters." />
          ) : (
            <ul className="cl-letter-list">
              {letters.map((letter, i) => (
                <LetterItem
                  key={letter.job_id}
                  index={i}
                  letter={letter}
                  job={jobsById.get(letter.job_id)}
                  templateName={names.get(letter.template_id) ?? letter.template_id}
                  now={now}
                  open={letter.job_id === openLetter}
                  onOpen={() => setOpenLetter(letter.job_id)}
                />
              ))}
            </ul>
          )}
        </section>
      </aside>

      <LetterDialog
        view={
          opened
            ? {
                letter: opened,
                job: jobsById.get(opened.job_id),
                templateName: names.get(opened.template_id) ?? opened.template_id,
                online,
                toast,
                actions,
                onChanged: lettersT.reload,
              }
            : null
        }
        onClose={() => setOpenLetter(null)}
      />

      <PreviewDialog
        view={
          previewed && preview
            ? {
                template: previewed,
                tab: preview.tab,
                sender,
                latest: previewLatest ? { letter: previewLatest, job: jobsById.get(previewLatest.job_id) } : null,
                now,
                inUse: previewed.id === inUse && enabled,
                onTab: (tab) => setPreview({ id: previewed.id, tab }),
                onUse: () => void choose(previewed.id, true),
                onOpenLetter: (jobId) => {
                  setPreview(null);
                  setOpenLetter(jobId);
                },
              }
            : null
        }
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

interface CoverLettersPageProps {
  userId: string;
  jobs: JobRow[];
  online: boolean;
  now: number;
  toast: Toast;
  profile?: Profile | null;
}

/** The page wired to Supabase. */
export function CoverLettersPage({ userId, jobs, online, now, toast, profile }: CoverLettersPageProps) {
  const templates = useCoverTemplates(userId);
  const settings = useCoverSettings(userId);
  const letters = useCoverLetters(userId);
  return <LettersView data={{ templates, settings, letters }} actions={LIVE_ACTIONS} jobs={jobs} online={online} now={now} toast={toast} profile={profile} />;
}

export default CoverLettersPage;
