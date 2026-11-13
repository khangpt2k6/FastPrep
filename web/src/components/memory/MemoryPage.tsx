import { useMemo, useState, type ReactNode } from 'react';
import type { JobRow, MemoryRow } from '../../lib/types';
import { companyName, displayName } from '../../lib/format';
import { companyLookup } from '../../lib/overview';
import { errorText } from '../../lib/errors';
import { deleteAnswer, editAnswer, setPinned, teachAnswer } from '../../hooks/useAutomationData';
import type { LiveTable } from '../../hooks/useLiveTable';
import { Dialog } from '../Dialog';
import { AnimatePresence } from 'motion/react';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, SkeletonCards } from '../common';
import { IconPlus, IconSearch, IconX } from '../Icons';
import { SetupCard } from '../SetupCard';
import type { ToastInput } from '../Toasts';
import { MemoryCard } from './MemoryCard';

type Filter = 'all' | 'learned' | 'user' | 'pinned';

interface MemoryPageProps {
  memory: LiveTable<MemoryRow>;
  now: number;
  /** From the answers button on an application: only that job's answers. */
  job: { id: string; company: string; domain?: string } | null;
  onClearJob: () => void;
  toast: (toast: ToastInput) => void;
  /** The jobs, for company names and logos. */
  jobs?: JobRow[];
}

function TeachDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!question.trim() || !answer.trim()) {
      setError('Enter a question and an answer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teachAnswer(question.trim(), answer.trim());
      setQuestion('');
      setAnswer('');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="teach-title" className="smalldialog">
      <header className="smalldialog__head">
        <h2 id="teach-title">New answer</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </header>
      <div className="field">
        <label className="field__label" htmlFor="teach-q">
          Question
        </label>
        <input
          id="teach-q"
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why do you want to work here?"
          data-autofocus
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="teach-a">
          Answer
        </label>
        <textarea
          id="teach-a"
          className="input textarea"
          rows={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer"
        />
      </div>
      {error ? (
        <p className="form-msg form-msg--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="smalldialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconPlus size={15} />}
          Save
        </button>
      </div>
    </Dialog>
  );
}

const NO_JOBS: JobRow[] = [];

export function MemoryPage({ memory, now, job, onClearJob, toast, jobs = NO_JOBS }: MemoryPageProps) {
  // Company names and logos as the other pages show them: through the row's job, else by name.
  const byId = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const lookup = useMemo(() => companyLookup(jobs), [jobs]);
  const companyOf = (row: MemoryRow) => {
    const hit = row.job_id ? byId.get(row.job_id) : undefined;
    if (hit) return { name: displayName(hit), domain: hit.company_domain };
    return row.company ? lookup(row.company) ?? lookup(companyName(row.company)) : null;
  };
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [teaching, setTeaching] = useState(false);
  const [doomed, setDoomed] = useState<MemoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scoped = useMemo(() => (job ? memory.rows.filter((r) => r.job_id === job.id) : memory.rows), [memory.rows, job]);

  const counts = useMemo(
    () => ({
      all: scoped.length,
      learned: scoped.filter((r) => r.source === 'learned').length,
      user: scoped.filter((r) => r.source === 'user').length,
      pinned: scoped.filter((r) => r.pinned).length,
    }),
    [scoped],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((r) => (filter === 'all' ? true : filter === 'pinned' ? r.pinned : r.source === filter))
      .filter((r) => !q || r.question.toLowerCase().includes(q) || r.answer.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }, [scoped, filter, query]);

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
      memory.reload();
      return true;
    } catch (err) {
      toast({ tone: 'error', title: failure, detail: errorText(err) });
      return false;
    }
  }

  async function confirmDelete() {
    if (!doomed) return;
    setDeleting(true);
    const ok = await run(() => deleteAnswer(doomed.id), 'Could not delete answer');
    setDeleting(false);
    if (ok) {
      setDoomed(null);
      toast({ tone: 'ok', title: 'Answer deleted' });
    }
  }

  if (memory.error?.kind === 'missing-table') return <SetupCard table="automation_memory" />;

  let body: ReactNode;
  if (memory.error) {
    body = (
      <EmptyState
        wolf="thinking"
        title="Could not load answers"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={memory.reload}>
            Retry
          </button>
        }
      >
        {memory.error.message}
      </EmptyState>
    );
  } else if (memory.loading) {
    body = (
      <div className="card listcard">
        <SkeletonCards count={4} check={false} />
      </div>
    );
  } else if (scoped.length === 0) {
    body = (
      <EmptyState
        wolf="thinking"
        title={job ? `No answers for ${job.company} yet` : 'No answers yet'}
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setTeaching(true)}>
            <IconPlus size={15} />
            New answer
          </button>
        }
      />
    );
  } else if (shown.length === 0) {
    body = <EmptyState compact wolf="thinking" title="No matches" />;
  } else {
    body = (
      <div className="card listcard">
      <ul className="memlist">
        <AnimatePresence>
        {shown.map((row, i) => (
          <MemoryCard
            key={row.id}
            index={i}
            row={row}
            now={now}
            onSave={(answer) => run(() => editAnswer(row.id, answer), 'Could not save answer')}
            onPin={() => void run(() => setPinned(row.id, !row.pinned), 'Could not update pin')}
            onDelete={() => setDoomed(row)}
            company={companyOf(row)}
          />
        ))}
        </AnimatePresence>
      </ul>
      </div>
    );
  }

  return (
    <div className="page page--memory">
      <div className="toolbar">
        <PillGroup<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'learned', label: 'Learned', count: counts.learned },
            { value: 'user', label: 'Mine', count: counts.user },
            { value: 'pinned', label: 'Pinned', count: counts.pinned, title: 'Used word for word' },
          ]}
        />
        <div className="toolbar__end">
          <label className="searchfield">
            <IconSearch size={15} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search questions and answers"
            />
          </label>
          <button type="button" className="btn btn--brand btn--sm" onClick={() => setTeaching(true)}>
            <IconPlus size={14} />
            New answer
          </button>
        </div>
      </div>

      {job ? (
        <div className="scopechip">
          <CompanyLogo name={job.company} domain={job.domain} size={22} />
          <span>
            Answers for <strong>{job.company}</strong>
          </span>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClearJob} aria-label="Show all answers" title="Show all">
            <IconX size={14} />
          </button>
        </div>
      ) : null}

      {body}

      <TeachDialog
        open={teaching}
        onClose={() => setTeaching(false)}
        onSaved={() => {
          setTeaching(false);
          memory.reload();
          toast({ tone: 'ok', title: 'Answer saved' });
        }}
      />

      <Dialog open={doomed !== null} onClose={() => setDoomed(null)} labelledBy="delete-title" className="smalldialog">
        <h2 id="delete-title" className="smalldialog__title">
          Delete this answer?
        </h2>
        <p className="smalldialog__text">
          {doomed ? <strong>{doomed.question}</strong> : null}
          <br />
          This cannot be undone.
        </p>
        <div className="smalldialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setDoomed(null)} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <span className="spinner" aria-hidden="true" /> : null}
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
