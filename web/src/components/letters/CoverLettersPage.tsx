import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JobRow } from '../../lib/types';
import { errorText } from '../../lib/errors';
import { timeAgo } from '../../lib/format';
import {
  DEFAULT_TEMPLATE,
  FIELDS,
  STARTER_BODY,
  checkTemplate,
  newTemplateId,
  pieces,
  slotNames,
  type CoverLetterRow,
  type CoverTemplate,
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
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { EmptyState, SkeletonCards } from '../common';
import { IconAlert, IconCheck, IconCopy, IconLetter, IconLink, IconPencil, IconPlus, IconSpark, IconTrash } from '../Icons';
import { SetupCard } from '../SetupCard';
import type { ToastTone } from '../Toasts';

type Toast = (toast: { tone: ToastTone; title: string; detail?: string }) => void;
type Draft = { id: string; name: string; description: string; body: string; isNew: boolean };

interface CoverLettersPageProps {
  userId: string;
  jobs: JobRow[];
  online: boolean;
  now: number;
  toast: Toast;
}

/** The template as the page it becomes: fixed text in a serif, fields as chips, slots as the notes the agent writes from. */
function Paper({ body }: { body: string }) {
  return (
    <div className="cl-paper" aria-label="Template preview">
      {pieces(body).map((piece, index) => {
        if (piece.kind === 'text') return <span key={index}>{piece.text}</span>;
        if (piece.kind === 'field')
          return (
            <span key={index} className="cl-field" title={`{{${piece.name}}} comes from your profile or the job`}>
              {piece.label}
            </span>
          );
        return (
          <span key={index} className="cl-slot" title="The agent writes this part for each job">
            <span className="cl-slot__name">
              <IconSpark size={12} /> {piece.name.replace(/_/g, ' ')}
            </span>
            {piece.instruction || 'Two to four sentences that fit here.'}
          </span>
        );
      })}
    </div>
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
      <div className="prefs__grid">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Name
          </label>
          <input id={nameId} className="input" value={draft.name} maxLength={60} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={descId}>
            When to use it
          </label>
          <input
            id={descId}
            className="input"
            value={draft.description}
            maxLength={140}
            placeholder="Startups, design roles, internships..."
            onChange={(e) => onChange({ ...draft, description: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <span className="field__label">Insert</span>
        <div className="choice">
          {Object.entries(FIELDS).map(([name, label]) => (
            <button key={name} type="button" className="choice__btn cl-chip" title={`{{${name}}}`} onClick={() => insert(`{{${name}}}`)}>
              {label}
            </button>
          ))}
          <button type="button" className="choice__btn cl-chip cl-chip--slot" onClick={() => insert('{{new_part: what the agent should write here}}')}>
            <IconSpark size={13} /> Part the agent writes
          </button>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor={bodyId}>
          Template
        </label>
        <textarea
          id={bodyId}
          ref={area}
          className="input textarea cl-body"
          rows={16}
          spellCheck={false}
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
        <span className="field__hint">
          Text outside {'{{ }}'} is sent as you write it. A part like {'{{why_you: two sentences on the best match}}'} is written by the
          agent for each job, following your note.
        </span>
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

      <footer className="prefs__foot">
        <span className="savestate">{slotNames(draft.body).length} part(s) the agent writes</span>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={onSave} disabled={problems.length > 0 || saving}>
          {saving ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={16} />}
          {draft.isNew ? 'Save template' : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}

function PdfLink({ path, version }: { path: string; version: string }) {
  const { url, failed } = useSignedUrl(path, version);
  if (!path || failed) return null;
  if (!url) return <span className="spinner" aria-hidden="true" />;
  return (
    <a className="btn btn--secondary btn--sm" href={url} target="_blank" rel="noreferrer">
      <IconLink size={14} /> PDF
    </a>
  );
}

function LetterItem({ letter, job, templateName, now, online, toast, onChanged }: {
  letter: CoverLetterRow;
  job: JobRow | undefined;
  templateName: string;
  now: number;
  online: boolean;
  toast: Toast;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(letter.body);
  const [busy, setBusy] = useState(false);
  const dirty = text !== letter.body;

  useEffect(() => {
    // A new letter from the agent replaces the text, never an edit not saved yet.
    if (!dirty) setText(letter.body);
  }, [letter.body]);

  async function save() {
    setBusy(true);
    try {
      await saveCoverLetter(letter.job_id, text);
      toast({ tone: 'ok', title: 'Letter saved', detail: 'The agent sends your version with this application.' });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save the letter', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function again() {
    setBusy(true);
    try {
      await sendCoverLetters([letter.job_id], true);
      toast({ tone: 'ok', title: 'Writing it again', detail: online ? 'The new letter shows here in a moment.' : 'Queued for when the agent starts.' });
      onChanged();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not ask for a new letter', detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`cl-letter ${open ? 'is-open' : ''}`}>
      <button type="button" className="cl-letter__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="cl-letter__what">
          <strong>{job ? job.company : letter.job_id}</strong>
          <span>{job ? job.title : ''}</span>
        </span>
        <span className="cl-letter__meta">
          {letter.updated_by === 'web' ? <span className="softchip">edited by you</span> : null}
          {letter.problems ? (
            <span className="tag tag--dry" title={letter.problems}>
              check wording
            </span>
          ) : null}
          <span className="cl-letter__tpl">{templateName}</span>
          <time className="mono">{timeAgo(letter.updated_at, now)}</time>
        </span>
      </button>
      {open ? (
        <div className="cl-letter__body">
          <textarea className="input textarea cl-letter__text" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
          {letter.problems ? <p className="cl-letter__warn">The agent could not fix: {letter.problems}</p> : null}
          <div className="cl-actions">
            <PdfLink path={letter.pdf_path} version={letter.updated_at} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={again} disabled={busy}>
              Write again
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={!dirty || busy}>
              <IconCheck size={14} /> Save my version
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function CoverLettersPage({ userId, jobs, online, now, toast }: CoverLettersPageProps) {
  const templatesT = useCoverTemplates(userId);
  const settingsT = useCoverSettings(userId);
  const lettersT = useCoverLetters(userId);
  const templates = useMemo(
    () => [...templatesT.rows].sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name)),
    [templatesT.rows],
  );
  const letters = useMemo(() => [...lettersT.rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), [lettersT.rows]);
  const enabled = settingsT.settings?.enabled ?? true;
  const inUse = settingsT.settings?.template_id ?? DEFAULT_TEMPLATE;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const focused = templates.find((t) => t.id === (focusId ?? inUse)) ?? templates[0];
  const names = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates]);
  const jobsById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const reloadAll = () => {
    templatesT.reload();
    settingsT.reload();
    lettersT.reload();
  };

  async function choose(templateId: string, on: boolean) {
    try {
      await saveCoverSettings(on, templateId);
      settingsT.reload();
      toast({
        tone: 'ok',
        title: on ? `Using "${names.get(templateId) ?? templateId}"` : 'Cover letters off',
        detail: on ? 'Every application from now on gets a letter from this template.' : 'Applications go without a letter.',
      });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save the choice', detail: errorText(error) });
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      await saveCoverTemplate({ id: draft.id, name: draft.name.trim(), description: draft.description.trim(), body: draft.body });
      setFocusId(draft.id);
      setDraft(null);
      templatesT.reload();
      toast({ tone: 'ok', title: 'Template saved', detail: 'Press "Use this template" to have the agent fill it.' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save the template', detail: errorText(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: CoverTemplate) {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    try {
      await deleteCoverTemplate(template.id);
      if (template.id === inUse) await saveCoverSettings(enabled, DEFAULT_TEMPLATE);
      setFocusId(null);
      reloadAll();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not delete the template', detail: errorText(error) });
    }
  }

  const missing = [templatesT, settingsT, lettersT].find((t) => t.error?.kind === 'missing-table');
  if (missing) return <SetupCard table="automation_cover_templates" />;

  return (
    <div className="page page--prefs page--letters">
      <div className="cl-main">
        <section className="card cl-card" aria-label="Cover letter templates">
          <label className="row-switch row-switch--card">
            <span className="row-switch__text">
              <strong>Attach a cover letter to every application</strong>
              <span>
                {enabled
                  ? `The agent fills "${names.get(inUse) ?? inUse}" for each job, then uploads it or pastes it into the form.`
                  : 'Off: forms get no letter.'}
              </span>
            </span>
            <input type="checkbox" role="switch" checked={enabled} onChange={(e) => void choose(inUse, e.target.checked)} />
            <span className="switch" aria-hidden="true">
              <span className="switch__thumb" />
            </span>
          </label>

          {templatesT.loading && templates.length === 0 ? <SkeletonCards count={2} /> : null}
          {!templatesT.loading && templates.length === 0 ? (
            <p className="cl-empty">Start the agent once: it adds the bundled templates here. You can write your own now.</p>
          ) : null}

          <div className="cl-gallery" role="list">
            {templates.map((t) => {
              const on = t.id === focused?.id && !draft;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="listitem"
                  className={`cl-tile ${on ? 'is-focus' : ''} ${t.id === inUse ? 'is-used' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setDraft(null);
                    setFocusId(t.id);
                  }}
                >
                  <span className="cl-tile__top">
                    <span className="cl-tile__name">{t.name}</span>
                    {t.id === inUse ? <span className="cl-inuse">{enabled ? 'In use' : 'Picked'}</span> : null}
                  </span>
                  <span className="cl-tile__desc">{t.description || 'Your template'}</span>
                  <span className="cl-tile__foot">
                    {t.builtin ? 'Bundled' : 'Yours'} · {slotNames(t.body).length} parts written per job
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="cl-tile cl-tile--new"
              onClick={() => setDraft({ id: newTemplateId('mine'), name: '', description: '', body: STARTER_BODY, isNew: true })}
            >
              <IconPlus size={18} />
              <span className="cl-tile__name">New template</span>
            </button>
          </div>
        </section>

        <section className="card cl-card" aria-label={draft ? 'Edit template' : 'Template preview'}>
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
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => void remove(focused)} aria-label={`Delete ${focused.name}`}>
                        <IconTrash size={14} />
                      </button>
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDraft({ ...focused, isNew: false })}>
                        <IconPencil size={14} /> Edit
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() =>
                      setDraft({ id: newTemplateId(focused.name), name: `${focused.name} (mine)`, description: focused.description, body: focused.body, isNew: true })
                    }
                  >
                    <IconCopy size={14} /> Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={focused.id === inUse && enabled}
                    onClick={() => void choose(focused.id, true)}
                  >
                    <IconCheck size={14} /> {focused.id === inUse && enabled ? 'In use' : 'Use this template'}
                  </button>
                </div>
              </div>
              <p className="cl-legend">
                <span className="cl-field">Field</span> comes from your profile or the job.{' '}
                <span className="cl-slot cl-slot--inline">
                  <IconSpark size={12} /> Part
                </span>{' '}
                is written by the agent for each job.
              </p>
              <Paper body={focused.body} />
            </>
          ) : null}
        </section>
      </div>

      <aside className="prefs-side">
        <section className="card cl-card cl-letters" aria-labelledby="letters-title">
          <div className="card__head">
            <h2 className="card__title" id="letters-title">
              Written letters
            </h2>
            <span className="mono cl-count">{letters.length}</span>
          </div>
          {lettersT.loading && letters.length === 0 ? <SkeletonCards count={2} /> : null}
          {!lettersT.loading && letters.length === 0 ? (
            <EmptyState icon={<IconLetter size={22} />} title="No letters yet">
              Select jobs and press "Write letters" to read them before applying. Every application also gets its letter first.
            </EmptyState>
          ) : (
            <ul className="cl-letter-list">
              {letters.map((letter) => (
                <LetterItem
                  key={letter.job_id}
                  letter={letter}
                  job={jobsById.get(letter.job_id)}
                  templateName={names.get(letter.template_id) ?? letter.template_id}
                  now={now}
                  online={online}
                  toast={toast}
                  onChanged={lettersT.reload}
                />
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
